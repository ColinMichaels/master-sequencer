import Darwin
import Foundation
import Vst3Validation

private let processorClassID = "BD58B550F9E5634E9D2EFF39EA0927B1"

private enum SelfTestFailure: Error { case assertion(String) }

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

private func runCodeSign(_ arguments: [String]) throws {
  let process = Process()
  process.executableURL = URL(filePath: "/usr/bin/codesign")
  process.arguments = arguments
  process.standardOutput = FileHandle.nullDevice
  process.standardError = FileHandle.nullDevice
  try process.run()
  process.waitUntilExit()
  guard process.terminationStatus == 0 else {
    throw SelfTestFailure.assertion("fixture code-signing operation failed")
  }
}

private func makeFixtureBundle(rootURL: URL, fixtureLibraryURL: URL) throws -> URL {
  let bundleURL = rootURL.appending(path: "InstanceFixture.vst3", directoryHint: .isDirectory)
  let contentsURL = bundleURL.appending(path: "Contents", directoryHint: .isDirectory)
  let executableDirectoryURL = contentsURL.appending(path: "MacOS", directoryHint: .isDirectory)
  let executableURL = executableDirectoryURL.appending(
    path: "InstanceFixture",
    directoryHint: .notDirectory
  )
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
    "CFBundleExecutable": "InstanceFixture",
    "CFBundleIdentifier": "local.project-sequencer.vst3-instance-fixture",
    "CFBundleInfoDictionaryVersion": "6.0",
    "CFBundleName": "InstanceFixture",
    "CFBundlePackageType": "BNDL",
    "CFBundleShortVersionString": "1.0",
    "CFBundleVersion": "1",
  ]
  let data = try PropertyListSerialization.data(
    fromPropertyList: propertyList,
    format: .xml,
    options: 0
  )
  try data.write(to: contentsURL.appending(path: "Info.plist", directoryHint: .notDirectory))
  try runCodeSign(["--force", "--deep", "--sign", "-", bundleURL.path])
  return bundleURL
}

private func testDirectLab(rootURL: URL, bundleURL: URL) throws -> VST3InstanceLabReport {
  let report = VST3InstanceLabWorker.inspect(
    approvedRootURL: rootURL,
    bundleURL: bundleURL,
    processorClassID: processorClassID,
    allowUnsigned: false
  )
  try require(report.status == .passed, "generated instance lab failed: \(report)")
  try require(report.runtimeBlocked, "instance lab accidentally enabled runtime")
  try require(report.parameters.count == 1, "fixture parameter count changed")
  try require(report.parameters[0].parameterID == 100, "fixture parameter ID changed")
  try require(report.parameters[0].title == "Gain", "fixture parameter title changed")
  try require(report.writableParameterRoundTrip, "writable parameter did not round-trip")
  try require(report.state?.componentBytes == 12, "component state size changed")
  try require(report.state?.controllerBytes == 12, "controller state size changed")
  try require(report.state?.componentRoundTrip == true, "component state did not round-trip")
  try require(report.state?.controllerRoundTrip == true, "controller state did not round-trip")
  try require(report.offline?.latencySamples == 64, "latency report changed")
  try require(report.offline?.tailSamples == 96, "tail report changed")
  try require(report.offline?.processedBlocks == 4, "offline block count changed")
  try require(report.offline?.zeroInputPeak == 0, "zero input produced unexpected output")
  try require(report.offline?.outputIsFinite == true, "offline output was not finite")
  let publicJSON = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
  try require(!publicJSON.contains(rootURL.path), "instance lab disclosed an absolute root path")
  return report
}

private func testCoordinator(
  executableDirectoryURL: URL,
  rootURL: URL,
  bundleURL: URL
) throws {
  let attempt = VST3InstanceLabCoordinator.validate(
    workerURL: executableDirectoryURL.appending(
      path: "shared-vst3-instance-lab-worker",
      directoryHint: .notDirectory
    ),
    rootID: "fixture-instance-root",
    approvedRootURL: rootURL,
    bundleURL: bundleURL,
    processorClassID: processorClassID,
    timeoutMilliseconds: 5_000,
    allowUnsigned: false
  )
  try require(attempt.status == .passed, "disposable instance-lab worker failed")
  try require(attempt.labReport?.runtimeBlocked == true, "coordinator lost runtime block")
}

