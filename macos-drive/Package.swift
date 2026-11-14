// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NKBDrive",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "NKBDrive",
            targets: ["NKBDrive"]
        )
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "NKBDrive",
            dependencies: [],
            path: "Sources/NKBDrive",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
