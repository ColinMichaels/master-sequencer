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
    let audioContent: String
    let inputAccess = false
    let sourceMediaAccess = false
    let productionPlaybackConnected = false
    let shadowInput: String
}

private struct PreviewEvidence: Encodable {
    let authorization = "explicit-cli-double-opt-in"
    let source = "generated-golden-only"
    let hardwareOutput = "attenuated-generated-fixture"
    let gainDb: Double
    let requestedDurationMs: Double
    let maximumDurationMs: Double
    let fadeMs: Double
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
    let sampleRateListener: Bool
    let simulatedDeviceChange: Bool
    let deviceChangesObserved: UInt64
    let sampleRateChangesObserved: UInt64
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

private struct ControlledDefaultOutputEvidence: Encodable {
    let available: Bool
    let targetKind: String?
    let switchAttempted: Bool
    let switchObserved: Bool
    let restorationAttempted: Bool
    let restorationObserved: Bool
}

private struct SampleRateTransitionEvidence: Encodable {
    let available: Bool
    let originalHz: Int
    let targetHz: Int?
    let changeAttempted: Bool
    let changeObserved: Bool
    let restorationAttempted: Bool
    let restorationObserved: Bool
}

private struct PhysicalDeviceLossEvidence: Encodable {
    let removablePhysicalOutputsAvailable: Int
    let removalAttempted: Bool
    let lossObserved: Bool
    let reconnectionObserved: Bool
    let reasonCode: String
}

private struct HardwareTransitionEvidence: Encodable {
    let authorization = "explicit-cli"
    let controlledDefaultOutput: ControlledDefaultOutputEvidence
    let sampleRate: SampleRateTransitionEvidence
    let physicalDeviceLoss: PhysicalDeviceLossEvidence
    let baselineDefaultOutputRestored: Bool
    let baselineSampleRateRestored: Bool
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
    let hardwareTransitions: HardwareTransitionEvidence?
    let preview: PreviewEvidence?
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

private struct OutputDeviceDescriptor {
    let id: AudioObjectID
    let transport: UInt32
    let channels: Int
    let alive: Bool

    var kind: String {
        switch transport {
        case kAudioDeviceTransportTypeBuiltIn: return "built-in"
        case kAudioDeviceTransportTypeVirtual: return "virtual"
        case kAudioDeviceTransportTypeAggregate: return "aggregate"
        case kAudioDeviceTransportTypeUSB: return "usb"
        case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE: return "bluetooth"
        case kAudioDeviceTransportTypeDisplayPort: return "display-port"
        default: return "other"
        }
    }

