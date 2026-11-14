// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NKBStorageAgent",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "nkb-storage-agent",
            targets: ["NKBStorageAgent"]
        )
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "NKBStorageAgent",
            dependencies: [],
            path: "Sources/NKBStorageAgent"
        ),
        .testTarget(
            name: "NKBStorageAgentTests",
            dependencies: ["NKBStorageAgent"],
            path: "Tests/NKBStorageAgentTests"
        )
    ]
)
