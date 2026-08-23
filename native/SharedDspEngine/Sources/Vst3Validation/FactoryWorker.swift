import Darwin
import Foundation
import Vst3FactoryProbe

public enum VST3FactoryWorker {
  public static func inspect(
    approvedRootURL: URL,
    bundleURL: URL,
    allowUnsigned: Bool
  ) -> VST3WorkerReport {
    let prepared: VST3PreparedBundle
    do {
      prepared = try VST3BundlePreflight.inspect(
        approvedRootURL: approvedRootURL,
        bundleURL: bundleURL
      )
    } catch VST3ValidationError.rejected(let code) {
      return rejected(code, preflight: nil)
    } catch {
      return rejected(.internalFailure, preflight: nil)
    }

    guard prepared.report.architectures.contains(VST3BundlePreflight.currentArchitecture) else {
      return rejected(.unsupportedArchitecture, preflight: prepared.report)
    }
    switch prepared.report.codeSignature {
    case .verified:
      break
    case .unsigned where allowUnsigned:
      break
    case .unsigned:
      return rejected(.unsignedCode, preflight: prepared.report)
    case .invalid:
      return rejected(.invalidCodeSignature, preflight: prepared.report)
    case .unavailable:
      return rejected(.invalidCodeSignature, preflight: prepared.report)
    }

    var probe = ps_vst3_probe_result()
    let status = withSuppressedStandardOutput {
      prepared.bundleURL.path.withCString { path in
        ps_vst3_probe_bundle(path, &probe)
      }
    }
    guard status == 0 else {
      return rejected(failureCode(forProbeStatus: status), preflight: prepared.report)
    }
    guard probe.records_truncated == 0, probe.class_info_failures == 0 else {
      return rejected(.factoryMetadataIncomplete, preflight: prepared.report)
    }

    let factoryVendor = sanitizedCString(
      &probe.factory_vendor,
      fallback: "Unknown vendor",
      limit: 80
    )
    var processors: [VST3FactoryClassRecord] = []
    withUnsafePointer(to: &probe.classes) { classesTuple in
      classesTuple.withMemoryRebound(
        to: ps_vst3_probe_class.self,
        capacity: Int(PS_VST3_PROBE_MAX_CLASSES)
      ) { classes in
        let count = max(0, min(Int(probe.record_count), Int(PS_VST3_PROBE_MAX_CLASSES)))
        for index in 0..<count {
          var record = classes[index]
          let category = sanitizedCString(&record.category, fallback: "", limit: 32)
          guard category == "Audio Module Class" else { continue }
          let classID = sanitizedCString(&record.class_id, fallback: "", limit: 32)
          guard classID.range(of: "^[0-9A-F]{32}$", options: .regularExpression) != nil else {
            continue
          }
          let subCategories = sanitizedCString(
            &record.sub_categories,
            fallback: "",
            limit: 128
          )
          .split(separator: "|")
          .map {
            VST3PublicText.sanitize(String($0), fallback: "", limit: 48)
          }
          .filter { !$0.isEmpty }
          processors.append(
            VST3FactoryClassRecord(
              classID: classID,
              name: sanitizedCString(
                &record.name,
                fallback: prepared.report.sourceLabel.replacingOccurrences(
                  of: ".vst3", with: ""),
                limit: 80
              ),
              vendor: sanitizedCString(
                &record.vendor,
                fallback: factoryVendor,
                limit: 80
              ),
              version: sanitizedCString(&record.version, fallback: "Unknown", limit: 64),
              sdkVersion: sanitizedCString(
                &record.sdk_version,
                fallback: "Unknown",
                limit: 64
              ),
              subCategories: subCategories
            )
          )
        }
      }
    }
    guard !processors.isEmpty else {
      return rejected(.noAudioProcessorClass, preflight: prepared.report)
    }
    processors.sort {
      let comparison = $0.name.localizedCaseInsensitiveCompare($1.name)
      return comparison == .orderedAscending
        || (comparison == .orderedSame && $0.classID < $1.classID)
    }
    return VST3WorkerReport(
      status: .factoryEnumerated,
      failureCode: nil,
      preflight: prepared.report,
      factoryVendor: factoryVendor,
      processorClasses: processors
    )
  }

  private static func rejected(
    _ code: VST3WorkerFailureCode,
    preflight: VST3BundlePreflightReport?
  ) -> VST3WorkerReport {
    VST3WorkerReport(
      status: .rejected,
      failureCode: code,
      preflight: preflight,
      factoryVendor: "",
      processorClasses: []
    )
  }

  private static func failureCode(forProbeStatus status: Int32) -> VST3WorkerFailureCode {
    switch status {
    case 4: return .moduleLoadFailed
    case 5, 6, 7: return .requiredEntryPointMissing
    case 8: return .moduleEntryFailed
    case 9: return .factoryUnavailable
    case 10, 11: return .factoryMetadataInvalid
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
