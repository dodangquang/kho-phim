import XCTest
@testable import KhoPhimPlaybackPolicy

final class MovieRatingTests: XCTestCase {
    func testPreferredSourceAndFallback() {
        let tmdb: [String: Any] = ["vote_average": "7.25", "vote_count": "8"]
        XCTAssertEqual(MovieRating.fromMovie(["imdb": ["vote_average": 8.1, "vote_count": 900], "tmdb": tmdb])?.label, "★ IMDb 8.1")
        XCTAssertEqual(MovieRating.fromMovie(["imdb": ["vote_average": 0, "vote_count": 0], "tmdb": tmdb])?.detailLabel, "★ TMDB 7.3/10 · 8 lượt đánh giá")
    }
    func testInvalidScoresAndVotes() {
        for score in [0.0, -1, 11, Double.nan, Double.infinity] {
            XCTAssertNil(MovieRating.fromMovie(["imdb": ["vote_average": score]]))
        }
        XCTAssertNil(MovieRating.fromMovie(["imdb": ["vote_average": 8, "vote_count": 0]]))
        XCTAssertNil(MovieRating.fromMovie([:]))
    }
    func testOldMovieCacheStillDecodes() throws {
        let movie = try JSONDecoder().decode(MovieItem.self, from: Data("{\"title\":\"Phim\",\"slug\":\"phim\",\"posterUrl\":\"\"}".utf8))
        XCTAssertNil(movie.rating)
    }
}