private func testOversizedState(rootURL: URL, bundleURL: URL) throws {
  setenv("PROJECT_SEQUENCER_VST3_FIXTURE_OVERSIZED_STATE", "1", 1)
  defer { unsetenv("PROJECT_SEQUENCER_VST3_FIXTURE_OVERSIZED_STATE") }
  let report = VST3InstanceLabWorker.inspect(
    approvedRootURL: rootURL,
    bundleURL: bundleURL,
    processorClassID: processorClassID,
    allowUnsigned: false
  )
  try require(report.failureCode == .stateTooLarge, "oversized state did not fail at 1 MiB")
}

private func testContainmentAndIdentity(rootURL: URL, bundleURL: URL) throws {
  let outsideRoot = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: outsideRoot) }
  let outside = VST3InstanceLabWorker.inspect(
    approvedRootURL: outsideRoot,
    bundleURL: bundleURL,
    processorClassID: processorClassID,
    allowUnsigned: false
  )
  try require(
    outside.failureCode == .bundleOutsideApprovedRoot,
    "bundle outside the approved root was accepted"
  )
  let invalidClass = VST3InstanceLabWorker.inspect(
    approvedRootURL: rootURL,
    bundleURL: bundleURL,
    processorClassID: "not-a-class-id",
    allowUnsigned: false
  )
  try require(invalidClass.failureCode == .invalidClassID, "invalid Class ID was accepted")
}

private func testProcessClassifications() throws {
  let timedOut = VST3SubprocessResult(
    elapsedMilliseconds: 100,
    timedOut: true,
    terminationStatus: SIGTERM,
    terminationReason: .uncaughtSignal,
    standardOutput: Data(),
    outputWasTruncated: false
  )
  try require(
    VST3InstanceLabCoordinator.classifySubprocess(timedOut).status == .timedOut,
    "instance-lab timeout was not quarantined"
  )
  let crashed = VST3SubprocessResult(
    elapsedMilliseconds: 2,
    timedOut: false,
    terminationStatus: SIGSEGV,
    terminationReason: .uncaughtSignal,
    standardOutput: Data(),
    outputWasTruncated: false
  )
  try require(
    VST3InstanceLabCoordinator.classifySubprocess(crashed).status == .crashed,
    "instance-lab crash was not quarantined"
  )
  let malformed = VST3SubprocessResult(
    elapsedMilliseconds: 1,
    timedOut: false,
    terminationStatus: 0,
    terminationReason: .exit,
    standardOutput: Data("not-json".utf8),
    outputWasTruncated: false
  )
  try require(
    VST3InstanceLabCoordinator.classifySubprocess(malformed).status == .malformedOutput,
    "malformed instance-lab output was accepted"
  )
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
    "build all SwiftPM products before running the instance-lab self-test"
  )
  let rootURL = try temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: rootURL) }
  let bundleURL = try makeFixtureBundle(rootURL: rootURL, fixtureLibraryURL: fixtureLibraryURL)
  _ = try testDirectLab(rootURL: rootURL, bundleURL: bundleURL)
  try testCoordinator(
    executableDirectoryURL: executableDirectoryURL,
    rootURL: rootURL,
    bundleURL: bundleURL
  )
  try testOversizedState(rootURL: rootURL, bundleURL: bundleURL)
  try testContainmentAndIdentity(rootURL: rootURL, bundleURL: bundleURL)
  try testProcessClassifications()
  print("VST3 disposable instance lab self-test passed (12 checks).")
} catch {
  FileHandle.standardError.write(Data("VST3 instance lab self-test failed: \(error)\n".utf8))
  exit(EXIT_FAILURE)
}
