import AudioToolbox
import CoreAudio
import CryptoKit
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
    let shadowInput: String
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

private struct ShadowEvidence: Encodable {
    let fixtureId: String
    let fixtureSampleRate: Int
    let fixtureFrames: Int
    let generatedInput: Bool
    let checksumAlgorithm: String
    let expectedSha256: String
    let actualSha256: String
    let checksumMatch: Bool
    let processedCallbacks: UInt64
    let processedFrames: UInt64
    let kernelProcessedFrames: Int
    let capturedFrames: Int
    let recoveredSamples: Int
    let failures: UInt64
    let hardwareOutputZeroFilledAfterShadow: Bool
    let parameterHandoff: ParameterHandoffEvidence
}

private struct ParameterHandoffEvidence: Encodable {
    let mailbox = "atomic-u64-generation-float32"
    let lockFree: Bool
    let publishedUpdates: UInt64
    let appliedUpdates: Int
    let lastPublishedGeneration: UInt32
    let lastAppliedGeneration: UInt32
    let lastPublishedOutputGainDb: Double
    let lastAppliedOutputGainDb: Double
    let coherent: Bool
}

private struct StressEvidence: Encodable {
    let targetDurationMs: Double
    let parameterChangesRequested: Int
    let parameterChangesCompleted: Int
    let simulatedRecoveryAtMs: Double
    let systemAudioConfigurationChanged: Bool
}

private struct SilentStreamReport: Encodable {
    let schemaVersion = 1
    let capturedAt: String
    let mode: String
    let available: Bool
    let reasonCode: String?
    let handshake: Handshake
    let isolation: Isolation
    let lifecycle: Lifecycle
    let recovery: Recovery
    let stream: StreamMetrics?
    let shadow: ShadowEvidence?
    let stress: StressEvidence?
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

private final class GoldenShadowProcessor {
    static let fixtureId = "dual-tone-gain"
    static let fixtureSampleRate = 48_000
    static let fixtureFrames = 4_096
    static let maximumCallbackFrames = 4_096
    static let initialOutputGainDb: Float = -0.75
    static let expectedSha256 = "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995"

    private let fixtureInput: [[Float]]
    private var scratchInput = [[Float](repeating: 0, count: maximumCallbackFrames), [Float](repeating: 0, count: maximumCallbackFrames)]
    private var scratchOutput = [[Float](repeating: 0, count: maximumCallbackFrames), [Float](repeating: 0, count: maximumCallbackFrames)]
    private var capturedOutput = [[Float](repeating: 0, count: fixtureFrames), [Float](repeating: 0, count: fixtureFrames)]
    private let kernel: SharedDspKernel
    private var fixtureCursor = 0
    private(set) var capturedFrames = 0
    private(set) var appliedUpdates = 0
    private(set) var lastAppliedGeneration: UInt32 = 0
    private(set) var lastAppliedOutputGainDb = Double(GoldenShadowProcessor.initialOutputGainDb)

    init() {
        var left = [Float](repeating: 0, count: Self.fixtureFrames)
        var right = [Float](repeating: 0, count: Self.fixtureFrames)
        for frame in 0..<Self.fixtureFrames {
            left[frame] = Float(0.27 * sin((2 * Double.pi * 997 * Double(frame)) / Double(Self.fixtureSampleRate)))
            right[frame] = Float(0.27 * sin((2 * Double.pi * 503 * Double(frame)) / Double(Self.fixtureSampleRate)))
        }
        fixtureInput = [left, right]
        kernel = SharedDspKernel(
            sampleRate: Double(Self.fixtureSampleRate),
            settings: Self.settings(outputGainDb: Double(Self.initialOutputGainDb))
        )
        // Force any lazy Swift/Array setup onto the control thread before the
        // AudioUnit owns this processor. Reset is also control-thread-only.
        scratchInput[0][0] = fixtureInput[0][0]
        scratchInput[1][0] = fixtureInput[1][0]
        kernel.process(inputChannels: scratchInput, outputChannels: &scratchOutput, startFrame: 0, frameCount: 1)
        kernel.reset()
    }

