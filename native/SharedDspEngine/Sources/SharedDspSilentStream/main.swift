import AudioToolbox
import CoreAudio
import Foundation
import SharedDspEngine
import SharedDspRealtimeSupport

private struct Capabilities: Encodable {
    let offlineRender: Bool
    let realTimeOutput: Bool
    let deviceNotifications: Bool
    let maximumChannels: Int
    let supportedSampleRates: [Int]
}

private struct Handshake: Encodable {
    let protocolVersion: Int
    let dspContractVersion: Int
    let engineVersion: String
    let engineInstanceId: String
    let implementationFingerprint: String
    let capabilities: Capabilities
}

private struct Isolation: Encodable {
    let audioContent = "silence-only"
    let inputAccess = false
    let sourceMediaAccess = false
    let productionPlaybackConnected = false
}

private struct Lifecycle: Encodable {
    let startRequests: Int
    let starts: Int
    let stopRequests: Int
    let stops: Int
    let recoveryRequests: Int
    let recoveries: Int
    let invalidTransitions: Int
    let finalState: String
}

private struct Recovery: Encodable {
    let defaultDeviceListener: Bool
    let processorOverloadListener: Bool
    let simulatedDeviceChange: Bool
    let deviceChangesObserved: UInt64
}

private struct StreamMetrics: Encodable {
    let sampleRate: Double
    let channels: Int
    let maximumFramesPerSlice: UInt32
    let requestedDurationMs: Double
    let observedDurationMs: Double
    let callbacks: UInt64
    let renderedFrames: UInt64
    let frameMismatches: UInt64
    let deadlineMisses: UInt64
    let timingGapXruns: UInt64
    let renderErrors: UInt64
    let processorOverloads: UInt64
    let longestCallbackMs: Double
    let lockFreeTelemetry: Bool
}

private struct SilentStreamReport: Encodable {
    let schemaVersion = 1
    let capturedAt: String
    let mode = "silent-output-lab"
    let available: Bool
    let reasonCode: String?
    let handshake: Handshake
    let isolation = Isolation()
    let lifecycle: Lifecycle
    let recovery: Recovery
    let stream: StreamMetrics?
}

private enum EngineState: String {
    case stopped
    case starting
    case running
    case recovering
    case failed
}

private enum EngineError: Error, CustomStringConvertible {
    case invalidArgument(String)
    case invalidTransition(EngineState, String)
    case missingComponent
    case noOutputDevice
    case coreAudio(String, OSStatus)

    var description: String {
        switch self {
        case .invalidArgument(let detail): return detail
        case .invalidTransition(let state, let operation): return "invalid \(operation) while \(state.rawValue)"
        case .missingComponent: return "default output component unavailable"
        case .noOutputDevice: return "no output device"
        case .coreAudio(let operation, let status): return "\(operation) failed (\(status))"
        }
    }
}

private func requireNoError(_ status: OSStatus, _ operation: String) throws {
    guard status == noErr else { throw EngineError.coreAudio(operation, status) }
}

private func defaultOutputDevice() throws -> AudioObjectID {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var device = kAudioObjectUnknown
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    try requireNoError(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device), "read default output device")
    guard device != kAudioObjectUnknown else { throw EngineError.noOutputDevice }
    return device
}

private func nominalSampleRate(for device: AudioObjectID) throws -> Double {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyNominalSampleRate,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var sampleRate: Float64 = 0
    var size = UInt32(MemoryLayout<Float64>.size)
    try requireNoError(AudioObjectGetPropertyData(device, &address, 0, nil, &size, &sampleRate), "read nominal sample rate")
    return sampleRate
}

private final class SilentOutputEngine {
    private(set) var state: EngineState = .stopped
    private(set) var startRequests = 0
    private(set) var starts = 0
    private(set) var stopRequests = 0
    private(set) var stops = 0
    private(set) var recoveryRequests = 0
    private(set) var recoveries = 0
    private(set) var invalidTransitions = 0
    private(set) var defaultListenerEverRegistered = false
    private(set) var overloadListenerEverRegistered = false
    private(set) var sampleRate = 0.0
    private(set) var channels = 0
    private(set) var maximumFramesPerSlice: UInt32 = 0

