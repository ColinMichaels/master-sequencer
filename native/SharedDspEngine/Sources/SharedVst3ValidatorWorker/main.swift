import Darwin
import Foundation
import Vst3Discovery
import Vst3Validation

private struct Options {
  var allowBinaryLoad = false
  var allowUnsigned = false
  var rootID: String?
  var rootURL: URL?
  var bundleURL: URL?
}

private enum ArgumentError: Error {
  case invalid
}

private func usage() -> String {
  """
  Usage: shared-vst3-validator-worker --allow-binary-load
         --approved-root ID PATH --bundle PATH [--allow-unsigned]

  This internal worker inspects one bundle and exits. It never creates a plug-in instance.
  """
}

private func parse(_ arguments: [String]) throws -> Options {
  var options = Options()
  var index = 0
  while index < arguments.count {
    switch arguments[index] {
    case "--allow-binary-load":
      options.allowBinaryLoad = true
    case "--allow-unsigned":
      options.allowUnsigned = true
    case "--approved-root":
      guard index + 2 < arguments.count else { throw ArgumentError.invalid }
      options.rootID = arguments[index + 1]
      options.rootURL = URL(filePath: arguments[index + 2], directoryHint: .isDirectory)
      index += 2
    case "--bundle":
      guard index + 1 < arguments.count else { throw ArgumentError.invalid }
      options.bundleURL = URL(filePath: arguments[index + 1], directoryHint: .isDirectory)
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
    let rootID = options.rootID,
    let rootURL = options.rootURL,
    options.bundleURL != nil,
    (try? VST3ScanRoot(id: rootID, kind: .approved, url: rootURL)) != nil
  else {
    throw ArgumentError.invalid
  }
  return options
}

do {
  let options = try parse(Array(CommandLine.arguments.dropFirst()))
  let report = VST3FactoryWorker.inspect(
    approvedRootURL: options.rootURL!,
    bundleURL: options.bundleURL!,
    allowUnsigned: options.allowUnsigned
  )
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys]
  FileHandle.standardOutput.write(try encoder.encode(report))
  FileHandle.standardOutput.write(Data("\n".utf8))
  exit(report.status == .factoryEnumerated ? EXIT_SUCCESS : EXIT_FAILURE)
} catch {
  FileHandle.standardError.write(
    Data("Invalid validator-worker arguments. Use --help for the isolated worker boundary.\n".utf8)
  )
  exit(2)
}