    func process(frameCount: UInt32, parameterWord: UInt64) -> Bool {
        let count = Int(frameCount)
        let generation = UInt32(parameterWord >> 32)
        let outputGainDb = Float(bitPattern: UInt32(parameterWord & 0xffff_ffff))
        guard count > 0,
              count <= Self.maximumCallbackFrames,
              generation > 0,
              outputGainDb.isFinite,
              outputGainDb >= -48,
              outputGainDb <= 12,
              generation >= lastAppliedGeneration else { return false }

        if generation > lastAppliedGeneration {
            kernel.setSettings(Self.settings(outputGainDb: Double(outputGainDb)))
            lastAppliedGeneration = generation
            lastAppliedOutputGainDb = Double(outputGainDb)
            appliedUpdates += 1
        }

        for frame in 0..<count {
            scratchInput[0][frame] = fixtureInput[0][fixtureCursor]
            scratchInput[1][frame] = fixtureInput[1][fixtureCursor]
            fixtureCursor += 1
            if fixtureCursor == Self.fixtureFrames { fixtureCursor = 0 }
        }
        kernel.process(inputChannels: scratchInput, outputChannels: &scratchOutput, startFrame: 0, frameCount: count)

        let captureCount = min(count, Self.fixtureFrames - capturedFrames)
        if captureCount > 0 {
            for frame in 0..<captureCount {
                capturedOutput[0][capturedFrames + frame] = scratchOutput[0][frame]
                capturedOutput[1][capturedFrames + frame] = scratchOutput[1][frame]
            }
            capturedFrames += captureCount
        }
        return true
    }

    func sha256() -> String {
        guard capturedFrames == Self.fixtureFrames else { return "" }
        var bytes = [UInt8]()
        bytes.reserveCapacity(8 + 2 * Self.fixtureFrames * MemoryLayout<UInt32>.size)
        appendLittleEndian(UInt32(2), to: &bytes)
        appendLittleEndian(UInt32(Self.fixtureFrames), to: &bytes)
        for channel in capturedOutput {
            for sample in channel { appendLittleEndian(sample.bitPattern, to: &bytes) }
        }
        return SHA256.hash(data: Data(bytes)).map { String(format: "%02x", $0) }.joined()
    }

    var processedFrames: Int { kernel.metrics.processedFrames }
    var recoveredSamples: Int { kernel.metrics.recoveredSamples }

    private static func settings(outputGainDb: Double) -> SharedDspSettings {
        SharedDspSettings(inputGainDb: 3.5, outputGainDb: outputGainDb, peakGuardEnabled: false, smoothingMs: 0)
    }