    let metrics: OpaquePointer
    private var audioUnit: AudioUnit?
    private var outputDevice = kAudioObjectUnknown
    private var defaultListenerRegistered = false
    private var overloadListenerRegistered = false

    init(metrics: OpaquePointer) {
        self.metrics = metrics
    }

    private func reject(_ operation: String) throws -> Never {
        invalidTransitions += 1
        throw EngineError.invalidTransition(state, operation)
    }

    private func installDefaultListener() throws {
        guard !defaultListenerRegistered else { return }
        try requireNoError(ps_install_default_output_listener(metrics), "install default-output listener")
        defaultListenerRegistered = true
        defaultListenerEverRegistered = true
    }

    private func removeDefaultListener() {
        guard defaultListenerRegistered else { return }
        ps_remove_default_output_listener(metrics)
        defaultListenerRegistered = false
    }

    private func installOverloadListener() throws {
        guard outputDevice != kAudioObjectUnknown else { throw EngineError.noOutputDevice }
        try requireNoError(ps_install_processor_overload_listener(outputDevice, metrics), "install processor-overload listener")
        overloadListenerRegistered = true
        overloadListenerEverRegistered = true
    }

    private func removeOverloadListener() {
        guard overloadListenerRegistered, outputDevice != kAudioObjectUnknown else { return }
        ps_remove_processor_overload_listener(outputDevice, metrics)
        overloadListenerRegistered = false
    }

    private func buildAndStartUnit() throws {
        outputDevice = try defaultOutputDevice()
        var description = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_DefaultOutput,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        )
        guard let component = AudioComponentFindNext(nil, &description) else { throw EngineError.missingComponent }
        var createdUnit: AudioUnit?
        try requireNoError(AudioComponentInstanceNew(component, &createdUnit), "create default-output unit")
        guard let unit = createdUnit else { throw EngineError.missingComponent }
        audioUnit = unit

        do {
            try requireNoError(ps_install_silence_render_callback(unit, metrics), "install silence callback")

            var format = AudioStreamBasicDescription()
            var formatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
            try requireNoError(AudioUnitGetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &format, &formatSize), "read output stream format")
            let hardwareSampleRate = try nominalSampleRate(for: outputDevice)
            if hardwareSampleRate.isFinite, hardwareSampleRate > 0, format.mSampleRate != hardwareSampleRate {
                format.mSampleRate = hardwareSampleRate
                try requireNoError(AudioUnitSetProperty(
                    unit,
                    kAudioUnitProperty_StreamFormat,
                    kAudioUnitScope_Input,
                    0,
                    &format,
                    UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
                ), "align output stream sample rate")
            }
            sampleRate = format.mSampleRate
            channels = Int(format.mChannelsPerFrame)

