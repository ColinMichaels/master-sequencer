import Darwin
import Foundation
import Vst3Discovery

private struct Options {
  var includeStandardRoots = false
  var approvedRoots: [VST3ScanRoot] = []
  var pretty = false
}

private func usage() -> String {
  """
  Usage: shared-vst3-scanner [--standard] [--approved-root ID PATH] [--pretty]

    --standard               Scan the standard macOS VST3 locations in priority order.
    --approved-root ID PATH  Add an explicitly approved machine-local scan root.
    --pretty                 Pretty-print the path-free JSON report.

  This metadata-only scanner never loads a plug-in binary.
  """
}

private func parseOptions(_ arguments: [String]) throws -> Options {
  var options = Options()
  var index = 0
  while index < arguments.count {
    switch arguments[index] {
    case "--standard":
      options.includeStandardRoots = true
    case "--pretty":
      options.pretty = true
    case "--approved-root":
      guard index + 2 < arguments.count else { throw VST3DiscoveryError.invalidRootID }
      options.approvedRoots.append(
        try VST3ScanRoot(
          id: arguments[index + 1],
          kind: .approved,
          url: URL(filePath: arguments[index + 2], directoryHint: .isDirectory)
        ))
      index += 2
    case "--help", "-h":
      print(usage())
      exit(EXIT_SUCCESS)
    default:
      throw VST3DiscoveryError.invalidRootID
    }
    index += 1
  }
  guard options.includeStandardRoots || !options.approvedRoots.isEmpty else {
    throw VST3DiscoveryError.invalidRootID
  }
  return options
}

do {
  let options = try parseOptions(Array(CommandLine.arguments.dropFirst()))
  var roots = options.includeStandardRoots ? VST3StandardLocations.macOS() : []
  roots.append(contentsOf: options.approvedRoots)
  let report = VST3DiscoveryScanner().scan(roots: roots)
  let encoder = JSONEncoder()
  encoder.outputFormatting = options.pretty ? [.prettyPrinted, .sortedKeys] : [.sortedKeys]
  let data = try encoder.encode(report)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
  FileHandle.standardError.write(
    Data("Invalid scanner arguments. Use --help for the supported manual scan boundary.\n".utf8))
  exit(2)
}
