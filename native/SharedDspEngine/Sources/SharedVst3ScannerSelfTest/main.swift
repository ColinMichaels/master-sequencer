import Darwin
import Foundation
import Vst3Discovery

private let processorClassID = "BD58B550F9E5634E9D2EFF39EA0927B1"

private enum SelfTestFailure: Error {
  case assertion(String)
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw SelfTestFailure.assertion(message) }
}

private func temporaryDirectory() throws -> URL {
  let url = FileManager.default.temporaryDirectory.appending(
    path: UUID().uuidString, directoryHint: .isDirectory)
  try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
  return url
}

private func makeBundle(at root: URL, name: String, classID: String = processorClassID) throws
  -> URL
{
  let bundle = root.appending(path: "\(name).vst3", directoryHint: .isDirectory)
  let resources = bundle.appending(path: "Contents/Resources", directoryHint: .isDirectory)
  try FileManager.default.createDirectory(at: resources, withIntermediateDirectories: true)
  let moduleInfo = """
    {
      // VST3 module metadata permits comments and trailing commas.
      "Name": "\(name)",
      "Version": "1.2.3",
      "Factory Info": { "Vendor": "Fixture Audio", },
      "Classes": [
        {
          "CID": "\(classID)",
          "Category": "Audio Module Class",
          "Name": "\(name) Processor",
          "Vendor": "Fixture Audio",
          "Version": "1.2.3",
          "SDKVersion": "VST 3.8.0",
          "Sub Categories": ["Fx", "Mastering",],
        },
        {
          "CID": "A0B1A6F4005D9B47967177E37A671891",
          "Category": "Component Controller Class",
          "Name": "Ignored Controller",
        },
      ],
    }
    """
  try Data(moduleInfo.utf8).write(to: resources.appending(path: "moduleinfo.json"))
  return bundle
}

private func testMetadataDiscoveryIsPathFree() throws {
  let rootURL = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: rootURL) }
  _ = try makeBundle(at: rootURL, name: "Fixture")
  let root = try VST3ScanRoot(id: "approved-test", kind: .approved, url: rootURL)

  let report = VST3DiscoveryScanner().scan(roots: [root])

  try require(report.summary.bundlesFound == 1, "expected one discovered bundle")
  try require(report.summary.processorsReadyForValidation == 1, "expected one processor candidate")
  try require(
    report.plugins.count == 1, "controller classes must stay out of the processor catalog")
  try require(report.plugins[0].classID == processorClassID, "processor Class ID changed")
  try require(
    report.plugins[0].subCategories == ["Fx", "Mastering"], "subcategories were not preserved")
  let encoded = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
  try require(!encoded.contains(rootURL.path), "report disclosed the approved root path")
}

private func testDuplicateClassIDsAreShadowed() throws {
  let firstRootURL = try temporaryDirectory()
  let secondRootURL = try temporaryDirectory()
  defer {
    try? FileManager.default.removeItem(at: firstRootURL)
    try? FileManager.default.removeItem(at: secondRootURL)
  }
  _ = try makeBundle(at: firstRootURL, name: "Preferred")
  _ = try makeBundle(at: secondRootURL, name: "Shadowed")
  let roots = [
    try VST3ScanRoot(id: "approved-first", kind: .approved, url: firstRootURL),
    try VST3ScanRoot(id: "approved-second", kind: .approved, url: secondRootURL),
  ]

  let report = VST3DiscoveryScanner().scan(roots: roots)

  try require(
    report.summary.processorsReadyForValidation == 1,
    "duplicate Class IDs must have one preferred candidate")
  try require(report.summary.shadowedDuplicates == 1, "lower-priority duplicate was not shadowed")
  try require(
    report.plugins.first(where: { $0.sourceLabel == "Preferred.vst3" })?.status == .metadataOnly,
    "first root did not retain priority")
  try require(
    report.plugins.first(where: { $0.sourceLabel == "Shadowed.vst3" })?.status
      == .shadowedDuplicate, "second root duplicate remained available")
  try require(
    report.issues.contains { $0.code == .duplicateClassID && $0.classID == processorClassID },
    "duplicate issue was not reported")
}

private func testSymlinkEscapeIsRejected() throws {
  let rootURL = try temporaryDirectory()
  let outsideURL = try temporaryDirectory()
  defer {
    try? FileManager.default.removeItem(at: rootURL)
    try? FileManager.default.removeItem(at: outsideURL)
  }
  let outsideBundle = try makeBundle(at: outsideURL, name: "Outside")
  try FileManager.default.createSymbolicLink(
    at: rootURL.appending(path: "Linked.vst3", directoryHint: .isDirectory),
    withDestinationURL: outsideBundle
  )
  let root = try VST3ScanRoot(id: "approved-test", kind: .approved, url: rootURL)

  let report = VST3DiscoveryScanner().scan(roots: [root])

  try require(report.plugins.isEmpty, "bundle resolving outside the root was cataloged")
  try require(
    report.issues.contains { $0.code == .bundleEscapesRoot }, "symlink escape was not reported")
}

