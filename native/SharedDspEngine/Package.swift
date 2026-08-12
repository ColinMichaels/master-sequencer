// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SharedDspEngine",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "SharedDspEngine", targets: ["SharedDspEngine"]),
        .executable(name: "shared-dsp-golden-runner", targets: ["SharedDspGoldenRunner"]),
        .executable(name: "shared-dsp-self-test", targets: ["SharedDspSelfTest"]),
    ],
    targets: [
        .target(name: "SharedDspEngine"),
        .executableTarget(name: "SharedDspGoldenRunner", dependencies: ["SharedDspEngine"]),
        .executableTarget(name: "SharedDspSelfTest", dependencies: ["SharedDspEngine"]),
    ]
)
