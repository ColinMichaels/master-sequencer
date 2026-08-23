import Foundation

public enum VST3CodeSignatureState: String, Codable, Equatable, Sendable {
  case verified
  case unsigned
  case invalid
  case unavailable
}

public enum VST3WorkerStatus: String, Codable, Equatable, Sendable {
  case factoryEnumerated = "factory-enumerated-runtime-blocked"
  case rejected
}

public enum VST3WorkerFailureCode: String, Codable, Equatable, Sendable {
  case bundleOutsideApprovedRoot = "bundle-outside-approved-root"
  case invalidBundle = "invalid-bundle"
  case executableMissing = "executable-missing"
  case executableEscapesBundle = "executable-escapes-bundle"
  case unsupportedArchitecture = "unsupported-architecture"
  case unsignedCode = "unsigned-code"
  case invalidCodeSignature = "invalid-code-signature"
  case moduleLoadFailed = "module-load-failed"
  case requiredEntryPointMissing = "required-entry-point-missing"
  case moduleEntryFailed = "module-entry-failed"
  case factoryUnavailable = "factory-unavailable"
  case factoryMetadataInvalid = "factory-metadata-invalid"
  case factoryMetadataIncomplete = "factory-metadata-incomplete"
  case noAudioProcessorClass = "no-audio-processor-class"
  case internalFailure = "internal-failure"
}

public struct VST3FactoryClassRecord: Codable, Equatable, Sendable {
  public let classID: String
  public let name: String
  public let vendor: String
  public let version: String
  public let sdkVersion: String
  public let subCategories: [String]

  public init(
    classID: String,
    name: String,
    vendor: String,
    version: String,
    sdkVersion: String,
    subCategories: [String]
  ) {
    self.classID = classID
    self.name = name
    self.vendor = vendor
    self.version = version
    self.sdkVersion = sdkVersion
    self.subCategories = subCategories
  }
}

public struct VST3BundlePreflightReport: Codable, Equatable, Sendable {
  public let bundleKey: String
  public let sourceLabel: String
  public let executableLabel: String
  public let executableSHA256: String
  public let architectures: [String]
  public let codeSignature: VST3CodeSignatureState

  public init(
    bundleKey: String,
    sourceLabel: String,
    executableLabel: String,
    executableSHA256: String,
    architectures: [String],
    codeSignature: VST3CodeSignatureState
  ) {
    self.bundleKey = bundleKey
    self.sourceLabel = sourceLabel
    self.executableLabel = executableLabel
    self.executableSHA256 = executableSHA256
    self.architectures = architectures
    self.codeSignature = codeSignature
  }
}

public struct VST3WorkerReport: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let workerMode: String
  public let status: VST3WorkerStatus
  public let failureCode: VST3WorkerFailureCode?
  public let preflight: VST3BundlePreflightReport?
  public let factoryVendor: String
  public let processorClasses: [VST3FactoryClassRecord]

  public init(
    status: VST3WorkerStatus,
    failureCode: VST3WorkerFailureCode?,
    preflight: VST3BundlePreflightReport?,
    factoryVendor: String,
    processorClasses: [VST3FactoryClassRecord]
  ) {
    self.schemaVersion = 1
    self.workerMode = "disposable-vst3-factory-enumeration-no-instance-creation"
    self.status = status
    self.failureCode = failureCode
    self.preflight = preflight
    self.factoryVendor = factoryVendor
    self.processorClasses = processorClasses
  }
}

public enum VST3ValidationAttemptStatus: String, Codable, Equatable, Sendable {
  case factoryEnumerated = "factory-enumerated-runtime-blocked"
  case rejected
  case timedOut = "timed-out-quarantined"
  case crashed = "crashed-quarantined"
  case failed = "worker-failed-quarantined"
  case malformedOutput = "malformed-output-quarantined"
}

public struct VST3ValidationAttemptReport: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let coordinatorMode: String
  public let status: VST3ValidationAttemptStatus
  public let elapsedMilliseconds: Int
  public let workerReport: VST3WorkerReport?

  public init(
    status: VST3ValidationAttemptStatus,
    elapsedMilliseconds: Int,
    workerReport: VST3WorkerReport?
  ) {
    self.schemaVersion = 1
    self.coordinatorMode = "one-bundle-per-disposable-process"
    self.status = status
    self.elapsedMilliseconds = max(0, min(elapsedMilliseconds, 120_000))
    self.workerReport = workerReport
  }
}

public enum VST3InstanceLabStatus: String, Codable, Equatable, Sendable {
  case passed = "instance-lab-passed-runtime-blocked"
  case rejected
}

