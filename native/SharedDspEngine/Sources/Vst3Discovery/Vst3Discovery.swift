import Foundation

public enum VST3RootKind: String, Codable, Sendable {
  case user
  case global
  case network
  case application
  case approved
}

public struct VST3ScanRoot: Sendable, Equatable {
  public let id: String
  public let kind: VST3RootKind
  public let url: URL

  public init(id: String, kind: VST3RootKind, url: URL) throws {
    guard Self.validID(id) else { throw VST3DiscoveryError.invalidRootID }
    self.id = id
    self.kind = kind
    self.url = url.standardizedFileURL
  }

  private static func validID(_ value: String) -> Bool {
    guard (1...64).contains(value.count) else { return false }
    return value.utf8.allSatisfy { byte in
      (byte >= 0x61 && byte <= 0x7A)
        || (byte >= 0x30 && byte <= 0x39)
        || byte == 0x2D
    }
  }
}

public enum VST3DiscoveryError: Error, Equatable {
  case invalidRootID
}

public enum VST3RootState: String, Codable, Sendable {
  case scanned
  case unavailable
}

public struct VST3RootReport: Codable, Equatable, Sendable {
  public let id: String
  public let kind: VST3RootKind
  public let state: VST3RootState
  public let bundlesFound: Int
}

public enum VST3PluginStatus: String, Codable, Sendable {
  case metadataOnly = "metadata-only"
  case shadowedDuplicate = "shadowed-duplicate"
}

public struct VST3PluginRecord: Codable, Equatable, Sendable {
  public let classID: String
  public let name: String
  public let vendor: String
  public let version: String
  public let sdkVersion: String
  public let subCategories: [String]
  public let moduleName: String
  public let moduleVersion: String
  public let sourceLabel: String
  public var status: VST3PluginStatus
}

public enum VST3ScanIssueCode: String, Codable, Sendable {
  case approvedRootUnavailable = "approved-root-unavailable"
  case bundleEscapesRoot = "bundle-escapes-root"
  case invalidBundle = "invalid-bundle"
  case moduleInfoMissing = "moduleinfo-missing"
  case moduleInfoEscapesBundle = "moduleinfo-escapes-bundle"
  case moduleInfoTooLarge = "moduleinfo-too-large"
  case moduleInfoInvalid = "moduleinfo-invalid"
  case noAudioProcessorClass = "no-audio-processor-class"
  case invalidClassID = "invalid-class-id"
  case duplicateClassID = "duplicate-class-id"
}

public struct VST3ScanIssue: Codable, Equatable, Sendable {
  public let code: VST3ScanIssueCode
  public let sourceLabel: String
  public let classID: String?
  public let message: String
}

public struct VST3DiscoverySummary: Codable, Equatable, Sendable {
  public let rootsRequested: Int
  public let rootsScanned: Int
  public let bundlesFound: Int
  public let processorsReadyForValidation: Int
  public let shadowedDuplicates: Int
  public let issues: Int
}

public struct VST3DiscoveryReport: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let scannerMode: String
  public let roots: [VST3RootReport]
  public let plugins: [VST3PluginRecord]
  public let issues: [VST3ScanIssue]
  public let summary: VST3DiscoverySummary
}

public enum VST3StandardLocations {
  public static func macOS(
    homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser,
    applicationBundleURL: URL? = Bundle.main.bundleURL
  ) -> [VST3ScanRoot] {
    var roots = [
      try! VST3ScanRoot(
        id: "user", kind: .user,
        url: homeDirectory.appending(
          path: "Library/Audio/Plug-Ins/VST3", directoryHint: .isDirectory)),
      try! VST3ScanRoot(
        id: "global", kind: .global,
        url: URL(filePath: "/Library/Audio/Plug-Ins/VST3", directoryHint: .isDirectory)),
      try! VST3ScanRoot(
        id: "network", kind: .network,
        url: URL(filePath: "/Network/Library/Audio/Plug-Ins/VST3", directoryHint: .isDirectory)),
    ]
    if let applicationBundleURL, applicationBundleURL.pathExtension.lowercased() == "app" {
      roots.append(
        try! VST3ScanRoot(
          id: "application",
          kind: .application,
          url: applicationBundleURL.appending(path: "Contents/VST3", directoryHint: .isDirectory)
        ))
    }
    return roots
  }
}

