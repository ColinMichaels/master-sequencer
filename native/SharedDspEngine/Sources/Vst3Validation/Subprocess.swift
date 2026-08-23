import Darwin
import Dispatch
import Foundation
import Vst3Discovery

public struct VST3SubprocessResult: Sendable {
  public let elapsedMilliseconds: Int
  public let timedOut: Bool
  public let terminationStatus: Int32
  public let terminationReason: Process.TerminationReason
  public let standardOutput: Data
  public let outputWasTruncated: Bool

  public init(
    elapsedMilliseconds: Int,
    timedOut: Bool,
    terminationStatus: Int32,
    terminationReason: Process.TerminationReason,
    standardOutput: Data,
    outputWasTruncated: Bool
  ) {
    self.elapsedMilliseconds = elapsedMilliseconds
    self.timedOut = timedOut
    self.terminationStatus = terminationStatus
    self.terminationReason = terminationReason
    self.standardOutput = standardOutput
    self.outputWasTruncated = outputWasTruncated
  }
}

private final class BoundedPipeCollector: @unchecked Sendable {
  private let limit: Int
  private let lock = NSLock()
  private var data = Data()
  private var truncated = false
  private let group = DispatchGroup()

  init(limit: Int) {
    self.limit = limit
  }

  func start(_ handle: FileHandle) {
    group.enter()
    DispatchQueue.global(qos: .utility).async { [self] in
      defer { group.leave() }
      while true {
        let chunk = handle.availableData
        if chunk.isEmpty { break }
        lock.lock()
        if data.count < limit {
          let remaining = limit - data.count
          data.append(chunk.prefix(remaining))
        }
        if data.count >= limit, chunk.count > 0 { truncated = true }
        lock.unlock()
      }
    }
  }

  func finish() -> (Data, Bool) {
    group.wait()
    lock.lock()
    defer { lock.unlock() }
    return (data, truncated)
  }
}

public enum VST3SubprocessRunner {
  public static func run(
    executableURL: URL,
    arguments: [String],
    timeoutMilliseconds: Int,
    environment: [String: String]? = nil
  ) throws -> VST3SubprocessResult {
    let process = Process()
    let outputPipe = Pipe()
    let errorPipe = Pipe()
    let outputCollector = BoundedPipeCollector(limit: 262_144)
    let errorCollector = BoundedPipeCollector(limit: 262_144)
    process.executableURL = executableURL
    process.arguments = arguments
    process.environment = environment
    process.standardOutput = outputPipe
    process.standardError = errorPipe
    outputCollector.start(outputPipe.fileHandleForReading)
    errorCollector.start(errorPipe.fileHandleForReading)

    let clock = ContinuousClock()
    let started = clock.now
    try process.run()
    let boundedTimeout = max(100, min(timeoutMilliseconds, 120_000))
    let deadline = started.advanced(by: .milliseconds(boundedTimeout))
    var timedOut = false
    while process.isRunning, clock.now < deadline {
      Thread.sleep(forTimeInterval: 0.01)
    }
    if process.isRunning {
      timedOut = true
      process.terminate()
      let terminateDeadline = clock.now.advanced(by: .milliseconds(100))
      while process.isRunning, clock.now < terminateDeadline {
        Thread.sleep(forTimeInterval: 0.01)
      }
      if process.isRunning {
        Darwin.kill(process.processIdentifier, SIGKILL)
      }
    }
    process.waitUntilExit()
    let (standardOutput, outputTruncated) = outputCollector.finish()
    let (_, errorTruncated) = errorCollector.finish()
    let elapsed = started.duration(to: clock.now)
    let components = elapsed.components
    let elapsedMilliseconds =
      Int(components.seconds * 1_000)
      + Int(components.attoseconds / 1_000_000_000_000_000)
    return VST3SubprocessResult(
      elapsedMilliseconds: elapsedMilliseconds,
      timedOut: timedOut,
      terminationStatus: process.terminationStatus,
      terminationReason: process.terminationReason,
      standardOutput: standardOutput,
      outputWasTruncated: outputTruncated || errorTruncated
    )
  }
}

public enum VST3ValidationCoordinator {
  public static func validate(
    workerURL: URL,
    rootID: String,
    approvedRootURL: URL,
    bundleURL: URL,
    timeoutMilliseconds: Int,
    allowUnsigned: Bool
  ) -> VST3ValidationAttemptReport {
    guard
      (try? VST3ScanRoot(id: rootID, kind: .approved, url: approvedRootURL)) != nil
    else {
      return VST3ValidationAttemptReport(
        status: .failed,
        elapsedMilliseconds: 0,
        workerReport: nil
      )
    }
    var arguments = [
      "--allow-binary-load",
      "--approved-root", rootID, approvedRootURL.path,
      "--bundle", bundleURL.path,
    ]
    if allowUnsigned { arguments.append("--allow-unsigned") }
    do {
      let result = try VST3SubprocessRunner.run(
        executableURL: workerURL,
        arguments: arguments,
        timeoutMilliseconds: timeoutMilliseconds
      )
      return classifySubprocess(result)
    } catch {
      return VST3ValidationAttemptReport(
        status: .failed,
        elapsedMilliseconds: 0,
        workerReport: nil
      )
    }
  }