    var isPhysical: Bool { !["virtual", "aggregate"].contains(kind) }
    var isRemovablePhysical: Bool { ["usb", "bluetooth", "display-port", "other"].contains(kind) }
}

private func scalarProperty<T>(_ object: AudioObjectID, selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, as: T.Type) throws -> T {
    var address = AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    let value = UnsafeMutablePointer<T>.allocate(capacity: 1)
    defer { value.deallocate() }
    var size = UInt32(MemoryLayout<T>.size)
    try requireNoError(AudioObjectGetPropertyData(object, &address, 0, nil, &size, value), "read Core Audio property")
    return value.pointee
}

private func outputChannelCount(for device: AudioObjectID) -> Int {
    var address = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreamConfiguration, mScope: kAudioDevicePropertyScopeOutput, mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(device, &address, 0, nil, &size) == noErr, size > 0 else { return 0 }
    let storage = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { storage.deallocate() }
    guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, storage) == noErr else { return 0 }
    return UnsafeMutableAudioBufferListPointer(storage.assumingMemoryBound(to: AudioBufferList.self)).reduce(0) { $0 + Int($1.mNumberChannels) }
}

private func outputDevices() throws -> [OutputDeviceDescriptor] {
    let systemObject = AudioObjectID(kAudioObjectSystemObject)
    var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    try requireNoError(AudioObjectGetPropertyDataSize(systemObject, &address, 0, nil, &size), "read Core Audio device-list size")
    var identifiers = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard !identifiers.isEmpty else { return [] }
    let status = identifiers.withUnsafeMutableBytes { bytes in
        AudioObjectGetPropertyData(systemObject, &address, 0, nil, &size, bytes.baseAddress!)
    }
    try requireNoError(status, "read Core Audio device list")
    return try identifiers.compactMap { device in
        let channels = outputChannelCount(for: device)
        guard channels > 0 else { return nil }
        let transport: UInt32 = try scalarProperty(device, selector: kAudioDevicePropertyTransportType, as: UInt32.self)
        let alive: UInt32 = try scalarProperty(device, selector: kAudioDevicePropertyDeviceIsAlive, as: UInt32.self)
        return OutputDeviceDescriptor(id: device, transport: transport, channels: channels, alive: alive != 0)
    }
}

private func availableNominalSampleRates(for device: AudioObjectID) throws -> [Double] {
    var address = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyAvailableNominalSampleRates, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    try requireNoError(AudioObjectGetPropertyDataSize(device, &address, 0, nil, &size), "read available sample-rate size")
    var ranges = [AudioValueRange](repeating: AudioValueRange(), count: Int(size) / MemoryLayout<AudioValueRange>.size)
    guard !ranges.isEmpty else { return [] }
    let status = ranges.withUnsafeMutableBytes { bytes in
        AudioObjectGetPropertyData(device, &address, 0, nil, &size, bytes.baseAddress!)
    }
    try requireNoError(status, "read available sample rates")
    let preferred = [44_100.0, 48_000.0, 88_200.0, 96_000.0, 176_400.0, 192_000.0]
    return preferred.filter { rate in ranges.contains { rate >= $0.mMinimum && rate <= $0.mMaximum } }
}

private func propertyIsSettable(_ object: AudioObjectID, selector: AudioObjectPropertySelector) -> Bool {
    var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var settable = DarwinBoolean(false)
    return AudioObjectIsPropertySettable(object, &address, &settable) == noErr && settable.boolValue
}

private func setDefaultOutputDevice(_ device: AudioObjectID) throws {
    var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultOutputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var value = device
    try requireNoError(AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, UInt32(MemoryLayout<AudioObjectID>.size), &value), "set default output device")
}

private func setNominalSampleRate(_ sampleRate: Double, for device: AudioObjectID) throws {
    var address = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyNominalSampleRate, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var value = Float64(sampleRate)
    try requireNoError(AudioObjectSetPropertyData(device, &address, 0, nil, UInt32(MemoryLayout<Float64>.size), &value), "set nominal sample rate")
}

private func waitUntil(timeout: TimeInterval = 2, _ condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if condition() { return true }
        Thread.sleep(forTimeInterval: 0.01)
    }
    return condition()
}

private final class HardwareTransitionController {
    let baselineDevice: AudioObjectID
    let baselineSampleRate: Double
    let alternateDevice: OutputDeviceDescriptor?
    let targetSampleRate: Double?
    let removablePhysicalOutputs: Int
    private(set) var switchAttempted = false
    private(set) var switchObserved = false
    private(set) var defaultRestorationAttempted = false
    private(set) var defaultRestorationObserved = false
    private(set) var rateChangeAttempted = false
    private(set) var rateChangeObserved = false
    private(set) var rateRestorationAttempted = false
    private(set) var rateRestorationObserved = false

    init(baselineDevice: AudioObjectID, baselineSampleRate: Double) throws {
        self.baselineDevice = baselineDevice
        self.baselineSampleRate = baselineSampleRate
        let devices = try outputDevices().filter(\.alive)
        let candidates = devices.filter { $0.id != baselineDevice }
        alternateDevice = candidates.sorted {
            if $0.isPhysical != $1.isPhysical { return $0.isPhysical && !$1.isPhysical }
            if ($0.channels == 2) != ($1.channels == 2) { return $0.channels == 2 }
            return $0.id < $1.id
        }.first
        removablePhysicalOutputs = devices.filter(\.isRemovablePhysical).count
        let rates = try availableNominalSampleRates(for: baselineDevice)
        targetSampleRate = rates.first { abs($0 - baselineSampleRate) > 0.5 }
    }

