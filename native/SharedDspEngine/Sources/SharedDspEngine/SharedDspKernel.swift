import Foundation

public let sharedDspContractVersion = 2
private let maximumProcessingChannels = 32

private func bounded(_ value: Double, fallback: Double, minimum: Double, maximum: Double) -> Double {
    value.isFinite ? min(maximum, max(minimum, value)) : fallback
}

public struct SharedDspSettings: Codable, Equatable, Sendable {
    public var bypass: Bool
    public var inputGainDb: Double
    public var outputGainDb: Double
    public var ceilingDbfs: Double
    public var peakGuardEnabled: Bool
    public var smoothingMs: Double
    public var dcBlockEnabled: Bool
    public var dcBlockFrequencyHz: Double

    public init(
        bypass: Bool = false,
        inputGainDb: Double = 0,
        outputGainDb: Double = 0,
        ceilingDbfs: Double = -1,
        peakGuardEnabled: Bool = true,
        smoothingMs: Double = 12,
        dcBlockEnabled: Bool = false,
        dcBlockFrequencyHz: Double = 12
    ) {
        self.bypass = bypass
        self.inputGainDb = bounded(inputGainDb, fallback: 0, minimum: -48, maximum: 24)
        self.outputGainDb = bounded(outputGainDb, fallback: 0, minimum: -48, maximum: 12)
        self.ceilingDbfs = bounded(ceilingDbfs, fallback: -1, minimum: -12, maximum: 0)
        self.peakGuardEnabled = peakGuardEnabled
        self.smoothingMs = bounded(smoothingMs, fallback: 12, minimum: 0, maximum: 250)
        self.dcBlockEnabled = dcBlockEnabled
        self.dcBlockFrequencyHz = bounded(dcBlockFrequencyHz, fallback: 12, minimum: 2, maximum: 40)
    }

    private enum CodingKeys: String, CodingKey {
        case bypass, inputGainDb, outputGainDb, ceilingDbfs, peakGuardEnabled, smoothingMs, dcBlockEnabled, dcBlockFrequencyHz
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            bypass: try values.decodeIfPresent(Bool.self, forKey: .bypass) ?? false,
            inputGainDb: try values.decodeIfPresent(Double.self, forKey: .inputGainDb) ?? 0,
            outputGainDb: try values.decodeIfPresent(Double.self, forKey: .outputGainDb) ?? 0,
            ceilingDbfs: try values.decodeIfPresent(Double.self, forKey: .ceilingDbfs) ?? -1,
            peakGuardEnabled: try values.decodeIfPresent(Bool.self, forKey: .peakGuardEnabled) ?? true,
            smoothingMs: try values.decodeIfPresent(Double.self, forKey: .smoothingMs) ?? 12,
            dcBlockEnabled: try values.decodeIfPresent(Bool.self, forKey: .dcBlockEnabled) ?? false,
            dcBlockFrequencyHz: try values.decodeIfPresent(Double.self, forKey: .dcBlockFrequencyHz) ?? 12
        )
    }
}

public struct SharedDspMetrics: Equatable, Sendable {
    public var inputPeak: Double = 0
    public var outputPeak: Double = 0
    public var gainReductionDb: Double = 0
    public var processedFrames: Int = 0
    public var recoveredSamples: Int = 0
}

public final class SharedDspKernel {
    public private(set) var sampleRate: Double
    public private(set) var settings: SharedDspSettings
    public private(set) var metrics = SharedDspMetrics()

    private var currentGain: Double
    private var targetGain: Double
    private var smoothingCoefficient: Double = 0
    private var ceilingGain: Double = 1
    private var dcBlockCoefficient: Double = 0
    private var previousDcInput = Array(repeating: 0.0, count: maximumProcessingChannels)
    private var previousDcOutput = Array(repeating: 0.0, count: maximumProcessingChannels)

