import Darwin
import Foundation
import Vst3InstanceProbe

public enum VST3InstanceLabWorker {
  public static func inspect(
    approvedRootURL: URL,
    bundleURL: URL,
    processorClassID: String,
    allowUnsigned: Bool
  ) -> VST3InstanceLabReport {
    let normalizedClassID = processorClassID.uppercased()
    guard
      normalizedClassID.range(of: "^[0-9A-F]{32}$", options: .regularExpression) != nil
    else {
      return rejected(.invalidClassID, classID: "", preflight: nil)
    }

    let prepared: VST3PreparedBundle
    do {
      prepared = try VST3BundlePreflight.inspect(
        approvedRootURL: approvedRootURL,
        bundleURL: bundleURL
      )
    } catch VST3ValidationError.rejected(let code) {
      return rejected(mapPreflight(code), classID: normalizedClassID, preflight: nil)
    } catch {
      return rejected(.internalFailure, classID: normalizedClassID, preflight: nil)
    }

    guard prepared.report.architectures.contains(VST3BundlePreflight.currentArchitecture) else {
      return rejected(
        .unsupportedArchitecture,
        classID: normalizedClassID,
        preflight: prepared.report
      )
    }
    switch prepared.report.codeSignature {
    case .verified:
      break
    case .unsigned where allowUnsigned:
      break
    case .unsigned:
      return rejected(.unsignedCode, classID: normalizedClassID, preflight: prepared.report)
    case .invalid, .unavailable:
      return rejected(
        .invalidCodeSignature,
        classID: normalizedClassID,
        preflight: prepared.report
      )
    }

    var probe = ps_vst3_lab_result()
    let status = withSuppressedStandardOutput {
      prepared.bundleURL.path.withCString { path in
        normalizedClassID.withCString { classID in
          ps_vst3_run_instance_lab(path, classID, &probe)
        }
      }
    }
    guard status == 0 else {
      return rejected(
        failureCode(forProbeStatus: status),
        classID: normalizedClassID,
        preflight: prepared.report
      )
    }
    guard probe.parameters_truncated == 0,
      probe.parameter_count == probe.parameter_record_count,
      probe.parameter_count >= 0,
      probe.component_state_round_trip == 1,
      probe.controller_state_round_trip == 1,
      probe.component_state_bytes > 0,
      probe.component_state_bytes <= 1_048_576,
      probe.controller_state_bytes > 0,
      probe.controller_state_bytes <= 1_048_576,
      probe.processed_blocks == 4,
      probe.output_is_finite == 1,
      probe.zero_input_peak.isFinite,
      probe.zero_input_peak >= 0
    else {
      return rejected(.internalFailure, classID: normalizedClassID, preflight: prepared.report)
    }

    var parameters: [VST3LabParameterRecord] = []
    var parameterIDs = Set<UInt32>()
    withUnsafePointer(to: &probe.parameters) { tuple in
      tuple.withMemoryRebound(
        to: ps_vst3_lab_parameter.self,
        capacity: Int(PS_VST3_LAB_MAX_PARAMETERS)
      ) { records in
        for index in 0..<Int(probe.parameter_record_count) {
          var record = records[index]
          guard parameterIDs.insert(record.parameter_id).inserted else { continue }
          parameters.append(
            VST3LabParameterRecord(
              parameterID: record.parameter_id,
              title: sanitizedCString(
                &record.title,
                fallback: "Parameter \(record.parameter_id)",
                limit: 120
              ),
              shortTitle: sanitizedCString(
                &record.short_title,
                fallback: "Parameter \(record.parameter_id)",
                limit: 120
              ),
              units: sanitizedCString(&record.units, fallback: "", limit: 64),
              stepCount: Int(record.step_count),
              defaultNormalized: record.default_normalized,
              currentNormalized: record.current_normalized,
              flags: Int(record.flags)
            )
          )
        }
      }
    }
    guard parameters.count == Int(probe.parameter_record_count) else {
      return rejected(
        .parameterMetadataInvalid,
        classID: normalizedClassID,
        preflight: prepared.report
      )
    }

    let componentDigest = sanitizedCString(
      &probe.component_state_sha256,
      fallback: "",
      limit: 64
    )
    let controllerDigest = sanitizedCString(
      &probe.controller_state_sha256,
      fallback: "",
      limit: 64
    )
    guard componentDigest.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
      controllerDigest.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil
    else {
      return rejected(
        .stateRoundTripFailed,
        classID: normalizedClassID,
        preflight: prepared.report
      )
    }
    let tailIsInfinite = probe.tail_samples == UInt32.max
    return VST3InstanceLabReport(
      status: .passed,
      failureCode: nil,
      processorClassID: normalizedClassID,
      preflight: prepared.report,
      parameters: parameters,
      writableParameterRoundTrip: probe.writable_parameter_round_trip == 1,
      state: VST3LabStateReport(
        componentBytes: Int(probe.component_state_bytes),
        componentSHA256: componentDigest,
        componentRoundTrip: true,
        controllerBytes: Int(probe.controller_state_bytes),
        controllerSHA256: controllerDigest,
        controllerRoundTrip: true,
        maximumBytesPerStream: 1_048_576
      ),
      offline: VST3LabOfflineReport(
        sampleRate: 48_000,
        blockSize: 64,
        processedBlocks: Int(probe.processed_blocks),
        inputBuses: Int(probe.input_bus_count),
        outputBuses: Int(probe.output_bus_count),
        inputChannels: Int(probe.input_channels),
        outputChannels: Int(probe.output_channels),
        latencySamples: probe.latency_samples,
        tailKind: tailIsInfinite ? .infinite : .finite,
        tailSamples: tailIsInfinite ? nil : probe.tail_samples,
        zeroInputPeak: probe.zero_input_peak,
        outputIsFinite: true
      )
    )
  }

