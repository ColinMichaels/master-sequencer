// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SharedDspEngine",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "SharedDspEngine", targets: ["SharedDspEngine"]),
        .executable(name: "shared-dsp-golden-runner", targets: ["SharedDspGoldenRunner"]),
        .executable(name: "shared-dsp-self-test", targets: ["SharedDspSelfTest"]),
        .executable(name: "shared-dsp-device-probe", targets: ["SharedDspDeviceProbe"]),
        .executable(name: "shared-dsp-silent-stream", targets: ["SharedDspSilentStream"]),
    ],
    targets: [
        .target(name: "SharedDspEngine"),
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
    ]
)