            var maximumFrames: UInt32 = 0
            var maximumFramesSize = UInt32(MemoryLayout<UInt32>.size)
            try requireNoError(AudioUnitGetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maximumFrames, &maximumFramesSize), "read maximum frames per slice")
            maximumFramesPerSlice = maximumFrames

            ps_realtime_metrics_configure(metrics, maximumFrames, sampleRate)
            try installOverloadListener()
            try requireNoError(AudioUnitInitialize(unit), "initialize default-output unit")
            try requireNoError(AudioOutputUnitStart(unit), "start default-output unit")
        } catch {
            AudioUnitUninitialize(unit)
            removeOverloadListener()
            AudioComponentInstanceDispose(unit)
            audioUnit = nil
            outputDevice = kAudioObjectUnknown
            throw error
        }
    }

    private func stopAndDisposeUnit() throws {
        guard let unit = audioUnit else { return }
        try requireNoError(AudioOutputUnitStop(unit), "stop default-output unit")
        try requireNoError(AudioUnitUninitialize(unit), "uninitialize default-output unit")
        removeOverloadListener()
        try requireNoError(AudioComponentInstanceDispose(unit), "dispose default-output unit")
        audioUnit = nil
        outputDevice = kAudioObjectUnknown
        ps_realtime_metrics_reset_timing(metrics)
    }

    func start() throws {
        guard state == .stopped else { try reject("start") }
        startRequests += 1
        state = .starting
        do {
            try installDefaultListener()
            try buildAndStartUnit()
            starts += 1
            state = .running
        } catch {
            state = .failed
            removeDefaultListener()
            throw error
        }
    }

    func recover() throws {
        guard state == .running else { try reject("recover") }
        recoveryRequests += 1
        state = .recovering
        do {
            stopRequests += 1
            try stopAndDisposeUnit()
            stops += 1
            startRequests += 1
            try buildAndStartUnit()
            starts += 1
            recoveries += 1
            state = .running
        } catch {
            state = .failed
            removeDefaultListener()
            throw error
        }
    }

    func stop() throws {
        guard state == .running else { try reject("stop") }
        stopRequests += 1
        do {
            try stopAndDisposeUnit()
            stops += 1
            removeDefaultListener()
            state = .stopped
        } catch {
            state = .failed
            removeDefaultListener()
            throw error
        }
    }

    func forceCleanup() {
        if let unit = audioUnit {
            AudioOutputUnitStop(unit)
            AudioUnitUninitialize(unit)
            removeOverloadListener()
            AudioComponentInstanceDispose(unit)
            audioUnit = nil
        }
        removeDefaultListener()
        outputDevice = kAudioObjectUnknown
    }
}

private func argumentValue(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}

private func boundedMilliseconds(_ name: String, default fallback: Double, minimum: Double, maximum: Double) throws -> Double {
    guard let raw = argumentValue(name) else { return fallback }
    guard let value = Double(raw), value.isFinite, value >= minimum, value <= maximum else {
        throw EngineError.invalidArgument("\(name) must be between \(Int(minimum)) and \(Int(maximum)) milliseconds")
    }
    return value
}

private func writeReport(_ report: SilentStreamReport) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try FileHandle.standardOutput.write(contentsOf: encoder.encode(report))
    try FileHandle.standardOutput.write(contentsOf: Data("\n".utf8))
}

