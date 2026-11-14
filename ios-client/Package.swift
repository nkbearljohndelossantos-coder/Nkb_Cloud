// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NKBCloudiOS",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "NKBCloudCore",
            targets: ["NKBCloudCore"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "NKBCloudCore",
            dependencies: [],
            path: "Sources/NKBCloudCore"
        ),
        .testTarget(
            name: "NKBCloudCoreTests",
            dependencies: ["NKBCloudCore"],
            path: "Tests/NKBCloudCoreTests"
        )
    ]
)