public struct VST3DiscoveryScanner {
  private static let maximumModuleInfoBytes = 1_048_576
  private let fileManager: FileManager

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  public func scan(roots: [VST3ScanRoot]) -> VST3DiscoveryReport {
    var rootReports: [VST3RootReport] = []
    var plugins: [VST3PluginRecord] = []
    var issues: [VST3ScanIssue] = []

    for root in roots {
      let resolvedRoot = root.url.resolvingSymlinksInPath().standardizedFileURL
      var isDirectory: ObjCBool = false
      guard fileManager.fileExists(atPath: resolvedRoot.path, isDirectory: &isDirectory),
        isDirectory.boolValue
      else {
        rootReports.append(
          VST3RootReport(id: root.id, kind: root.kind, state: .unavailable, bundlesFound: 0))
        if root.kind == .approved {
          issues.append(
            issue(
              .approvedRootUnavailable, source: root.id,
              message: "The approved scan root is unavailable."))
        }
        continue
      }

      let bundleURLs = discoverBundles(in: resolvedRoot, issues: &issues)
      rootReports.append(
        VST3RootReport(
          id: root.id, kind: root.kind, state: .scanned, bundlesFound: bundleURLs.count))
      for bundleURL in bundleURLs {
        plugins.append(contentsOf: inspectBundle(bundleURL, issues: &issues))
      }
    }

    var firstIndexByClassID: [String: Int] = [:]
    for index in plugins.indices {
      let classID = plugins[index].classID
      if firstIndexByClassID[classID] == nil {
        firstIndexByClassID[classID] = index
      } else {
        plugins[index].status = .shadowedDuplicate
        issues.append(
          issue(
            .duplicateClassID,
            source: plugins[index].sourceLabel,
            classID: classID,
            message: "A lower-priority duplicate processor Class ID was kept unavailable."
          ))
      }
    }

    plugins.sort {
      ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
        || ($0.name.caseInsensitiveCompare($1.name) == .orderedSame && $0.classID < $1.classID)
    }
    let ready = plugins.count { $0.status == .metadataOnly }
    let shadowed = plugins.count { $0.status == .shadowedDuplicate }
    return VST3DiscoveryReport(
      schemaVersion: 1,
      scannerMode: "metadata-only-no-binary-load",
      roots: rootReports,
      plugins: plugins,
      issues: issues,
      summary: VST3DiscoverySummary(
        rootsRequested: roots.count,
        rootsScanned: rootReports.count { $0.state == .scanned },
        bundlesFound: rootReports.reduce(0) { $0 + $1.bundlesFound },
        processorsReadyForValidation: ready,
        shadowedDuplicates: shadowed,
        issues: issues.count
      )
    )
  }

