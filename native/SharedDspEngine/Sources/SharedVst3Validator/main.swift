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
  var catalogURL: URL?
  var timeoutMilliseconds = 5_000
  var pretty = false
}

private enum ArgumentError: Error {
  case invalid
}

private func usage() -> String {
  """
  Usage: shared-vst3-validator --allow-binary-load
         --approved-root ID PATH --bundle PATH [--timeout-ms 5000]
         [--allow-unsigned] [--catalog PATH] [--pretty]

  Each request launches one disposable validator worker. A successful factory scan remains
  runtime-blocked: no plug-in instance, parameter, state, editor, or audio path is enabled.
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
    case "--pretty":
      options.pretty = true
    case "--approved-root":
      guard index + 2 < arguments.count else { throw ArgumentError.invalid }
      options.rootID = arguments[index + 1]
      options.rootURL = URL(filePath: arguments[index + 2], directoryHint: .isDirectory)
      index += 2
    case "--bundle":
      guard index + 1 < arguments.count else { throw ArgumentError.invalid }
      options.bundleURL = URL(filePath: arguments[index + 1], directoryHint: .isDirectory)
      index += 1
    case "--catalog":
      guard index + 1 < arguments.count else { throw ArgumentError.invalid }
      options.catalogURL = URL(filePath: arguments[index + 1], directoryHint: .notDirectory)
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
  let ownExecutable = URL(filePath: CommandLine.arguments[0]).standardizedFileURL
  let workerURL = ownExecutable.deletingLastPathComponent().appending(
    path: "shared-vst3-validator-worker",
    directoryHint: .notDirectory
  )
  let attempt = VST3ValidationCoordinator.validate(
    workerURL: workerURL,
    rootID: options.rootID!,
    approvedRootURL: options.rootURL!,
    bundleURL: options.bundleURL!,
    timeoutMilliseconds: options.timeoutMilliseconds,
    allowUnsigned: options.allowUnsigned
  )
  if let catalogURL = options.catalogURL {
    try VST3PrivateCatalogStore.update(
      catalogURL: catalogURL,
      rootID: options.rootID!,
      bundleURL: options.bundleURL!,
      attempt: attempt
    )
  }
  let encoder = JSONEncoder()
  encoder.outputFormatting = options.pretty ? [.prettyPrinted, .sortedKeys] : [.sortedKeys]
  FileHandle.standardOutput.write(try encoder.encode(attempt))
  FileHandle.standardOutput.write(Data("\n".utf8))
  exit(attempt.status == .factoryEnumerated ? EXIT_SUCCESS : EXIT_FAILURE)
} catch {
  FileHandle.standardError.write(
    Data(
      "Invalid validator request or private catalog. Use --help for the supported boundary.\n".utf8)
  )
  exit(2)
}