    func switchToAlternate() {
        guard let alternateDevice,
              propertyIsSettable(AudioObjectID(kAudioObjectSystemObject), selector: kAudioHardwarePropertyDefaultOutputDevice) else { return }
        switchAttempted = true
        do {
            try setDefaultOutputDevice(alternateDevice.id)
            switchObserved = waitUntil { (try? defaultOutputDevice()) == alternateDevice.id }
        } catch {}
    }

    func restoreDefault() {
        guard switchAttempted else { return }
        defaultRestorationAttempted = true
        if (try? defaultOutputDevice()) == baselineDevice {
            defaultRestorationObserved = true
            return
        }
        do {
            try setDefaultOutputDevice(baselineDevice)
            defaultRestorationObserved = waitUntil { (try? defaultOutputDevice()) == self.baselineDevice }
        } catch {}
    }

    func changeSampleRate() {
        guard let targetSampleRate,
              propertyIsSettable(baselineDevice, selector: kAudioDevicePropertyNominalSampleRate) else { return }
        rateChangeAttempted = true
        do {
            try setNominalSampleRate(targetSampleRate, for: baselineDevice)
            rateChangeObserved = waitUntil { abs(((try? nominalSampleRate(for: self.baselineDevice)) ?? 0) - targetSampleRate) < 0.5 }
        } catch {}
    }

    func restoreSampleRate() {
        guard rateChangeAttempted else { return }
        rateRestorationAttempted = true
        if abs(((try? nominalSampleRate(for: baselineDevice)) ?? 0) - baselineSampleRate) < 0.5 {
            rateRestorationObserved = true
            return
        }
        do {
            try setNominalSampleRate(baselineSampleRate, for: baselineDevice)
            rateRestorationObserved = waitUntil { abs(((try? nominalSampleRate(for: self.baselineDevice)) ?? 0) - self.baselineSampleRate) < 0.5 }
        } catch {}
    }

    func restoreAll() {
        restoreSampleRate()
        restoreDefault()
    }

    func evidence() -> HardwareTransitionEvidence {
        let defaultRestored = (try? defaultOutputDevice()) == baselineDevice
        let rateRestored = abs(((try? nominalSampleRate(for: baselineDevice)) ?? 0) - baselineSampleRate) < 0.5
        return HardwareTransitionEvidence(
            controlledDefaultOutput: ControlledDefaultOutputEvidence(
                available: alternateDevice != nil,
                targetKind: alternateDevice?.kind,
                switchAttempted: switchAttempted,
                switchObserved: switchObserved,
                restorationAttempted: defaultRestorationAttempted,
                restorationObserved: defaultRestorationObserved
            ),
            sampleRate: SampleRateTransitionEvidence(
                available: targetSampleRate != nil,
                originalHz: Int(baselineSampleRate.rounded()),
                targetHz: targetSampleRate.map { Int($0.rounded()) },
                changeAttempted: rateChangeAttempted,
                changeObserved: rateChangeObserved,
                restorationAttempted: rateRestorationAttempted,
                restorationObserved: rateRestorationObserved
            ),
            physicalDeviceLoss: PhysicalDeviceLossEvidence(
                removablePhysicalOutputsAvailable: removablePhysicalOutputs,
                removalAttempted: false,
                lossObserved: false,
                reconnectionObserved: false,
                reasonCode: removablePhysicalOutputs == 0 ? "no-removable-physical-output" : "manual-removal-required"
            ),
            baselineDefaultOutputRestored: defaultRestored,
            baselineSampleRateRestored: rateRestored
        )
    }
}

private enum GoldenShadowFixture {
    static let fixtureId = "dual-tone-gain"
    static let fixtureSampleRate = 48_000
    static let fixtureFrames = 4_096
    static let maximumCallbackFrames = 4_096
    static let initialOutputGainDb: Float = -0.75
    static let expectedSha256 = "74d25b2c630082715417bc8f213357752cfc56f439d6f930ac2dd7fdbde9b995"