  private func discoverBundles(in root: URL, issues: inout [VST3ScanIssue]) -> [URL] {
    guard
      let enumerator = fileManager.enumerator(
        at: root,
        includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
        options: [.skipsHiddenFiles],
        errorHandler: { _, _ in true }
      )
    else { return [] }

    var bundles: [URL] = []
    for case let candidate as URL in enumerator {
      if candidate.pathExtension.lowercased() != "vst3",
        (try? candidate.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
      {
        enumerator.skipDescendants()
        continue
      }
      guard candidate.pathExtension.lowercased() == "vst3" else { continue }
      enumerator.skipDescendants()
      let sourceLabel = sanitized(
        candidate.lastPathComponent, fallback: "Unnamed VST3 bundle", limit: 120)
      let resolved = candidate.resolvingSymlinksInPath().standardizedFileURL
      guard isInside(root: root, candidate: resolved) else {
        issues.append(
          issue(
            .bundleEscapesRoot, source: sourceLabel,
            message: "The bundle resolves outside its approved scan root."))
        continue
      }
      var isDirectory: ObjCBool = false
      guard fileManager.fileExists(atPath: resolved.path, isDirectory: &isDirectory),
        isDirectory.boolValue
      else {
        issues.append(
          issue(
            .invalidBundle, source: sourceLabel,
            message: "The discovered VST3 item is not a bundle directory."))
        continue
      }
      bundles.append(resolved)
    }
    return bundles.sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
  }

  private func inspectBundle(_ bundleURL: URL, issues: inout [VST3ScanIssue]) -> [VST3PluginRecord]
  {
    let sourceLabel = sanitized(
      bundleURL.lastPathComponent, fallback: "Unnamed VST3 bundle", limit: 120)
    let modern = bundleURL.appending(
      path: "Contents/Resources/moduleinfo.json", directoryHint: .notDirectory)
    let legacy = bundleURL.appending(path: "Contents/moduleinfo.json", directoryHint: .notDirectory)
    let moduleInfoURL = fileManager.fileExists(atPath: modern.path) ? modern : legacy
    guard fileManager.fileExists(atPath: moduleInfoURL.path) else {
      issues.append(
        issue(
          .moduleInfoMissing, source: sourceLabel,
          message: "No moduleinfo.json is available; native factory validation is required."))
      return []
    }

    let resolvedModuleInfoURL = moduleInfoURL.resolvingSymlinksInPath().standardizedFileURL
    guard isInside(root: bundleURL, candidate: resolvedModuleInfoURL) else {
      issues.append(
        issue(
          .moduleInfoEscapesBundle, source: sourceLabel,
          message: "moduleinfo.json resolves outside its VST3 bundle."))
      return []
    }
    guard
      let values = try? resolvedModuleInfoURL.resourceValues(forKeys: [
        .isRegularFileKey, .fileSizeKey,
      ]),
      values.isRegularFile == true
    else {
      issues.append(
        issue(
          .moduleInfoInvalid, source: sourceLabel, message: "moduleinfo.json is not a regular file."
        ))
      return []
    }
    guard let fileSize = values.fileSize, fileSize <= Self.maximumModuleInfoBytes else {
      issues.append(
        issue(
          .moduleInfoTooLarge, source: sourceLabel,
          message: "moduleinfo.json exceeds the 1 MiB scanner limit."))
      return []
    }

    guard let data = try? Data(contentsOf: resolvedModuleInfoURL, options: [.mappedIfSafe]),
      let source = String(data: data, encoding: .utf8),
      let normalized = normalizeJSON5(source).data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: normalized) as? [String: Any],
      let classes = object["Classes"] as? [[String: Any]]
    else {
      issues.append(
        issue(
          .moduleInfoInvalid, source: sourceLabel,
          message: "moduleinfo.json could not be parsed safely."))
      return []
    }

    let moduleName = sanitized(
      object["Name"] as? String, fallback: sourceLabel.replacingOccurrences(of: ".vst3", with: ""),
      limit: 120)
    let moduleVersion = sanitized(object["Version"] as? String, fallback: "Unknown", limit: 64)
    let factory = object["Factory Info"] as? [String: Any]
    let factoryVendor = sanitized(
      factory?["Vendor"] as? String, fallback: "Unknown vendor", limit: 80)
    var records: [VST3PluginRecord] = []
    var sawAudioClass = false

    for entry in classes where entry["Category"] as? String == "Audio Module Class" {
      sawAudioClass = true
      guard let classID = normalizedClassID(entry["CID"] as? String) else {
        issues.append(
          issue(
            .invalidClassID, source: sourceLabel,
            message: "An audio processor class has an invalid Class ID."))
        continue
      }
      let categories = (entry["Sub Categories"] as? [Any] ?? [])
        .compactMap { $0 as? String }
        .map { sanitized($0, fallback: "", limit: 48) }
        .filter { !$0.isEmpty }
      records.append(
        VST3PluginRecord(
          classID: classID,
          name: sanitized(entry["Name"] as? String, fallback: moduleName, limit: 80),
          vendor: sanitized(entry["Vendor"] as? String, fallback: factoryVendor, limit: 80),
          version: sanitized(entry["Version"] as? String, fallback: moduleVersion, limit: 64),
          sdkVersion: sanitized(entry["SDKVersion"] as? String, fallback: "Unknown", limit: 64),
          subCategories: categories,
          moduleName: moduleName,
          moduleVersion: moduleVersion,
          sourceLabel: sourceLabel,
          status: .metadataOnly
        ))
    }

    if !sawAudioClass {
      issues.append(
        issue(
          .noAudioProcessorClass, source: sourceLabel,
          message: "The module metadata contains no audio processor class."))
    }
    return records
  }