    private func appendLittleEndian(_ value: UInt32, to bytes: inout [UInt8]) {
        bytes.append(UInt8(value & 0xff))
        bytes.append(UInt8((value >> 8) & 0xff))
        bytes.append(UInt8((value >> 16) & 0xff))
        bytes.append(UInt8((value >> 24) & 0xff))
    }
}

@_cdecl("ps_shared_dsp_shadow_process")
func psSharedDspShadowProcess(_ context: UnsafeMutableRawPointer?, _ frameCount: UInt32, _ parameterWord: UInt64) -> Int32 {
    guard let context else { return 1 }
    let processor = Unmanaged<GoldenShadowProcessor>.fromOpaque(context).takeUnretainedValue()
    return processor.process(frameCount: frameCount, parameterWord: parameterWord) ? 0 : 1
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
    private(set) var lastPublishedGeneration: UInt32 = 0
    private(set) var lastPublishedOutputGainDb = Double(GoldenShadowProcessor.initialOutputGainDb)

    let metrics: OpaquePointer
    let shadowProcessor: GoldenShadowProcessor?
    private var audioUnit: AudioUnit?
    private var outputDevice = kAudioObjectUnknown
    private var defaultListenerRegistered = false
    private var overloadListenerRegistered = false

    init(metrics: OpaquePointer, shadowEnabled: Bool) {
        self.metrics = metrics
        shadowProcessor = shadowEnabled ? GoldenShadowProcessor() : nil
        let context = shadowProcessor.map { Unmanaged.passUnretained($0).toOpaque() }
        ps_realtime_metrics_configure_shadow(metrics, context)
        if shadowProcessor != nil {
            lastPublishedGeneration = 1
            ps_realtime_publish_shadow_output_gain(metrics, lastPublishedGeneration, GoldenShadowProcessor.initialOutputGainDb)
        }
    }

    func publishShadowOutputGain(generation: UInt32, outputGainDb: Float) throws {
        guard shadowProcessor != nil else { throw EngineError.invalidArgument("shadow parameter mailbox is disabled") }
        guard state == .running else { throw EngineError.invalidTransition(state, "publish shadow parameter") }
        guard generation > lastPublishedGeneration, outputGainDb.isFinite, outputGainDb >= -48, outputGainDb <= 12 else {
            throw EngineError.invalidArgument("shadow parameter update is invalid")
        }
        ps_realtime_publish_shadow_output_gain(metrics, generation, outputGainDb)
        lastPublishedGeneration = generation
        lastPublishedOutputGainDb = Double(outputGainDb)
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
    let stressEnabled = CommandLine.arguments.contains("--stress")
    let durationMs = try boundedMilliseconds("--duration-ms", default: stressEnabled ? 10_000 : 750, minimum: 100, maximum: 60_000)
    let simulateAtMs = try boundedMilliseconds("--simulate-device-change-ms", default: stressEnabled ? 5_000 : 250, minimum: 50, maximum: 59_000)
    let shadowEnabled = CommandLine.arguments.contains("--shadow") || stressEnabled
    let reportMode = stressEnabled ? "muted-shadow-stress-lab" : shadowEnabled ? "muted-shadow-output-lab" : "silent-output-lab"
    let isolation = Isolation(shadowInput: shadowEnabled ? "generated-golden-only" : "disabled")
    guard simulateAtMs < durationMs - 50 else { throw EngineError.invalidArgument("simulated device change must leave at least 50 milliseconds for recovery") }
    let firstParameterChangeAtMs = durationMs * 0.3
    let secondParameterChangeAtMs = durationMs * 0.7

    let startingDefaultOutput: AudioObjectID
    let startingNominalSampleRate: Double
    do {
        startingDefaultOutput = try defaultOutputDevice()
        startingNominalSampleRate = try nominalSampleRate(for: startingDefaultOutput)
    } catch EngineError.noOutputDevice {
        let handshake = Handshake(
            protocolVersion: 1,
            dspContractVersion: sharedDspContractVersion,
            engineVersion: "0.5.0",
            engineInstanceId: UUID().uuidString.lowercased(),
            implementationFingerprint: fingerprint.lowercased(),
            capabilities: Capabilities(offlineRender: true, realTimeOutput: true, deviceNotifications: true, maximumChannels: 2, supportedSampleRates: [])
        )
        try writeReport(SilentStreamReport(
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            mode: reportMode,
            available: false,
            reasonCode: "no-output-device",
            handshake: handshake,
            isolation: isolation,
            lifecycle: Lifecycle(startRequests: 0, starts: 0, stopRequests: 0, stops: 0, recoveryRequests: 0, recoveries: 0, invalidTransitions: 0, finalState: "stopped"),
            recovery: Recovery(defaultDeviceListener: false, processorOverloadListener: false, simulatedDeviceChange: false, deviceChangesObserved: 0),
            stream: nil,
            shadow: nil,
            stress: stressEnabled ? StressEvidence(targetDurationMs: durationMs, parameterChangesRequested: 2, parameterChangesCompleted: 0, simulatedRecoveryAtMs: simulateAtMs, systemAudioConfigurationChanged: false) : nil
        ))
        exit(0)
    }
    guard let metrics = ps_realtime_metrics_create() else { throw EngineError.invalidArgument("could not allocate control-thread metrics") }
    defer { ps_realtime_metrics_destroy(metrics) }

    let engine = SilentOutputEngine(metrics: metrics, shadowEnabled: shadowEnabled)
    defer { engine.forceCleanup() }
    let startedAt = Date()
    var simulated = false
    var handledDeviceChanges: UInt64 = 0
    var parameterChangesCompleted = 0

    try engine.start()

    while Date().timeIntervalSince(startedAt) * 1_000 < durationMs {
        let elapsedMs = Date().timeIntervalSince(startedAt) * 1_000
        if stressEnabled && parameterChangesCompleted == 0 && elapsedMs >= firstParameterChangeAtMs {
            try engine.publishShadowOutputGain(generation: 2, outputGainDb: -6)
            parameterChangesCompleted = 1
        }
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
        if stressEnabled && parameterChangesCompleted == 1 && elapsedMs >= secondParameterChangeAtMs {
            try engine.publishShadowOutputGain(generation: 3, outputGainDb: GoldenShadowProcessor.initialOutputGainDb)
            parameterChangesCompleted = 2
        }
        Thread.sleep(forTimeInterval: 0.005)
    }
    try engine.stop()
    let systemAudioConfigurationChanged: Bool
    if stressEnabled {
        let endingDefaultOutput = try defaultOutputDevice()
        let endingNominalSampleRate = try nominalSampleRate(for: endingDefaultOutput)
        systemAudioConfigurationChanged = endingDefaultOutput != startingDefaultOutput
            || endingNominalSampleRate != startingNominalSampleRate
    } else {
        systemAudioConfigurationChanged = false
    }

    let observedDurationMs = Date().timeIntervalSince(startedAt) * 1_000
    let roundedRate = Int(engine.sampleRate.rounded())
    let knownRates = [44_100, 48_000, 88_200, 96_000, 176_400, 192_000]
    let handshake = Handshake(
        protocolVersion: 1,
        dspContractVersion: sharedDspContractVersion,
        engineVersion: "0.5.0",
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
    let shadowEvidence: ShadowEvidence?
    if let processor = engine.shadowProcessor {
        let actualSha256 = processor.sha256()
        let parameterWord = ps_realtime_shadow_parameter_word(metrics)
        let publishedGeneration = UInt32(parameterWord >> 32)
        let publishedOutputGainDb = Double(Float(bitPattern: UInt32(parameterWord & 0xffff_ffff)))
        let parameterCoherent = publishedGeneration == engine.lastPublishedGeneration
            && publishedGeneration == processor.lastAppliedGeneration
            && publishedOutputGainDb == engine.lastPublishedOutputGainDb
            && publishedOutputGainDb == processor.lastAppliedOutputGainDb
            && ps_realtime_shadow_parameter_publishes(metrics) == UInt64(processor.appliedUpdates)
        shadowEvidence = ShadowEvidence(
            fixtureId: GoldenShadowProcessor.fixtureId,
            fixtureSampleRate: GoldenShadowProcessor.fixtureSampleRate,
            fixtureFrames: GoldenShadowProcessor.fixtureFrames,
            generatedInput: true,
            checksumAlgorithm: "sha256-float32le-v1",
            expectedSha256: GoldenShadowProcessor.expectedSha256,
            actualSha256: actualSha256,
            checksumMatch: actualSha256 == GoldenShadowProcessor.expectedSha256,
            processedCallbacks: ps_realtime_shadow_callbacks(metrics),
            processedFrames: ps_realtime_shadow_frames(metrics),
            kernelProcessedFrames: processor.processedFrames,
            capturedFrames: processor.capturedFrames,
            recoveredSamples: processor.recoveredSamples,
            failures: ps_realtime_shadow_failures(metrics),
            hardwareOutputZeroFilledAfterShadow: true,
            parameterHandoff: ParameterHandoffEvidence(
                lockFree: ps_realtime_shadow_parameter_word_is_lock_free(metrics) == 1,
                publishedUpdates: ps_realtime_shadow_parameter_publishes(metrics),
                appliedUpdates: processor.appliedUpdates,
                lastPublishedGeneration: publishedGeneration,
                lastAppliedGeneration: processor.lastAppliedGeneration,
                lastPublishedOutputGainDb: publishedOutputGainDb,
                lastAppliedOutputGainDb: processor.lastAppliedOutputGainDb,
                coherent: parameterCoherent
            )
        )
    } else {
        shadowEvidence = nil
    }
    try writeReport(SilentStreamReport(
        capturedAt: ISO8601DateFormatter().string(from: Date()),
        mode: reportMode,
        available: true,
        reasonCode: nil,
        handshake: handshake,
        isolation: isolation,
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
        ),
        shadow: shadowEvidence,
        stress: stressEnabled ? StressEvidence(
            targetDurationMs: durationMs,
            parameterChangesRequested: 2,
            parameterChangesCompleted: parameterChangesCompleted,
            simulatedRecoveryAtMs: simulateAtMs,
            systemAudioConfigurationChanged: systemAudioConfigurationChanged
        ) : nil
    ))
} catch {
    FileHandle.standardError.write(Data("shared-dsp-silent-stream: \(error)\n".utf8))
    exit(1)
}