do {
    let fingerprint = ProcessInfo.processInfo.environment["PROJECT_SEQUENCER_ENGINE_FINGERPRINT"] ?? ""
    guard fingerprint.range(of: "^[0-9a-fA-F]{16,128}$", options: .regularExpression) != nil else {
        throw EngineError.invalidArgument("PROJECT_SEQUENCER_ENGINE_FINGERPRINT is missing or invalid")
    }
    let durationMs = try boundedMilliseconds("--duration-ms", default: 750, minimum: 100, maximum: 5_000)
    let simulateAtMs = try boundedMilliseconds("--simulate-device-change-ms", default: 250, minimum: 50, maximum: 4_000)
    guard simulateAtMs < durationMs - 50 else { throw EngineError.invalidArgument("simulated device change must leave at least 50 milliseconds for recovery") }

    do {
        _ = try defaultOutputDevice()
    } catch EngineError.noOutputDevice {
        let handshake = Handshake(
            protocolVersion: 1,
            dspContractVersion: sharedDspContractVersion,
            engineVersion: "0.3.0",
            engineInstanceId: UUID().uuidString.lowercased(),
            implementationFingerprint: fingerprint.lowercased(),
            capabilities: Capabilities(offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [])
        )
        try writeReport(SilentStreamReport(
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            available: false,
            reasonCode: "no-output-device",
            handshake: handshake,
            lifecycle: Lifecycle(startRequests: 0, starts: 0, stopRequests: 0, stops: 0, recoveryRequests: 0, recoveries: 0, invalidTransitions: 0, finalState: "stopped"),
            recovery: Recovery(defaultDeviceListener: false, processorOverloadListener: false, simulatedDeviceChange: false, deviceChangesObserved: 0),
            stream: nil
        ))
        exit(0)
    }
    guard let metrics = ps_realtime_metrics_create() else { throw EngineError.invalidArgument("could not allocate control-thread metrics") }
    defer { ps_realtime_metrics_destroy(metrics) }

    let engine = SilentOutputEngine(metrics: metrics)
    defer { engine.forceCleanup() }
    let startedAt = Date()
    var simulated = false
    var handledDeviceChanges: UInt64 = 0

    try engine.start()

    while Date().timeIntervalSince(startedAt) * 1_000 < durationMs {
        let elapsedMs = Date().timeIntervalSince(startedAt) * 1_000
        if !simulated && elapsedMs >= simulateAtMs {
            ps_realtime_metrics_record_device_change(metrics)
            simulated = true
        }
        let observedChanges = ps_realtime_device_changes(metrics)
        if observedChanges > handledDeviceChanges {
            handledDeviceChanges = observedChanges
            try engine.recover()
            handledDeviceChanges = ps_realtime_device_changes(metrics)
        }
        Thread.sleep(forTimeInterval: 0.005)
    }
    try engine.stop()

    let observedDurationMs = Date().timeIntervalSince(startedAt) * 1_000
    let roundedRate = Int(engine.sampleRate.rounded())
    let knownRates = [44_100, 48_000, 88_200, 96_000, 176_400, 192_000]
    let handshake = Handshake(
        protocolVersion: 1,
        dspContractVersion: sharedDspContractVersion,
        engineVersion: "0.3.0",
        engineInstanceId: UUID().uuidString.lowercased(),
        implementationFingerprint: fingerprint.lowercased(),
        capabilities: Capabilities(
            offlineRender: true,
            realTimeOutput: true,
            deviceNotifications: true,
            maximumChannels: min(32, max(1, engine.channels)),
            supportedSampleRates: knownRates.contains(roundedRate) ? [roundedRate] : []
        )
    )
    try writeReport(SilentStreamReport(
        capturedAt: ISO8601DateFormatter().string(from: Date()),
        available: true,
        reasonCode: nil,
        handshake: handshake,
        lifecycle: Lifecycle(
            startRequests: engine.startRequests,
            starts: engine.starts,
            stopRequests: engine.stopRequests,
            stops: engine.stops,
            recoveryRequests: engine.recoveryRequests,
            recoveries: engine.recoveries,
            invalidTransitions: engine.invalidTransitions,
            finalState: engine.state.rawValue
        ),
        recovery: Recovery(
            defaultDeviceListener: engine.defaultListenerEverRegistered,
            processorOverloadListener: engine.overloadListenerEverRegistered,
            simulatedDeviceChange: simulated,
            deviceChangesObserved: ps_realtime_device_changes(metrics)
        ),
        stream: StreamMetrics(
            sampleRate: engine.sampleRate,
            channels: engine.channels,
            maximumFramesPerSlice: engine.maximumFramesPerSlice,
            requestedDurationMs: durationMs,
            observedDurationMs: observedDurationMs,
            callbacks: ps_realtime_callbacks(metrics),
            renderedFrames: ps_realtime_rendered_frames(metrics),
            frameMismatches: ps_realtime_frame_mismatches(metrics),
            deadlineMisses: ps_realtime_deadline_misses(metrics),
            timingGapXruns: ps_realtime_timing_gap_xruns(metrics),
            renderErrors: ps_realtime_render_errors(metrics),
            processorOverloads: ps_realtime_processor_overloads(metrics),
            longestCallbackMs: ps_realtime_longest_callback_ms(metrics),
            lockFreeTelemetry: ps_realtime_metrics_are_lock_free(metrics) == 1
        )
    ))
} catch {
    FileHandle.standardError.write(Data("shared-dsp-silent-stream: \(error)\n".utf8))
    exit(1)
}