    static func sha256(metrics: OpaquePointer) -> String {
        guard ps_realtime_shadow_captured_frames(metrics) == UInt32(Self.fixtureFrames) else { return "" }
        var bytes = [UInt8]()
        bytes.reserveCapacity(8 + 2 * Self.fixtureFrames * MemoryLayout<UInt32>.size)
        appendLittleEndian(UInt32(2), to: &bytes)
        appendLittleEndian(UInt32(Self.fixtureFrames), to: &bytes)
        for channel in 0..<2 {
            for frame in 0..<Self.fixtureFrames {
                appendLittleEndian(ps_realtime_shadow_capture_sample_bits(metrics, UInt32(channel), UInt32(frame)), to: &bytes)
            }
        }
        return SHA256.hash(data: Data(bytes)).map { String(format: "%02x", $0) }.joined()
    }

    private static func appendLittleEndian(_ value: UInt32, to bytes: inout [UInt8]) {
        bytes.append(UInt8(value & 0xff))
        bytes.append(UInt8((value >> 8) & 0xff))
        bytes.append(UInt8((value >> 16) & 0xff))
        bytes.append(UInt8((value >> 24) & 0xff))
    }
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
    private(set) var sampleRateListenerEverRegistered = false
    private(set) var sampleRate = 0.0
    private(set) var channels = 0
    private(set) var maximumFramesPerSlice: UInt32 = 0
    private(set) var lastPublishedGeneration: UInt32 = 0
    private(set) var lastPublishedOutputGainDb = Double(GoldenShadowFixture.initialOutputGainDb)

    let metrics: OpaquePointer
    let shadowEnabled: Bool
    let audiblePreviewEnabled: Bool
    let requestedDurationMs: Double
    private var audioUnit: AudioUnit?
    private var outputDevice = kAudioObjectUnknown
    private var defaultListenerRegistered = false
    private var overloadListenerRegistered = false
    private var sampleRateListenerRegistered = false

    init(metrics: OpaquePointer, shadowEnabled: Bool, audiblePreviewEnabled: Bool, requestedDurationMs: Double) {
        self.metrics = metrics
        self.shadowEnabled = shadowEnabled
        self.audiblePreviewEnabled = audiblePreviewEnabled
        self.requestedDurationMs = requestedDurationMs
        ps_realtime_metrics_configure_shadow(metrics, shadowEnabled ? 1 : 0)
        if shadowEnabled {
            lastPublishedGeneration = 1
            ps_realtime_publish_shadow_output_gain(metrics, lastPublishedGeneration, GoldenShadowFixture.initialOutputGainDb)
        }
    }

