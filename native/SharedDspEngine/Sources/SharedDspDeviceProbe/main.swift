import CoreAudio
import Foundation
import SharedDspEngine

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

private struct DefaultOutput: Encodable {
    let label: String
    let sampleRate: Double
    let channels: Int
    let presentationLatencySeconds: Double
    let presentationLatencyFrames: Int
    let interleaved: Bool
    let accessMode: String
}

private struct ProbeReport: Encodable {
    let schemaVersion: Int
    let capturedAt: String
    let handshake: Handshake
    let defaultOutput: DefaultOutput?
    let reasonCode: String?
}

private enum ProbeError: Error {
    case missingFingerprint
    case coreAudio(OSStatus)
}

private func readProperty<T>(
    objectID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    initialValue: T
) throws -> T {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: scope,
        mElement: kAudioObjectPropertyElementMain
    )
    var value = initialValue
    var size = UInt32(MemoryLayout<T>.size)
    let status = AudioObjectGetPropertyData(objectID, &address, 0, nil, &size, &value)
    guard status == noErr else { throw ProbeError.coreAudio(status) }
    return value
}

private func queryDefaultOutput() throws -> DefaultOutput? {
    let deviceID: AudioObjectID = try readProperty(
        objectID: AudioObjectID(kAudioObjectSystemObject),
        selector: kAudioHardwarePropertyDefaultOutputDevice,
        scope: kAudioObjectPropertyScopeGlobal,
        initialValue: kAudioObjectUnknown
    )
    guard deviceID != kAudioObjectUnknown else { return nil }

    let sampleRate: Float64 = try readProperty(
        objectID: deviceID,
        selector: kAudioDevicePropertyNominalSampleRate,
        scope: kAudioObjectPropertyScopeGlobal,
        initialValue: 0
    )
    var format = AudioStreamBasicDescription()
    format = try readProperty(
        objectID: deviceID,
        selector: kAudioDevicePropertyStreamFormat,
        scope: kAudioObjectPropertyScopeOutput,
        initialValue: format
    )
    let deviceLatency: UInt32 = (try? readProperty(
        objectID: deviceID,
        selector: kAudioDevicePropertyLatency,
        scope: kAudioDevicePropertyScopeOutput,
        initialValue: 0
    )) ?? 0
    let safetyOffset: UInt32 = (try? readProperty(
        objectID: deviceID,
        selector: kAudioDevicePropertySafetyOffset,
        scope: kAudioDevicePropertyScopeOutput,
        initialValue: 0
    )) ?? 0
    guard sampleRate.isFinite, sampleRate > 0, format.mChannelsPerFrame > 0 else { return nil }
    let channels = min(32, max(1, Int(format.mChannelsPerFrame)))
    let latencyFrames = Int(deviceLatency) + Int(safetyOffset)
    return DefaultOutput(
        label: "System Default Output",
        sampleRate: sampleRate,
        channels: channels,
        presentationLatencySeconds: Double(latencyFrames) / sampleRate,
        presentationLatencyFrames: latencyFrames,
        interleaved: format.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0,
        accessMode: "query-only"
    )
}

do {
    let fingerprint = ProcessInfo.processInfo.environment["PROJECT_SEQUENCER_ENGINE_FINGERPRINT"] ?? ""
    guard fingerprint.range(of: "^[0-9a-fA-F]{16,128}$", options: .regularExpression) != nil else { throw ProbeError.missingFingerprint }

    // Core Audio property reads do not instantiate an AudioUnit, start a
    // callback, play audio, or request microphone access. A machine with no
    // current output produces a valid unavailable report instead of crashing.
    let defaultOutput = try? queryDefaultOutput()
    let sampleRate = defaultOutput?.sampleRate ?? 0
    let channels = defaultOutput?.channels ?? 2
    let knownSampleRates = [44_100, 48_000, 88_200, 96_000, 176_400, 192_000]
    let roundedSampleRate = Int(sampleRate.rounded())
    let supportedSampleRates = knownSampleRates.contains(roundedSampleRate) ? [roundedSampleRate] : []
    let report = ProbeReport(
        schemaVersion: 1,
        capturedAt: ISO8601DateFormatter().string(from: Date()),
        handshake: Handshake(
            protocolVersion: 1,
            dspContractVersion: sharedDspContractVersion,
            engineVersion: "0.2.0",
            engineInstanceId: UUID().uuidString.lowercased(),
            implementationFingerprint: fingerprint.lowercased(),
            capabilities: Capabilities(
                offlineRender: true,
                realTimeOutput: false,
                deviceNotifications: false,
                maximumChannels: channels,
                supportedSampleRates: supportedSampleRates
            )
        ),
        defaultOutput: defaultOutput,
        reasonCode: defaultOutput == nil ? "no-output-device" : nil
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try FileHandle.standardOutput.write(contentsOf: encoder.encode(report))
    try FileHandle.standardOutput.write(contentsOf: Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("shared-dsp-device-probe: \(error)\n".utf8))
    exit(1)
}
