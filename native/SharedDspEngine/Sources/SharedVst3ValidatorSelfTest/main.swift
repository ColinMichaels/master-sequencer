import Darwin
import Foundation
import Vst3Validation

private let processorClassID = "BD58B550F9E5634E9D2EFF39EA0927B1"

private enum SelfTestFailure: Error {
  case assertion(String)
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw SelfTestFailure.assertion(message) }
}

private func temporaryDirectory() throws -> URL {
  let url = FileManager.default.temporaryDirectory.appending(
    path: UUID().uuidString,
    directoryHint: .isDirectory
  )
  try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
  return url
}

private func makeFixtureBundle(rootURL: URL, fixtureLibraryURL: URL) throws -> URL {
  let bundleURL = rootURL.appending(path: "Fixture.vst3", directoryHint: .isDirectory)
  let contentsURL = bundleURL.appending(path: "Contents", directoryHint: .isDirectory)
  let executableDirectoryURL = contentsURL.appending(path: "MacOS", directoryHint: .isDirectory)
  let executableURL = executableDirectoryURL.appending(
    path: "Fixture", directoryHint: .notDirectory)
  try FileManager.default.createDirectory(
    at: executableDirectoryURL,
    withIntermediateDirectories: true
  )
  try FileManager.default.copyItem(at: fixtureLibraryURL, to: executableURL)
  guard Darwin.chmod(executableURL.path, S_IRUSR | S_IWUSR | S_IXUSR) == 0 else {
    throw SelfTestFailure.assertion("fixture executable permissions could not be set")
  }
  let propertyList: [String: Any] = [
    "CFBundleDevelopmentRegion": "en",
    "CFBundleExecutable": "Fixture",
    "CFBundleIdentifier": "local.project-sequencer.vst3-fixture",
    "CFBundleInfoDictionaryVersion": "6.0",
    "CFBundleName": "Fixture",
    "CFBundlePackageType": "BNDL",
    "CFBundleShortVersionString": "1.0",
    "CFBundleVersion": "1",
  ]
  let propertyListData = try PropertyListSerialization.data(
    fromPropertyList: propertyList,
    format: .xml,
    options: 0
  )
  try propertyListData.write(
    to: contentsURL.appending(path: "Info.plist", directoryHint: .notDirectory)
  )
  try runCodeSign(["--force", "--deep", "--sign", "-", bundleURL.path])
  return bundleURL
}

private func runCodeSign(_ arguments: [String]) throws {
  let process = Process()
  process.executableURL = URL(filePath: "/usr/bin/codesign")
  process.arguments = arguments
  process.standardOutput = FileHandle.nullDevice
  process.standardError = FileHandle.nullDevice
  try process.run()
  process.waitUntilExit()
  guard process.terminationStatus == 0 else {
    throw SelfTestFailure.assertion("fixture test code-signing operation failed")
  }
}

private func testFactoryEnumeration(
  rootURL: URL,
  bundleURL: URL
) throws -> VST3WorkerReport {
  let report = VST3FactoryWorker.inspect(
    approvedRootURL: rootURL,
    bundleURL: bundleURL,
    allowUnsigned: true
  )
  try require(report.status == .factoryEnumerated, "fixture factory was not enumerated: \(report)")
  try require(report.processorClasses.count == 1, "controller class escaped processor filtering")
  try require(report.processorClasses[0].classID == processorClassID, "processor Class ID changed")
  try require(report.factoryVendor == "Project Sequencer Fixture Audio", "factory vendor changed")
  let publicJSON = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
  try require(!publicJSON.contains(rootURL.path), "public worker report disclosed a root path")
  return report
}

private func testUnsignedGate(rootURL: URL, bundleURL: URL) throws {
  let unsignedBundleURL = rootURL.appending(
    path: "UnsignedFixture.vst3",
    directoryHint: .isDirectory
  )
  try FileManager.default.copyItem(at: bundleURL, to: unsignedBundleURL)
  try runCodeSign(["--remove-signature", unsignedBundleURL.path])
  try runCodeSign([
    "--remove-signature",
    unsignedBundleURL.appending(path: "Contents/MacOS/Fixture", directoryHint: .notDirectory).path,
  ])
  let report = VST3FactoryWorker.inspect(
    approvedRootURL: rootURL,
    bundleURL: unsignedBundleURL,
    allowUnsigned: false
  )
  try require(report.status == .rejected, "unsigned fixture bypassed the explicit unsigned gate")
  try require(report.failureCode == .unsignedCode, "unsigned fixture had the wrong failure code")
}

