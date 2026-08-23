// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SharedDspEngine",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "SharedDspEngine", targets: ["SharedDspEngine"]),
        .library(name: "Vst3Discovery", targets: ["Vst3Discovery"]),
        .library(name: "Vst3Validation", targets: ["Vst3Validation"]),
        .library(name: "Vst3FactoryFixture", type: .dynamic, targets: ["Vst3FactoryFixture"]),
        .executable(name: "shared-dsp-golden-runner", targets: ["SharedDspGoldenRunner"]),
        .executable(name: "shared-dsp-self-test", targets: ["SharedDspSelfTest"]),
        .executable(name: "shared-dsp-device-probe", targets: ["SharedDspDeviceProbe"]),
        .executable(name: "shared-dsp-silent-stream", targets: ["SharedDspSilentStream"]),
        .executable(name: "shared-vst3-scanner", targets: ["SharedVst3Scanner"]),
        .executable(name: "shared-vst3-scanner-self-test", targets: ["SharedVst3ScannerSelfTest"]),
        .executable(name: "shared-vst3-validator", targets: ["SharedVst3Validator"]),
        .executable(name: "shared-vst3-validator-worker", targets: ["SharedVst3ValidatorWorker"]),
        .executable(name: "shared-vst3-validator-self-test", targets: ["SharedVst3ValidatorSelfTest"]),
        .executable(name: "shared-vst3-instance-lab", targets: ["SharedVst3InstanceLab"]),
        .executable(name: "shared-vst3-instance-lab-worker", targets: ["SharedVst3InstanceLabWorker"]),
        .executable(name: "shared-vst3-instance-lab-self-test", targets: ["SharedVst3InstanceLabSelfTest"]),
    ],
    targets: [
        .target(name: "SharedDspEngine"),
        .target(name: "Vst3Discovery"),
        .target(name: "Vst3Abi", publicHeadersPath: "include"),
        .target(
            name: "Vst3FactoryProbe",
            dependencies: ["Vst3Abi"],
            publicHeadersPath: "include",
            linkerSettings: [.linkedFramework("CoreFoundation")]
        ),
        .target(
            name: "Vst3InstanceProbe",
            dependencies: ["Vst3Abi"],
            publicHeadersPath: "include",
            linkerSettings: [.linkedFramework("CoreFoundation")]
        ),
        .target(
            name: "Vst3FactoryFixture",
            dependencies: ["Vst3Abi"],
            linkerSettings: [.linkedFramework("CoreFoundation")]
        ),
        .target(
            name: "Vst3Validation",
            dependencies: ["Vst3Discovery", "Vst3FactoryProbe", "Vst3InstanceProbe"]
        ),
        .executableTarget(name: "SharedDspGoldenRunner", dependencies: ["SharedDspEngine"]),
        .executableTarget(name: "SharedDspSelfTest", dependencies: ["SharedDspEngine"]),
        .executableTarget(
            name: "SharedDspDeviceProbe",
            dependencies: ["SharedDspEngine"],
            linkerSettings: [.linkedFramework("CoreAudio")]
        ),
        .target(
            name: "SharedDspRealtimeSupport",
            publicHeadersPath: "include",
            linkerSettings: [
                .linkedFramework("AudioToolbox"),
                .linkedFramework("CoreAudio"),
            ]
        ),
        .executableTarget(
            name: "SharedDspSilentStream",
            dependencies: ["SharedDspEngine", "SharedDspRealtimeSupport"],
            linkerSettings: [
                .linkedFramework("AudioToolbox"),
                .linkedFramework("CoreAudio"),
            ]
        ),
        .executableTarget(name: "SharedVst3Scanner", dependencies: ["Vst3Discovery"]),
        .executableTarget(name: "SharedVst3ScannerSelfTest", dependencies: ["Vst3Discovery"]),
        .executableTarget(name: "SharedVst3Validator", dependencies: ["Vst3Validation"]),
        .executableTarget(name: "SharedVst3ValidatorWorker", dependencies: ["Vst3Validation"]),
        .executableTarget(name: "SharedVst3ValidatorSelfTest", dependencies: ["Vst3Validation"]),
        .executableTarget(name: "SharedVst3InstanceLab", dependencies: ["Vst3Validation"]),
        .executableTarget(name: "SharedVst3InstanceLabWorker", dependencies: ["Vst3Validation"]),
        .executableTarget(name: "SharedVst3InstanceLabSelfTest", dependencies: ["Vst3Validation"]),
    ],
    cxxLanguageStandard: .cxx17
)