  private static func rejected(
    _ code: VST3InstanceLabFailureCode,
    classID: String,
    preflight: VST3BundlePreflightReport?
  ) -> VST3InstanceLabReport {
    VST3InstanceLabReport(
      status: .rejected,
      failureCode: code,
      processorClassID: classID,
      preflight: preflight,
      parameters: [],
      writableParameterRoundTrip: false,
      state: nil,
      offline: nil
    )
  }

  private static func mapPreflight(
    _ code: VST3WorkerFailureCode
  ) -> VST3InstanceLabFailureCode {
    switch code {
    case .bundleOutsideApprovedRoot: return .bundleOutsideApprovedRoot
    case .invalidBundle: return .invalidBundle
    case .executableMissing: return .executableMissing
    case .executableEscapesBundle: return .executableEscapesBundle
    default: return .internalFailure
    }
  }

  private static func failureCode(forProbeStatus status: Int32) -> VST3InstanceLabFailureCode {
    switch status {
    case 2: return .invalidClassID
    case 3: return .moduleLoadFailed
    case 4: return .requiredEntryPointMissing
    case 5: return .moduleEntryFailed
    case 6: return .factoryUnavailable
    case 7: return .componentUnavailable
    case 8: return .audioProcessorUnavailable
    case 9: return .controllerUnavailable
    case 10: return .initializationFailed
    case 11: return .parameterMetadataInvalid
    case 12: return .parameterLimitExceeded
    case 13: return .stateTooLarge
    case 14: return .stateRoundTripFailed
    case 15: return .unsupportedBusLayout
    case 16: return .sampleSizeUnsupported
    case 17: return .processingSetupFailed
    case 18: return .processingFailed
    case 19: return .nonFiniteOutput
    default: return .internalFailure
    }
  }

  private static func sanitizedCString<T>(
    _ value: inout T,
    fallback: String,
    limit: Int
  ) -> String {
    withUnsafeBytes(of: &value) { bytes in
      guard let base = bytes.bindMemory(to: CChar.self).baseAddress else { return fallback }
      return VST3PublicText.sanitize(String(cString: base), fallback: fallback, limit: limit)
    }
  }

  private static func withSuppressedStandardOutput<T>(_ operation: () -> T) -> T {
    Darwin.fflush(nil)
    let savedOutput = Darwin.dup(STDOUT_FILENO)
    let nullOutput = Darwin.open("/dev/null", O_WRONLY)
    guard savedOutput >= 0, nullOutput >= 0 else {
      if savedOutput >= 0 { Darwin.close(savedOutput) }
      if nullOutput >= 0 { Darwin.close(nullOutput) }
      return operation()
    }
    Darwin.dup2(nullOutput, STDOUT_FILENO)
    Darwin.close(nullOutput)
    defer {
      Darwin.fflush(nil)
      Darwin.dup2(savedOutput, STDOUT_FILENO)
      Darwin.close(savedOutput)
    }
    return operation()
  }
}