private func testCoordinator(
  executableDirectoryURL: URL,
  rootURL: URL,
  bundleURL: URL
) throws -> VST3ValidationAttemptReport {
  let attempt = VST3ValidationCoordinator.validate(
    workerURL: executableDirectoryURL.appending(
      path: "shared-vst3-validator-worker",
      directoryHint: .notDirectory
    ),
    rootID: "fixture-root",
    approvedRootURL: rootURL,
    bundleURL: bundleURL,
    timeoutMilliseconds: 5_000,
    allowUnsigned: true
  )
  try require(attempt.status == .factoryEnumerated, "disposable worker validation failed")
  try require(attempt.workerReport?.processorClasses.count == 1, "worker report was not preserved")
  return attempt
}

private func testTimeoutAndCrash(executableURL: URL) throws {
  let timeoutResult = try VST3SubprocessRunner.run(
    executableURL: executableURL,
    arguments: ["--hang-child"],
    timeoutMilliseconds: 100
  )
  try require(
    VST3ValidationCoordinator.classifySubprocess(timeoutResult).status == .timedOut,
    "hung worker was not timed out and quarantined"
  )

  let crashResult = try VST3SubprocessRunner.run(
    executableURL: executableURL,
    arguments: ["--crash-child"],
    timeoutMilliseconds: 2_000
  )
  try require(
    VST3ValidationCoordinator.classifySubprocess(crashResult).status == .crashed,
    "signaled worker was not crash-quarantined"
  )
}

private func testMalformedOutputClassification() throws {
  let result = VST3SubprocessResult(
    elapsedMilliseconds: 1,
    timedOut: false,
    terminationStatus: 0,
    terminationReason: .exit,
    standardOutput: Data("not-json".utf8),
    outputWasTruncated: false
  )
  try require(
    VST3ValidationCoordinator.classifySubprocess(result).status == .malformedOutput,
    "malformed worker output was accepted"
  )
}

private func testPrivateCatalog(
  rootURL: URL,
  bundleURL: URL,
  attempt: VST3ValidationAttemptReport
) throws {
  let catalogURL = rootURL.appending(path: "catalog.json", directoryHint: .notDirectory)
  try VST3PrivateCatalogStore.update(
    catalogURL: catalogURL,
    rootID: "fixture-root",
    bundleURL: bundleURL,
    attempt: attempt
  )
  let catalog = try VST3PrivateCatalogStore.load(catalogURL: catalogURL)
  try require(catalog.entries.count == 1, "private catalog did not retain the fixture")
  try require(catalog.entries[0].bundlePath == bundleURL.path, "private catalog lost its path")
  try require(catalog.entries[0].runtimeBlocked, "factory enumeration accidentally enabled runtime")
  let attributes = try FileManager.default.attributesOfItem(atPath: catalogURL.path)
  let permissions = (attributes[.posixPermissions] as? NSNumber)?.intValue
  try require(permissions == 0o600, "private catalog is not mode 0600")
}

private func testBundleEscapeRejected(bundleURL: URL) throws {
  let differentRoot = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: differentRoot) }
  let report = VST3FactoryWorker.inspect(
    approvedRootURL: differentRoot,
    bundleURL: bundleURL,
    allowUnsigned: true
  )
  try require(
    report.failureCode == .bundleOutsideApprovedRoot,
    "bundle outside the approved root was not rejected"
  )
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments == ["--hang-child"] {
  sleep(5)
  exit(EXIT_SUCCESS)
}
if arguments == ["--crash-child"] {
  raise(SIGSEGV)
  exit(EXIT_FAILURE)
}

do {
  let ownExecutableURL = URL(filePath: CommandLine.arguments[0]).standardizedFileURL
  let executableDirectoryURL = ownExecutableURL.deletingLastPathComponent()
  let fixtureLibraryURL = executableDirectoryURL.appending(
    path: "libVst3FactoryFixture.dylib",
    directoryHint: .notDirectory
  )
  try require(
    FileManager.default.fileExists(atPath: fixtureLibraryURL.path),
    "build all SwiftPM products before running the validator self-test"
  )
  let rootURL = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: rootURL) }
  let bundleURL = try makeFixtureBundle(
    rootURL: rootURL,
    fixtureLibraryURL: fixtureLibraryURL
  )
  _ = try testFactoryEnumeration(rootURL: rootURL, bundleURL: bundleURL)
  try testUnsignedGate(rootURL: rootURL, bundleURL: bundleURL)
  let attempt = try testCoordinator(
    executableDirectoryURL: executableDirectoryURL,
    rootURL: rootURL,
    bundleURL: bundleURL
  )
  try testTimeoutAndCrash(executableURL: ownExecutableURL)
  try testMalformedOutputClassification()
  try testPrivateCatalog(rootURL: rootURL, bundleURL: bundleURL, attempt: attempt)
  try testBundleEscapeRejected(bundleURL: bundleURL)
  print("VST3 disposable validator self-test passed (10 checks).")
} catch {
  FileHandle.standardError.write(Data("VST3 validator self-test failed: \(error)\n".utf8))
  exit(EXIT_FAILURE)
}
