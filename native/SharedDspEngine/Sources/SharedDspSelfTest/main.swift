import Foundation
import SharedDspEngine

private var failures: [String] = []

@MainActor private func check(_ condition: @autoclosure () -> Bool, _ label: String) {
    if !condition() { failures.append(label) }
}

let bounded = SharedDspSettings(inputGainDb: 200, outputGainDb: -100, ceilingDbfs: 4, smoothingMs: 900, dcBlockFrequencyHz: 200)
check(bounded.inputGainDb == 24, "input gain bound")
check(bounded.outputGainDb == -48, "output gain bound")
check(bounded.ceilingDbfs == 0, "ceiling bound")
check(bounded.smoothingMs == 250, "smoothing bound")
check(bounded.dcBlockFrequencyHz == 40, "DC frequency bound")

let bypassInput: [[Float]] = [[-1, -0.25, 0, 0.5, 1]]
var bypassOutput: [[Float]] = [[Float](repeating: 0, count: 5)]
let bypassKernel = SharedDspKernel(settings: SharedDspSettings(bypass: true, inputGainDb: 12))
bypassKernel.process(inputChannels: bypassInput, outputChannels: &bypassOutput, startFrame: 0, frameCount: 5)
check(bypassOutput == bypassInput, "exact bypass")

let recoveryInput: [[Float]] = [[0.25, .nan, .infinity, -0.25]]
var recoveryOutput: [[Float]] = [[Float](repeating: 0, count: 4)]
let recoveryKernel = SharedDspKernel(settings: SharedDspSettings(peakGuardEnabled: false, smoothingMs: 0))
recoveryKernel.process(inputChannels: recoveryInput, outputChannels: &recoveryOutput, startFrame: 0, frameCount: 4)
check(recoveryOutput[0] == [0.25, 0, 0, -0.25], "non-finite containment")
check(recoveryKernel.metrics.recoveredSamples == 2, "recovery telemetry")

let rateKernel = SharedDspKernel(sampleRate: 44_100, settings: SharedDspSettings(peakGuardEnabled: false, dcBlockEnabled: true))
var firstOutput: [[Float]] = [[Float](repeating: 0, count: 2)]
rateKernel.process(inputChannels: [[1, 0]], outputChannels: &firstOutput, startFrame: 0, frameCount: 2)
rateKernel.setSampleRate(96_000)
var resetOutput: [[Float]] = [[0]]
rateKernel.process(inputChannels: [[0]], outputChannels: &resetOutput, startFrame: 0, frameCount: 1)
check(resetOutput[0][0] == 0, "sample-rate state reset")

if failures.isEmpty {
    print("SharedDspEngine self-test passed (contract \(sharedDspContractVersion)).")
} else {
    FileHandle.standardError.write(Data("SharedDspEngine self-test failed: \(failures.joined(separator: ", "))\n".utf8))
    exit(1)
}
