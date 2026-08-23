import CoreFoundation
import CryptoKit
import Foundation

struct VST3PreparedBundle {
  let bundleURL: URL
  let executableURL: URL
  let report: VST3BundlePreflightReport
}

enum VST3BundlePreflight {
  static func inspect(approvedRootURL: URL, bundleURL: URL) throws -> VST3PreparedBundle {
    let root = approvedRootURL.resolvingSymlinksInPath().standardizedFileURL
    let bundle = bundleURL.resolvingSymlinksInPath().standardizedFileURL
    guard isInside(root: root, candidate: bundle) else {
      throw VST3ValidationError.rejected(.bundleOutsideApprovedRoot)
    }
    guard bundle.pathExtension.lowercased() == "vst3", isDirectory(bundle) else {
      throw VST3ValidationError.rejected(.invalidBundle)
    }
    guard
      let executable = Bundle(url: bundle)?.executableURL?.resolvingSymlinksInPath()
        .standardizedFileURL
    else {
      throw VST3ValidationError.rejected(.executableMissing)
    }
    guard isInside(root: bundle, candidate: executable) else {
      throw VST3ValidationError.rejected(.executableEscapesBundle)
    }
    guard isRegularFile(executable) else {
      throw VST3ValidationError.rejected(.executableMissing)
    }

    let architectures = executableArchitectures(bundleURL: bundle)
    let report = VST3BundlePreflightReport(
      bundleKey: SHA256.hash(data: Data(bundle.path.utf8)).hexString,
      sourceLabel: VST3PublicText.sanitize(
        bundle.lastPathComponent, fallback: "Unnamed VST3 bundle", limit: 120),
      executableLabel: VST3PublicText.sanitize(
        executable.lastPathComponent, fallback: "Unnamed VST3 executable", limit: 120),
      executableSHA256: try hashFile(executable),
      architectures: architectures,
      codeSignature: codeSignatureState(bundleURL: bundle)
    )
    return VST3PreparedBundle(bundleURL: bundle, executableURL: executable, report: report)
  }

  static var currentArchitecture: String {
    #if arch(arm64)
      return "arm64"
    #elseif arch(x86_64)
      return "x86_64"
    #else
      return "unsupported-current-architecture"
    #endif
  }

  private static func isInside(root: URL, candidate: URL) -> Bool {
    let rootParts = root.pathComponents
    let candidateParts = candidate.pathComponents
    return candidateParts.count >= rootParts.count
      && Array(candidateParts.prefix(rootParts.count)) == rootParts
  }

  private static func isDirectory(_ url: URL) -> Bool {
    (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
  }

  private static func isRegularFile(_ url: URL) -> Bool {
    (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
  }

  private static func executableArchitectures(bundleURL: URL) -> [String] {
    guard
      let values = CFBundleCopyExecutableArchitecturesForURL(bundleURL as CFURL) as? [NSNumber]
    else { return [] }
    return Array(Set(values.map { architectureName($0.intValue) })).sorted()
  }

  private static func architectureName(_ value: Int) -> String {
    switch value {
    case 7: return "i386"
    case 0x0100_0007: return "x86_64"
    case 12: return "arm"
    case 0x0100_000C: return "arm64"
    case 0x0200_000C: return "arm64_32"
    default: return "cpu-\(value)"
    }
  }

  private static func hashFile(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty {
      hasher.update(data: data)
    }
    return hasher.finalize().hexString
  }

  private static func codeSignatureState(bundleURL: URL) -> VST3CodeSignatureState {
    let process = Process()
    let standardError = Pipe()
    process.executableURL = URL(filePath: "/usr/bin/codesign")
    process.arguments = ["--verify", "--deep", "--strict", "--verbose=2", bundleURL.path]
    process.standardOutput = FileHandle.nullDevice
    process.standardError = standardError
    do {
      try process.run()
      process.waitUntilExit()
    } catch {
      return .unavailable
    }
    let errorData = standardError.fileHandleForReading.readDataToEndOfFile()
    let errorText = String(decoding: errorData.prefix(16_384), as: UTF8.self).lowercased()
    if process.terminationStatus == 0 { return .verified }
    if errorText.contains("code object is not signed at all") { return .unsigned }
    return .invalid
  }
}

extension Digest {
  fileprivate var hexString: String {
    map { String(format: "%02x", $0) }.joined()
  }
}
