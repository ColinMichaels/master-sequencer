import CryptoKit
import Darwin
import Foundation

public struct VST3PrivateCatalogEntry: Codable, Equatable, Sendable {
  public let rootID: String
  public let bundlePath: String
  public let bundleKey: String
  public let status: VST3ValidationAttemptStatus
  public let runtimeBlocked: Bool
  public let updatedAt: String
  public let workerReport: VST3WorkerReport?
}

public struct VST3PrivateCatalog: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public var entries: [VST3PrivateCatalogEntry]

  public init(entries: [VST3PrivateCatalogEntry] = []) {
    self.schemaVersion = 1
    self.entries = entries
  }
}

public enum VST3PrivateCatalogStore {
  private static let maximumBytes = 4_194_304

  public static func load(catalogURL: URL) throws -> VST3PrivateCatalog {
    guard FileManager.default.fileExists(atPath: catalogURL.path) else {
      return VST3PrivateCatalog()
    }
    guard
      let size = try catalogURL.resourceValues(forKeys: [.fileSizeKey]).fileSize,
      size <= maximumBytes,
      let catalog = try? JSONDecoder().decode(
        VST3PrivateCatalog.self,
        from: Data(contentsOf: catalogURL, options: [.mappedIfSafe])
      ),
      catalog.schemaVersion == 1
    else {
      throw VST3ValidationError.catalogInvalid
    }
    return catalog
  }

  public static func update(
    catalogURL: URL,
    rootID: String,
    bundleURL: URL,
    attempt: VST3ValidationAttemptReport
  ) throws {
    var catalog = try load(catalogURL: catalogURL)
    let resolvedBundle = bundleURL.resolvingSymlinksInPath().standardizedFileURL
    let bundleKey =
      attempt.workerReport?.preflight?.bundleKey
      ?? SHA256.hash(data: Data(resolvedBundle.path.utf8)).map {
        String(format: "%02x", $0)
      }.joined()
    let entry = VST3PrivateCatalogEntry(
      rootID: VST3PublicText.sanitize(rootID, fallback: "approved", limit: 64),
      bundlePath: resolvedBundle.path,
      bundleKey: bundleKey,
      status: attempt.status,
      runtimeBlocked: true,
      updatedAt: ISO8601DateFormatter().string(from: Date()),
      workerReport: attempt.workerReport
    )
    catalog.entries.removeAll { $0.bundlePath == resolvedBundle.path }
    catalog.entries.append(entry)
    catalog.entries.sort {
      $0.bundlePath.localizedStandardCompare($1.bundlePath) == .orderedAscending
    }

    try FileManager.default.createDirectory(
      at: catalogURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    let data = try encoder.encode(catalog)
    try data.write(to: catalogURL, options: [.atomic])
    guard Darwin.chmod(catalogURL.path, S_IRUSR | S_IWUSR) == 0 else {
      throw VST3ValidationError.catalogInvalid
    }
  }
}
