// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KhoPhimPlaybackPolicy",
    products: [.library(name: "KhoPhimPlaybackPolicy", targets: ["KhoPhimPlaybackPolicy"])],
    targets: [
        .target(
            name: "KhoPhimPlaybackPolicy",
            path: "KhoPhim/Sources",
            exclude: ["DetailView.swift", "HomeView.swift", "IOSPlaybackController.swift", "KhoPhimApp.swift", "Managers.swift", "PhimRepository.swift", "SearchAndHistoryViews.swift"],
            sources: ["Models.swift", "PlaybackPolicy.swift", "MovieRating.swift", "SourcePolicy.swift"]
        ),
        .testTarget(name: "KhoPhimPlaybackPolicyTests", dependencies: ["KhoPhimPlaybackPolicy"], path: "Tests")
    ]
)