    public init(sampleRate: Double = 48_000, settings: SharedDspSettings = SharedDspSettings()) {
        self.sampleRate = bounded(sampleRate, fallback: 48_000, minimum: 8_000, maximum: 384_000)
        self.settings = settings
        currentGain = Self.decibelsToGain(settings.inputGainDb + settings.outputGainDb)
        targetGain = currentGain
        updateDerivedValues()
    }

    public static func decibelsToGain(_ decibels: Double) -> Double {
        pow(10, decibels / 20)
    }

    private func updateDerivedValues() {
        targetGain = Self.decibelsToGain(settings.inputGainDb + settings.outputGainDb)
        let smoothingSeconds = settings.smoothingMs / 1_000
        smoothingCoefficient = smoothingSeconds > 0 ? exp(-1 / (sampleRate * smoothingSeconds)) : 0
        ceilingGain = Self.decibelsToGain(settings.ceilingDbfs)
        dcBlockCoefficient = exp((-2 * Double.pi * settings.dcBlockFrequencyHz) / sampleRate)
    }

    public func setSettings(_ settings: SharedDspSettings) {
        self.settings = settings
        updateDerivedValues()
    }

    public func setSampleRate(_ sampleRate: Double) {
        let next = bounded(sampleRate, fallback: 48_000, minimum: 8_000, maximum: 384_000)
        guard next != self.sampleRate else { return }
        self.sampleRate = next
        previousDcInput = Array(repeating: 0, count: maximumProcessingChannels)
        previousDcOutput = Array(repeating: 0, count: maximumProcessingChannels)
        updateDerivedValues()
    }

    public func reset() {
        currentGain = targetGain
        metrics = SharedDspMetrics()
        previousDcInput = Array(repeating: 0, count: maximumProcessingChannels)
        previousDcOutput = Array(repeating: 0, count: maximumProcessingChannels)
    }

    public func process(inputChannels: [[Float]], outputChannels: inout [[Float]], startFrame: Int, frameCount: Int) {
        let endFrame = startFrame + frameCount
        precondition(startFrame >= 0 && frameCount >= 0)
        precondition(outputChannels.allSatisfy { endFrame <= $0.count })
        let channelCount = outputChannels.count
        let bypass = settings.bypass
        let guardEnabled = settings.peakGuardEnabled
        let dcBlock = !bypass && settings.dcBlockEnabled
        var inputPeak = 0.0
        var outputPeak = 0.0
        var maximumReductionDb = 0.0
        var recoveredSamples = 0

        for frame in startFrame..<endFrame {
            if !bypass {
                currentGain = targetGain + smoothingCoefficient * (currentGain - targetGain)
            }
            for channel in 0..<channelCount {
                let rawSample = channel < inputChannels.count && frame < inputChannels[channel].count ? Double(inputChannels[channel][frame]) : 0
                let sample: Double
                if rawSample.isFinite {
                    sample = rawSample
                } else {
                    sample = 0
                    recoveredSamples += 1
                }
                inputPeak = max(inputPeak, abs(sample))
                var processed = bypass ? sample : sample * currentGain
                if dcBlock && channel < maximumProcessingChannels {
                    let filtered = processed - previousDcInput[channel] + dcBlockCoefficient * previousDcOutput[channel]
                    previousDcInput[channel] = processed
                    previousDcOutput[channel] = filtered
                    processed = filtered
                }
                let beforeGuard = abs(processed)
                if !bypass && guardEnabled && beforeGuard > ceilingGain {
                    processed = processed < 0 ? -ceilingGain : ceilingGain
                    maximumReductionDb = max(maximumReductionDb, 20 * log10(beforeGuard / ceilingGain))
                }
                outputChannels[channel][frame] = Float(processed)
                outputPeak = max(outputPeak, abs(processed))
            }
        }

        metrics.inputPeak = inputPeak
        metrics.outputPeak = outputPeak
        metrics.gainReductionDb = maximumReductionDb
        metrics.processedFrames += frameCount
        metrics.recoveredSamples += recoveredSamples
    }
}