public enum VST3InstanceLabFailureCode: String, Codable, Equatable, Sendable {
  case bundleOutsideApprovedRoot = "bundle-outside-approved-root"
  case invalidBundle = "invalid-bundle"
  case executableMissing = "executable-missing"
  case executableEscapesBundle = "executable-escapes-bundle"
  case unsupportedArchitecture = "unsupported-architecture"
  case unsignedCode = "unsigned-code"
  case invalidCodeSignature = "invalid-code-signature"
  case invalidClassID = "invalid-class-id"
  case moduleLoadFailed = "module-load-failed"
  case requiredEntryPointMissing = "required-entry-point-missing"
  case moduleEntryFailed = "module-entry-failed"
  case factoryUnavailable = "factory-unavailable"
  case componentUnavailable = "component-unavailable"
  case audioProcessorUnavailable = "audio-processor-unavailable"
  case controllerUnavailable = "controller-unavailable"
  case initializationFailed = "initialization-failed"
  case parameterMetadataInvalid = "parameter-metadata-invalid"
  case parameterLimitExceeded = "parameter-limit-exceeded"
  case stateTooLarge = "state-too-large"
  case stateRoundTripFailed = "state-round-trip-failed"
  case unsupportedBusLayout = "unsupported-bus-layout"
  case sampleSizeUnsupported = "sample-size-unsupported"
  case processingSetupFailed = "processing-setup-failed"
  case processingFailed = "processing-failed"
  case nonFiniteOutput = "non-finite-output"
  case internalFailure = "internal-failure"
}

public struct VST3LabParameterRecord: Codable, Equatable, Sendable {
  public let parameterID: UInt32
  public let title: String
  public let shortTitle: String
  public let units: String
  public let stepCount: Int
  public let defaultNormalized: Double
  public let currentNormalized: Double
  public let flags: Int
}

public struct VST3LabStateReport: Codable, Equatable, Sendable {
  public let componentBytes: Int
  public let componentSHA256: String
  public let componentRoundTrip: Bool
  public let controllerBytes: Int
  public let controllerSHA256: String
  public let controllerRoundTrip: Bool
  public let maximumBytesPerStream: Int
}

public enum VST3LabTailKind: String, Codable, Equatable, Sendable {
  case finite
  case infinite
}

public struct VST3LabOfflineReport: Codable, Equatable, Sendable {
  public let sampleRate: Int
  public let blockSize: Int
  public let processedBlocks: Int
  public let inputBuses: Int
  public let outputBuses: Int
  public let inputChannels: Int
  public let outputChannels: Int
  public let latencySamples: UInt32
  public let tailKind: VST3LabTailKind
  public let tailSamples: UInt32?
  public let zeroInputPeak: Double
  public let outputIsFinite: Bool
}

public struct VST3InstanceLabReport: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let labMode: String
  public let status: VST3InstanceLabStatus
  public let failureCode: VST3InstanceLabFailureCode?
  public let runtimeBlocked: Bool
  public let processorClassID: String
  public let preflight: VST3BundlePreflightReport?
  public let parameters: [VST3LabParameterRecord]
  public let writableParameterRoundTrip: Bool
  public let state: VST3LabStateReport?
  public let offline: VST3LabOfflineReport?

  public init(
    status: VST3InstanceLabStatus,
    failureCode: VST3InstanceLabFailureCode?,
    processorClassID: String,
    preflight: VST3BundlePreflightReport?,
    parameters: [VST3LabParameterRecord],
    writableParameterRoundTrip: Bool,
    state: VST3LabStateReport?,
    offline: VST3LabOfflineReport?
  ) {
    self.schemaVersion = 1
    self.labMode = "disposable-offline-zero-input-no-rack-no-state-payload"
    self.status = status
    self.failureCode = failureCode
    self.runtimeBlocked = true
    self.processorClassID = processorClassID
    self.preflight = preflight
    self.parameters = parameters
    self.writableParameterRoundTrip = writableParameterRoundTrip
    self.state = state
    self.offline = offline
  }
}

public enum VST3InstanceLabAttemptStatus: String, Codable, Equatable, Sendable {
  case passed = "instance-lab-passed-runtime-blocked"
  case rejected
  case timedOut = "timed-out-quarantined"
  case crashed = "crashed-quarantined"
  case failed = "worker-failed-quarantined"
  case malformedOutput = "malformed-output-quarantined"
}

public struct VST3InstanceLabAttemptReport: Codable, Equatable, Sendable {
  public let schemaVersion: Int
  public let coordinatorMode: String
  public let status: VST3InstanceLabAttemptStatus
  public let elapsedMilliseconds: Int
  public let labReport: VST3InstanceLabReport?

  public init(
    status: VST3InstanceLabAttemptStatus,
    elapsedMilliseconds: Int,
    labReport: VST3InstanceLabReport?
  ) {
    self.schemaVersion = 1
    self.coordinatorMode = "one-instance-lab-per-disposable-process"
    self.status = status
    self.elapsedMilliseconds = max(0, min(elapsedMilliseconds, 120_000))
    self.labReport = labReport
  }
}

enum VST3ValidationError: Error {
  case rejected(VST3WorkerFailureCode)
  case catalogInvalid
}

enum VST3PublicText {
  static func sanitize(_ value: String?, fallback: String, limit: Int) -> String {
    let clean = (value ?? "")
      .components(separatedBy: .controlCharacters)
      .joined(separator: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let safe = clean.isEmpty || containsAbsolutePath(clean) ? fallback : clean
    return String(safe.prefix(limit))
  }

  private static func containsAbsolutePath(_ value: String) -> Bool {
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
}