    func publishShadowOutputGain(generation: UInt32, outputGainDb: Float) throws {
        guard shadowEnabled else { throw EngineError.invalidArgument("shadow parameter mailbox is disabled") }
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

    private func installSampleRateListener() throws {
        guard outputDevice != kAudioObjectUnknown else { throw EngineError.noOutputDevice }
        try requireNoError(ps_install_sample_rate_listener(outputDevice, metrics), "install sample-rate listener")
        sampleRateListenerRegistered = true
        sampleRateListenerEverRegistered = true
    }

    private func removeSampleRateListener() {
        guard sampleRateListenerRegistered, outputDevice != kAudioObjectUnknown else { return }
        ps_remove_sample_rate_listener(outputDevice, metrics)
        sampleRateListenerRegistered = false
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
            if audiblePreviewEnabled {
                let floatPcm = format.mFormatID == kAudioFormatLinearPCM
                    && (format.mFormatFlags & kAudioFormatFlagIsFloat) != 0
                    && format.mBitsPerChannel == 32
                guard floatPcm, channels >= 2 else {
                    throw EngineError.invalidArgument("audible preview requires a Float32 output with at least two channels")
                }
                let interleaved = (format.mFormatFlags & kAudioFormatFlagIsNonInterleaved) == 0
                let totalFrames = UInt64((requestedDurationMs * sampleRate / 1_000).rounded(.up))
                let fadeFrames = UInt32(max(1, (20 * sampleRate / 1_000).rounded(.up)))
                let previewGain = Float(pow(10, -30.0 / 20.0))
                ps_realtime_metrics_configure_preview(metrics, 1, UInt32(channels), interleaved ? 1 : 0, totalFrames, fadeFrames, previewGain)
            } else {
                ps_realtime_metrics_configure_preview(metrics, 0, 0, 0, 0, 0, 0)
            }

            var maximumFrames: UInt32 = 0
            var maximumFramesSize = UInt32(MemoryLayout<UInt32>.size)
            try requireNoError(AudioUnitGetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maximumFrames, &maximumFramesSize), "read maximum frames per slice")
            maximumFramesPerSlice = maximumFrames

            ps_realtime_metrics_configure(metrics, maximumFrames, sampleRate)
            try installOverloadListener()
            try installSampleRateListener()
            try requireNoError(AudioUnitInitialize(unit), "initialize default-output unit")
            try requireNoError(AudioOutputUnitStart(unit), "start default-output unit")
        } catch {
            AudioUnitUninitialize(unit)
            removeSampleRateListener()
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
        removeSampleRateListener()
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
            removeSampleRateListener()
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
    let hardwareTransitionsEnabled = CommandLine.arguments.contains("--hardware-transitions")
    let audiblePreviewEnabled = CommandLine.arguments.contains("--audible-preview")
    if hardwareTransitionsEnabled && !CommandLine.arguments.contains("--allow-system-audio-mutation") {
        throw EngineError.invalidArgument("--hardware-transitions requires --allow-system-audio-mutation")
    }
    if audiblePreviewEnabled && !CommandLine.arguments.contains("--allow-audible-output") {
        throw EngineError.invalidArgument("--audible-preview requires --allow-audible-output")
    }
    if audiblePreviewEnabled && (stressEnabled || hardwareTransitionsEnabled) {
        throw EngineError.invalidArgument("audible preview cannot be combined with stress or hardware transitions")
    }
    let durationMs = try boundedMilliseconds("--duration-ms", default: audiblePreviewEnabled ? 3_000 : hardwareTransitionsEnabled ? 10_000 : stressEnabled ? 10_000 : 750, minimum: 100, maximum: audiblePreviewEnabled ? 5_000 : 60_000)
    let simulateAtMs = try boundedMilliseconds("--simulate-device-change-ms", default: stressEnabled ? 5_000 : 250, minimum: 50, maximum: 59_000)
    let shadowEnabled = CommandLine.arguments.contains("--shadow") || stressEnabled || hardwareTransitionsEnabled || audiblePreviewEnabled
    let reportMode = audiblePreviewEnabled ? "generated-tone-audible-lab" : hardwareTransitionsEnabled ? "muted-shadow-hardware-transition-lab" : stressEnabled ? "muted-shadow-stress-lab" : shadowEnabled ? "muted-shadow-output-lab" : "silent-output-lab"
    let isolation = Isolation(audioContent: audiblePreviewEnabled ? "generated-fixture-preview" : "silence-only", shadowInput: shadowEnabled ? "generated-golden-only" : "disabled")
    if !hardwareTransitionsEnabled && !audiblePreviewEnabled && simulateAtMs >= durationMs - 50 {
        throw EngineError.invalidArgument("simulated device change must leave at least 50 milliseconds for recovery")
    }
    if hardwareTransitionsEnabled && durationMs < 9_000 {
        throw EngineError.invalidArgument("hardware transition testing requires at least 9000 milliseconds")
    }
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
            engineVersion: "0.7.0",
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
            recovery: Recovery(defaultDeviceListener: false, processorOverloadListener: false, sampleRateListener: false, simulatedDeviceChange: false, deviceChangesObserved: 0, sampleRateChangesObserved: 0),
            stream: nil,
            shadow: nil,
            stress: stressEnabled ? StressEvidence(targetDurationMs: durationMs, parameterChangesRequested: 2, parameterChangesCompleted: 0, simulatedRecoveryAtMs: simulateAtMs, systemAudioConfigurationChanged: false) : nil,
            hardwareTransitions: nil,
            preview: audiblePreviewEnabled ? PreviewEvidence(gainDb: -30, requestedDurationMs: durationMs, maximumDurationMs: 5_000, fadeMs: 20) : nil
        ))
        exit(0)
    }
    guard let metrics = ps_realtime_metrics_create() else { throw EngineError.invalidArgument("could not allocate control-thread metrics") }
    defer { ps_realtime_metrics_destroy(metrics) }
    let hardwareController = hardwareTransitionsEnabled ? try HardwareTransitionController(baselineDevice: startingDefaultOutput, baselineSampleRate: startingNominalSampleRate) : nil
    defer { hardwareController?.restoreAll() }

    let engine = SilentOutputEngine(metrics: metrics, shadowEnabled: shadowEnabled, audiblePreviewEnabled: audiblePreviewEnabled, requestedDurationMs: durationMs)
    defer { engine.forceCleanup() }
    let startedAt = Date()
    var simulated = false
    var handledDeviceChanges: UInt64 = 0
    var handledSampleRateChanges: UInt64 = 0
    var parameterChangesCompleted = 0
    var hardwareStage = 0

    try engine.start()

    func performHardwareStage() throws {
        guard let hardwareController else { return }
        let mutationObserved: Bool
        switch hardwareStage {
        case 0:
            hardwareController.switchToAlternate()
            mutationObserved = hardwareController.switchObserved
        case 1:
            hardwareController.restoreDefault()
            mutationObserved = hardwareController.defaultRestorationObserved
        case 2:
            hardwareController.changeSampleRate()
            mutationObserved = hardwareController.rateChangeObserved
        case 3:
            hardwareController.restoreSampleRate()
            mutationObserved = hardwareController.rateRestorationObserved
        default:
            return
        }
        hardwareStage += 1
        if mutationObserved {
            try engine.recover()
            handledDeviceChanges = ps_realtime_device_changes(metrics)
            handledSampleRateChanges = ps_realtime_sample_rate_changes(metrics)
        }
    }

    while Date().timeIntervalSince(startedAt) * 1_000 < durationMs {
        let elapsedMs = Date().timeIntervalSince(startedAt) * 1_000
        if stressEnabled && parameterChangesCompleted == 0 && elapsedMs >= firstParameterChangeAtMs {
            try engine.publishShadowOutputGain(generation: 2, outputGainDb: -6)
            parameterChangesCompleted = 1
        }
        if !hardwareTransitionsEnabled && !audiblePreviewEnabled && !simulated && elapsedMs >= simulateAtMs {
            ps_realtime_metrics_record_device_change(metrics)
            simulated = true
        }
        if hardwareController != nil {
            if hardwareStage == 0 && elapsedMs >= durationMs * 0.15 {
                try performHardwareStage()
            } else if hardwareStage == 1 && elapsedMs >= durationMs * 0.35 {
                try performHardwareStage()
            } else if hardwareStage == 2 && elapsedMs >= durationMs * 0.55 {
                try performHardwareStage()
            } else if hardwareStage == 3 && elapsedMs >= durationMs * 0.75 {
                try performHardwareStage()
            }
        }
        let observedChanges = ps_realtime_device_changes(metrics)
        let observedSampleRateChanges = ps_realtime_sample_rate_changes(metrics)
        if observedChanges > handledDeviceChanges || observedSampleRateChanges > handledSampleRateChanges {
            handledDeviceChanges = observedChanges
            handledSampleRateChanges = observedSampleRateChanges
            try engine.recover()
            handledDeviceChanges = ps_realtime_device_changes(metrics)
            handledSampleRateChanges = ps_realtime_sample_rate_changes(metrics)
        }
        if stressEnabled && parameterChangesCompleted == 1 && elapsedMs >= secondParameterChangeAtMs {
            try engine.publishShadowOutputGain(generation: 3, outputGainDb: GoldenShadowFixture.initialOutputGainDb)
            parameterChangesCompleted = 2
        }
        Thread.sleep(forTimeInterval: 0.005)
    }
    while hardwareStage < 4, hardwareController != nil {
        try performHardwareStage()
    }
    if hardwareTransitionsEnabled {
        let settleDeadline = Date().addingTimeInterval(0.25)
        while Date() < settleDeadline {
            let observedChanges = ps_realtime_device_changes(metrics)
            let observedSampleRateChanges = ps_realtime_sample_rate_changes(metrics)
            if observedChanges > handledDeviceChanges || observedSampleRateChanges > handledSampleRateChanges {
                try engine.recover()
                handledDeviceChanges = ps_realtime_device_changes(metrics)
                handledSampleRateChanges = ps_realtime_sample_rate_changes(metrics)
            }
            Thread.sleep(forTimeInterval: 0.005)
        }
    }
    try engine.stop()
    hardwareController?.restoreAll()
    let systemAudioConfigurationChanged: Bool
    if stressEnabled || hardwareTransitionsEnabled {
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
        engineVersion: "0.7.0",
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
    if engine.shadowEnabled {
        let actualSha256 = GoldenShadowFixture.sha256(metrics: metrics)
        let parameterWord = ps_realtime_shadow_parameter_word(metrics)
        let publishedGeneration = UInt32(parameterWord >> 32)
        let publishedOutputGainDb = Double(Float(bitPattern: UInt32(parameterWord & 0xffff_ffff)))
        let appliedUpdates = ps_realtime_shadow_applied_updates(metrics)
        let lastAppliedGeneration = ps_realtime_shadow_last_applied_generation(metrics)
        let lastAppliedOutputGainDb = Double(ps_realtime_shadow_last_applied_output_gain_db(metrics))
        let parameterCoherent = publishedGeneration == engine.lastPublishedGeneration
            && publishedGeneration == lastAppliedGeneration
            && publishedOutputGainDb == engine.lastPublishedOutputGainDb
            && publishedOutputGainDb == lastAppliedOutputGainDb
            && ps_realtime_shadow_parameter_publishes(metrics) == UInt64(appliedUpdates)
        shadowEvidence = ShadowEvidence(
            fixtureId: GoldenShadowFixture.fixtureId,
            fixtureSampleRate: GoldenShadowFixture.fixtureSampleRate,
            fixtureFrames: GoldenShadowFixture.fixtureFrames,
            generatedInput: true,
            checksumAlgorithm: "sha256-float32le-v1",
            expectedSha256: GoldenShadowFixture.expectedSha256,
            actualSha256: actualSha256,
            checksumMatch: actualSha256 == GoldenShadowFixture.expectedSha256,
            processedCallbacks: ps_realtime_shadow_callbacks(metrics),
            processedFrames: ps_realtime_shadow_frames(metrics),
            kernelProcessedFrames: Int(ps_realtime_shadow_kernel_processed_frames(metrics)),
            capturedFrames: Int(ps_realtime_shadow_captured_frames(metrics)),
            recoveredSamples: Int(ps_realtime_shadow_recovered_samples(metrics)),
            failures: ps_realtime_shadow_failures(metrics),
            hardwareOutputZeroFilledAfterShadow: !audiblePreviewEnabled,
            parameterHandoff: ParameterHandoffEvidence(
                lockFree: ps_realtime_shadow_parameter_word_is_lock_free(metrics) == 1,
                publishedUpdates: ps_realtime_shadow_parameter_publishes(metrics),
                appliedUpdates: Int(appliedUpdates),
                lastPublishedGeneration: publishedGeneration,
                lastAppliedGeneration: lastAppliedGeneration,
                lastPublishedOutputGainDb: publishedOutputGainDb,
                lastAppliedOutputGainDb: lastAppliedOutputGainDb,
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
            sampleRateListener: engine.sampleRateListenerEverRegistered,
            simulatedDeviceChange: simulated,
            deviceChangesObserved: ps_realtime_device_changes(metrics),
            sampleRateChangesObserved: ps_realtime_sample_rate_changes(metrics)
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
        ) : nil,
        hardwareTransitions: hardwareController?.evidence(),
        preview: audiblePreviewEnabled ? PreviewEvidence(gainDb: -30, requestedDurationMs: durationMs, maximumDurationMs: 5_000, fadeMs: 20) : nil
    ))
} catch {
    FileHandle.standardError.write(Data("shared-dsp-silent-stream: \(error)\n".utf8))
    exit(1)
}
