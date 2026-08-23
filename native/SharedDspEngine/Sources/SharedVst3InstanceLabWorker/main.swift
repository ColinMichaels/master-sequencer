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
}

private enum ArgumentError: Error { case invalid }

private func usage() -> String {
  """
  Usage: shared-vst3-instance-lab-worker --allow-binary-load --allow-instance-lab
         --approved-root ID PATH --bundle PATH --class-id CLASS_ID [--allow-unsigned]

  This internal worker performs one bounded offline zero-input instance laboratory run and exits.
  A successful report remains runtime-blocked and contains no state or audio payload.
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
  let report = VST3InstanceLabWorker.inspect(
    approvedRootURL: options.rootURL!,
    bundleURL: options.bundleURL!,
    processorClassID: options.processorClassID!,
    allowUnsigned: options.allowUnsigned
  )
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys]
  FileHandle.standardOutput.write(try encoder.encode(report))
  FileHandle.standardOutput.write(Data("\n".utf8))
  exit(report.status == .passed ? EXIT_SUCCESS : EXIT_FAILURE)
} catch {
  FileHandle.standardError.write(
    Data(
      "Invalid instance-lab worker request. Use --help for the bounded laboratory boundary.\n".utf8)
  )
  exit(2)
}
