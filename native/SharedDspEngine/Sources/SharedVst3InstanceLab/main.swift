import Darwin
import Foundation
import Vst3Discovery
import Vst3Validation

private struct Options {
  var allowBinaryLoad = false
  var allowInstanceLab = false
  var allowUnsigned = false
  var rootID: String?
  var rootURL: URL?
  var bundleURL: URL?
  var processorClassID: String?
  var timeoutMilliseconds = 5_000
  var pretty = false
}

private enum ArgumentError: Error { case invalid }

private func usage() -> String {
  """
  Usage: shared-vst3-instance-lab --allow-binary-load --allow-instance-lab
         --approved-root ID PATH --bundle PATH --class-id CLASS_ID
         [--timeout-ms 5000] [--allow-unsigned] [--pretty]

  The lab enumerates parameters, round-trips bounded state, reports latency/tail values, and runs
  four offline stereo zero-input blocks. It never enables the processor in Project Sequencer.
  """
}

private func parse(_ arguments: [String]) throws -> Options {
  var options = Options()
  var index = 0
  while index < arguments.count {
    switch arguments[index] {
    case "--allow-binary-load": options.allowBinaryLoad = true
    case "--allow-instance-lab": options.allowInstanceLab = true
    case "--allow-unsigned": options.allowUnsigned = true
    case "--pretty": options.pretty = true
    case "--approved-root":
      guard index + 2 < arguments.count else { throw ArgumentError.invalid }
      options.rootID = arguments[index + 1]
      options.rootURL = URL(filePath: arguments[index + 2], directoryHint: .isDirectory)
      index += 2
    case "--bundle":
      guard index + 1 < arguments.count else { throw ArgumentError.invalid }
      options.bundleURL = URL(filePath: arguments[index + 1], directoryHint: .isDirectory)
      index += 1
    case "--class-id":
      guard index + 1 < arguments.count else { throw ArgumentError.invalid }
      options.processorClassID = arguments[index + 1].uppercased()
      index += 1
    case "--timeout-ms":
      guard index + 1 < arguments.count,
        let value = Int(arguments[index + 1]),
        (100...120_000).contains(value)
      else { throw ArgumentError.invalid }
      options.timeoutMilliseconds = value
      index += 1
    case "--help", "-h":
      print(usage())
      exit(EXIT_SUCCESS)
    default:
      throw ArgumentError.invalid
    }
    index += 1
  }
  guard options.allowBinaryLoad,
    options.allowInstanceLab,
    let rootID = options.rootID,
    let rootURL = options.rootURL,
    options.bundleURL != nil,
    let classID = options.processorClassID,
    classID.range(of: "^[0-9A-F]{32}$", options: .regularExpression) != nil,
    (try? VST3ScanRoot(id: rootID, kind: .approved, url: rootURL)) != nil
  else { throw ArgumentError.invalid }
  return options
}

do {
  let options = try parse(Array(CommandLine.arguments.dropFirst()))
  let ownExecutable = URL(filePath: CommandLine.arguments[0]).standardizedFileURL
  let workerURL = ownExecutable.deletingLastPathComponent().appending(
    path: "shared-vst3-instance-lab-worker",
    directoryHint: .notDirectory
  )
  let attempt = VST3InstanceLabCoordinator.validate(
    workerURL: workerURL,
    rootID: options.rootID!,
    approvedRootURL: options.rootURL!,
    bundleURL: options.bundleURL!,
    processorClassID: options.processorClassID!,
    timeoutMilliseconds: options.timeoutMilliseconds,
    allowUnsigned: options.allowUnsigned
  )
  let encoder = JSONEncoder()
  encoder.outputFormatting = options.pretty ? [.prettyPrinted, .sortedKeys] : [.sortedKeys]
  FileHandle.standardOutput.write(try encoder.encode(attempt))
  FileHandle.standardOutput.write(Data("\n".utf8))
  exit(attempt.status == .passed ? EXIT_SUCCESS : EXIT_FAILURE)
} catch {
  FileHandle.standardError.write(
    Data("Invalid instance-lab request. Use --help for the explicit laboratory boundary.\n".utf8)
  )
  exit(2)
}
