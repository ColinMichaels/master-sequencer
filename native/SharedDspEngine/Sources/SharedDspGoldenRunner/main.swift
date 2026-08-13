import Foundation
import SharedDspEngine

private struct RunnerRequest: Decodable {
    let contractVersion: Int
    let sampleRate: Double
    let blockSize: Int
    let settings: SharedDspSettings
    let channelsBase64: [String]
}

private enum RunnerError: Error {
    case missingInput
    case invalidChannel
    case incompatibleContract
}

private func decodeChannel(_ encoded: String) throws -> [Float] {
    guard let data = Data(base64Encoded: encoded), data.count.isMultiple(of: 4) else { throw RunnerError.invalidChannel }
    var samples = [Float]()
    samples.reserveCapacity(data.count / 4)
    let bytes = [UInt8](data)
    for offset in stride(from: 0, to: bytes.count, by: 4) {
        let bits = UInt32(bytes[offset])
            | (UInt32(bytes[offset + 1]) << 8)
            | (UInt32(bytes[offset + 2]) << 16)
            | (UInt32(bytes[offset + 3]) << 24)
        samples.append(Float(bitPattern: bits))
    }
    return samples
}

private func appendLittleEndian(_ value: UInt32, to bytes: inout [UInt8]) {
    bytes.append(UInt8(value & 0xff))
    bytes.append(UInt8((value >> 8) & 0xff))
    bytes.append(UInt8((value >> 16) & 0xff))
    bytes.append(UInt8((value >> 24) & 0xff))
}

do {
    guard let input = try FileHandle.standardInput.readToEnd() else { throw RunnerError.missingInput }
    let request = try JSONDecoder().decode(RunnerRequest.self, from: input)
    guard request.contractVersion == sharedDspContractVersion else { throw RunnerError.incompatibleContract }
    let inputChannels = try request.channelsBase64.map(decodeChannel)
    let frames = inputChannels.first?.count ?? 0
    guard inputChannels.allSatisfy({ $0.count == frames }), request.blockSize > 0 else { throw RunnerError.invalidChannel }
    var outputChannels = inputChannels.map { _ in [Float](repeating: 0, count: frames) }
    let kernel = SharedDspKernel(sampleRate: request.sampleRate, settings: request.settings)
    for start in stride(from: 0, to: frames, by: request.blockSize) {
        kernel.process(inputChannels: inputChannels, outputChannels: &outputChannels, startFrame: start, frameCount: min(request.blockSize, frames - start))
    }

    var bytes = [UInt8]()
    bytes.reserveCapacity(8 + outputChannels.count * frames * 4)
    appendLittleEndian(UInt32(outputChannels.count), to: &bytes)
    appendLittleEndian(UInt32(frames), to: &bytes)
    for channel in outputChannels {
        for sample in channel { appendLittleEndian(sample.bitPattern, to: &bytes) }
    }
    try FileHandle.standardOutput.write(contentsOf: Data(bytes))
} catch {
    FileHandle.standardError.write(Data("shared-dsp-golden-runner: \(error)\n".utf8))
    exit(1)
}