  public static func classifySubprocess(
    _ result: VST3SubprocessResult
  ) -> VST3ValidationAttemptReport {
    if result.timedOut {
      return VST3ValidationAttemptReport(
        status: .timedOut,
        elapsedMilliseconds: result.elapsedMilliseconds,
        workerReport: nil
      )
    }
    if result.terminationReason == .uncaughtSignal {
      return VST3ValidationAttemptReport(
        status: .crashed,
        elapsedMilliseconds: result.elapsedMilliseconds,
        workerReport: nil
      )
    }
    guard !result.outputWasTruncated else {
      return VST3ValidationAttemptReport(
        status: .malformedOutput,
        elapsedMilliseconds: result.elapsedMilliseconds,
        workerReport: nil
      )
    }
    guard
      let worker = try? JSONDecoder().decode(
        VST3WorkerReport.self,
        from: result.standardOutput
      )
    else {
      return VST3ValidationAttemptReport(
        status: .malformedOutput,
        elapsedMilliseconds: result.elapsedMilliseconds,
        workerReport: nil
      )
    }
    if worker.status == .factoryEnumerated, result.terminationStatus == 0 {
      return VST3ValidationAttemptReport(
        status: .factoryEnumerated,
        elapsedMilliseconds: result.elapsedMilliseconds,
        workerReport: worker
      )
    }
    if worker.status == .rejected {
      return VST3ValidationAttemptReport(
        status: .rejected,
        elapsedMilliseconds: result.elapsedMilliseconds,
        workerReport: worker
      )
    }
    return VST3ValidationAttemptReport(
      status: .failed,
      elapsedMilliseconds: result.elapsedMilliseconds,
      workerReport: nil
    )
  }
}

public enum VST3InstanceLabCoordinator {
  public static func validate(
    workerURL: URL,
    rootID: String,
    approvedRootURL: URL,
    bundleURL: URL,
    processorClassID: String,
    timeoutMilliseconds: Int,
    allowUnsigned: Bool
  ) -> VST3InstanceLabAttemptReport {
    guard
      (try? VST3ScanRoot(id: rootID, kind: .approved, url: approvedRootURL)) != nil,
      processorClassID.uppercased().range(
        of: "^[0-9A-F]{32}$",
        options: .regularExpression
      ) != nil
    else {
      return VST3InstanceLabAttemptReport(
        status: .failed,
        elapsedMilliseconds: 0,
        labReport: nil
      )
    }
    var arguments = [
      "--allow-binary-load",
      "--allow-instance-lab",
      "--approved-root", rootID, approvedRootURL.path,
      "--bundle", bundleURL.path,
      "--class-id", processorClassID.uppercased(),
    ]
    if allowUnsigned { arguments.append("--allow-unsigned") }
    do {
      let result = try VST3SubprocessRunner.run(
        executableURL: workerURL,
        arguments: arguments,
        timeoutMilliseconds: timeoutMilliseconds
      )
      return classifySubprocess(result)
    } catch {
      return VST3InstanceLabAttemptReport(
        status: .failed,
        elapsedMilliseconds: 0,
        labReport: nil
      )
    }
  }

  public static func classifySubprocess(
    _ result: VST3SubprocessResult
  ) -> VST3InstanceLabAttemptReport {
    if result.timedOut {
      return VST3InstanceLabAttemptReport(
        status: .timedOut,
        elapsedMilliseconds: result.elapsedMilliseconds,
        labReport: nil
      )
    }
    if result.terminationReason == .uncaughtSignal {
      return VST3InstanceLabAttemptReport(
        status: .crashed,
        elapsedMilliseconds: result.elapsedMilliseconds,
        labReport: nil
      )
    }
    guard !result.outputWasTruncated,
      let report = try? JSONDecoder().decode(
        VST3InstanceLabReport.self,
        from: result.standardOutput
      )
    else {
      return VST3InstanceLabAttemptReport(
        status: .malformedOutput,
        elapsedMilliseconds: result.elapsedMilliseconds,
        labReport: nil
      )
    }
    if report.status == .passed, result.terminationStatus == 0 {
      return VST3InstanceLabAttemptReport(
        status: .passed,
        elapsedMilliseconds: result.elapsedMilliseconds,
        labReport: report
      )
    }
    if report.status == .rejected {
      return VST3InstanceLabAttemptReport(
        status: .rejected,
        elapsedMilliseconds: result.elapsedMilliseconds,
        labReport: report
      )
    }
    return VST3InstanceLabAttemptReport(
      status: .failed,
      elapsedMilliseconds: result.elapsedMilliseconds,
      labReport: nil
    )
  }
}