  private func isInside(root: URL, candidate: URL) -> Bool {
    let rootParts = root.standardizedFileURL.pathComponents
    let candidateParts = candidate.standardizedFileURL.pathComponents
    return candidateParts.count >= rootParts.count
      && Array(candidateParts.prefix(rootParts.count)) == rootParts
  }

  private func normalizedClassID(_ value: String?) -> String? {
    guard let value else { return nil }
    guard value.allSatisfy({ $0.isHexDigit || "-{} ".contains($0) }) else { return nil }
    let compact = value.uppercased().filter { $0.isHexDigit }
    return compact.count == 32 ? compact : nil
  }

  private func issue(
    _ code: VST3ScanIssueCode, source: String, classID: String? = nil, message: String
  ) -> VST3ScanIssue {
    VST3ScanIssue(
      code: code, sourceLabel: sanitized(source, fallback: "Unknown source", limit: 120),
      classID: classID, message: message)
  }

  private func sanitized(_ value: String?, fallback: String, limit: Int) -> String {
    let clean = (value ?? "")
      .components(separatedBy: .controlCharacters)
      .joined(separator: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let safeValue = clean.isEmpty || containsAbsolutePath(clean) ? fallback : clean
    return String(safeValue.prefix(limit))
  }

  private func containsAbsolutePath(_ value: String) -> Bool {
    let lowered = value.lowercased()
    if lowered.hasPrefix("/")
      || lowered.hasPrefix("~/")
      || lowered.hasPrefix("file://")
      || lowered.contains("/users/")
      || lowered.contains("/library/")
      || lowered.contains("/network/")
    {
      return true
    }
    let characters = Array(value)
    return characters.count >= 3
      && characters[0].isLetter
      && characters[1] == ":"
      && (characters[2] == "\\" || characters[2] == "/")
  }

  private func normalizeJSON5(_ source: String) -> String {
    let characters = Array(source)
    var withoutComments = ""
    var index = 0
    var inString = false
    var escaped = false
    var lineComment = false
    var blockComment = false

    while index < characters.count {
      let character = characters[index]
      let next = index + 1 < characters.count ? characters[index + 1] : "\0"
      if lineComment {
        if character == "\n" {
          lineComment = false
          withoutComments.append(character)
        }
      } else if blockComment {
        if character == "*" && next == "/" {
          blockComment = false
          index += 1
        }
      } else if inString {
        withoutComments.append(character)
        if escaped {
          escaped = false
        } else if character == "\\" {
          escaped = true
        } else if character == "\"" {
          inString = false
        }
      } else if character == "\"" {
        inString = true
        withoutComments.append(character)
      } else if character == "/" && next == "/" {
        lineComment = true
        index += 1
      } else if character == "/" && next == "*" {
        blockComment = true
        index += 1
      } else {
        withoutComments.append(character)
      }
      index += 1
    }

    let stripped = Array(withoutComments)
    var result = ""
    index = 0
    inString = false
    escaped = false
    while index < stripped.count {
      let character = stripped[index]
      if inString {
        result.append(character)
        if escaped {
          escaped = false
        } else if character == "\\" {
          escaped = true
        } else if character == "\"" {
          inString = false
        }
      } else if character == "\"" {
        inString = true
        result.append(character)
      } else if character == "," {
        var lookahead = index + 1
        while lookahead < stripped.count && stripped[lookahead].isWhitespace { lookahead += 1 }
        if lookahead >= stripped.count || (stripped[lookahead] != "]" && stripped[lookahead] != "}")
        {
          result.append(character)
        }
      } else {
        result.append(character)
      }
      index += 1
    }
    return result
  }
}
