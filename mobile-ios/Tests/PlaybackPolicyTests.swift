import XCTest
@testable import KhoPhimPlaybackPolicy

final class PlaybackPolicyTests: XCTestCase {
    func testCanonicalSlugPreservesYearAndSequel() {
        XCTAssertEqual(PlaybackPolicy.movieSlug(" /sat-thu-ve-vuon-2026/ "), "sat-thu-ve-vuon-2026")
        XCTAssertEqual(PlaybackPolicy.movieSlug("phim-2"), "phim-2")
        XCTAssertNil(PlaybackPolicy.movieSlug("phim?other=1"))
        XCTAssertNil(PlaybackPolicy.movieSlug("../phim"))
    }

    func testEncodedEmbedReturnsDirectHLSAndPreservesSignedQuery() {
        let embed = "https://player.example/embed?url=https%3A%2F%2Fcdn.example%2Fmovie.m3u8%3Ftoken%3Da%2526b&autoplay=1"
        XCTAssertEqual(PlaybackPolicy.streamURL(m3u8: "", embed: embed)?.absoluteString,
                       "https://cdn.example/movie.m3u8?token=a%26b")
        XCTAssertEqual(PlaybackPolicy.directHLSURL("https%3A%2F%2Fcdn.example%2Fmovie.m3u8")?.host, "cdn.example")
    }

    func testRejectsEmbedPagesAndNonMediaSchemes() {
        for value in ["https://player.example/embed/123", "javascript:alert(1)", "file:///movie.m3u8", "https://cdn.example/movie.html?file=video.m3u8", "https://user:pass@cdn.example/movie.m3u8", "https://cdn.example/a b.m3u8"] {
            XCTAssertNil(PlaybackPolicy.directHLSURL(value), value)
        }
        XCTAssertNil(PlaybackPolicy.streamURL(m3u8: "", embed: "https://player.example/embed/123"))
        XCTAssertEqual(PlaybackPolicy.streamURL(m3u8: "https://cdn.example/master.m3u8", embed: "https://player.example/embed")?.path, "/master.m3u8")
    }

    func testSeekWaitsForMetadataAndClampsFiniteTargets() {
        XCTAssertNil(PlaybackPolicy.seekTarget(10, duration: 0, seekable: nil))
        XCTAssertNil(PlaybackPolicy.seekTarget(10, duration: .infinity, seekable: nil))
        XCTAssertNil(PlaybackPolicy.seekTarget(.nan, duration: 120, seekable: nil))
        XCTAssertEqual(PlaybackPolicy.seekTarget(-10, duration: 120, seekable: nil), 0)
        XCTAssertEqual(PlaybackPolicy.seekTarget(130, duration: 120, seekable: nil), 120)
        XCTAssertEqual(PlaybackPolicy.seekTarget(10, duration: 0, seekable: 30...90), 30)
        XCTAssertEqual(PlaybackPolicy.seekTarget(100, duration: 0, seekable: 30...90), 90)
        XCTAssertNil(PlaybackPolicy.finiteSeconds(.nan))
        XCTAssertNil(PlaybackPolicy.finiteSeconds(.infinity))
    }

    func testResumeChoosesMatchingServerAndEpisode() {
        let first = EpisodeSource(id: "a-1", serverName: "A", episodeName: "1", episodeSlug: "tap-1", streamUrl: "https://a.example/1.m3u8")
        let saved = EpisodeSource(id: "b-1", serverName: "B", episodeName: "1", episodeSlug: "tap-1", streamUrl: "https://b.example/1.m3u8")
        let progress = WatchProgress(movieSlug: "movie", movieTitle: "Movie", posterUrl: "", bannerUrl: nil, episodeSlug: "tap-1", episodeName: "1", serverName: "B", streamUrl: saved.streamUrl, positionMs: 30000, durationMs: 120000, timestamp: 1)
        XCTAssertEqual(PlaybackPolicy.resumeEpisode(in: [first, saved], progress: progress, server: "A"), saved)
        XCTAssertFalse(PlaybackPolicy.matches(progress, episode: first))
        XCTAssertTrue(PlaybackPolicy.matches(progress, episode: saved))
        XCTAssertEqual(PlaybackPolicy.resumeEpisode(in: [first], progress: progress, server: "A"), first)
    }
}