private func testMissingApprovedRootIsSanitized() throws {
  let missingURL = FileManager.default.temporaryDirectory.appending(
    path: UUID().uuidString, directoryHint: .isDirectory)
  let root = try VST3ScanRoot(id: "approved-missing", kind: .approved, url: missingURL)

  let report = VST3DiscoveryScanner().scan(roots: [root])

  try require(report.roots.count == 1, "missing root report changed")
  try require(report.roots[0].id == "approved-missing", "missing root identifier changed")
  try require(report.roots[0].kind == .approved, "missing root kind changed")
  try require(report.roots[0].state == .unavailable, "missing root state was not retained")
  try require(report.roots[0].bundlesFound == 0, "missing root reported bundles")
  try require(
    report.issues.map(\.code) == [.approvedRootUnavailable], "missing approved root issue changed")
  let encoded = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
  try require(
    !encoded.contains(missingURL.path), "missing approved root path leaked into the report")
}

private func testModuleInfoSymlinkEscapeIsRejected() throws {
  let rootURL = try temporaryDirectory()
  let outsideURL = try temporaryDirectory()
  defer {
    try? FileManager.default.removeItem(at: rootURL)
    try? FileManager.default.removeItem(at: outsideURL)
  }
  let bundle = try makeBundle(at: rootURL, name: "LinkedMetadata")
  let metadataURL = bundle.appending(path: "Contents/Resources/moduleinfo.json")
  let outsideMetadataURL = outsideURL.appending(path: "moduleinfo.json")
  try FileManager.default.moveItem(at: metadataURL, to: outsideMetadataURL)
  try FileManager.default.createSymbolicLink(
    at: metadataURL, withDestinationURL: outsideMetadataURL)
  let root = try VST3ScanRoot(id: "approved-test", kind: .approved, url: rootURL)

  let report = VST3DiscoveryScanner().scan(roots: [root])

  try require(report.plugins.isEmpty, "metadata resolving outside the bundle was cataloged")
  try require(
    report.issues.contains { $0.code == .moduleInfoEscapesBundle },
    "metadata symlink escape was not reported")
}

private func testOversizedModuleInfoIsRejected() throws {
  let rootURL = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: rootURL) }
  let bundle = try makeBundle(at: rootURL, name: "OversizedMetadata")
  let metadataURL = bundle.appending(path: "Contents/Resources/moduleinfo.json")
  try Data(repeating: 0x20, count: 1_048_577).write(to: metadataURL)
  let root = try VST3ScanRoot(id: "approved-test", kind: .approved, url: rootURL)

  let report = VST3DiscoveryScanner().scan(roots: [root])

  try require(report.plugins.isEmpty, "oversized metadata was cataloged")
  try require(
    report.issues.contains { $0.code == .moduleInfoTooLarge }, "oversized metadata was not reported"
  )
}

private func testMetadataCannotSmuggleAbsolutePaths() throws {
  let rootURL = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: rootURL) }
  let bundle = try makeBundle(at: rootURL, name: "PathMetadata")
  let metadataURL = bundle.appending(path: "Contents/Resources/moduleinfo.json")
  let original = try String(contentsOf: metadataURL, encoding: .utf8)
  let poisoned = original.replacingOccurrences(
    of: "Fixture Audio", with: "Saved at /Users/private/plugin")
  try Data(poisoned.utf8).write(to: metadataURL)
  let root = try VST3ScanRoot(id: "approved-test", kind: .approved, url: rootURL)

  let report = VST3DiscoveryScanner().scan(roots: [root])
  let encoded = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)

  try require(
    report.plugins.count == 1, "path-like vendor metadata invalidated the processor identity")
  try require(
    report.plugins[0].vendor == "Unknown vendor", "path-like vendor metadata was retained")
  try require(!encoded.contains("/Users/"), "metadata smuggled an absolute path into the report")
}

do {
  try testMetadataDiscoveryIsPathFree()
  try testDuplicateClassIDsAreShadowed()
  try testSymlinkEscapeIsRejected()
  try testMissingApprovedRootIsSanitized()
  try testModuleInfoSymlinkEscapeIsRejected()
  try testOversizedModuleInfoIsRejected()
  try testMetadataCannotSmuggleAbsolutePaths()
  print("VST3 metadata scanner self-test passed (7 checks).")
} catch {
  FileHandle.standardError.write(Data("VST3 metadata scanner self-test failed: \(error)\n".utf8))
  exit(1)
}
