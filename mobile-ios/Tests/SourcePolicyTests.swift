import XCTest
@testable import KhoPhimPlaybackPolicy

final class SourcePolicyTests: XCTestCase {
    func testSourceNamespacePreservesLegacyHistoryWithoutOpeningIt() {
        XCTAssertNil(SourcePolicy.detailURL("movie-2026"))
        XCTAssertFalse(SourcePolicy.isCurrentSlug("tp--"))
        XCTAssertFalse(SourcePolicy.isCurrentSlug("tp--movie\n"))
        XCTAssertFalse(SourcePolicy.isCurrentSlug("tp--movie/episode"))
        XCTAssertEqual(SourcePolicy.detailURL("tp--movie-2026")?.absoluteString, "https://khophimqd.vercel.app/source/phim/tp--movie-2026")
        XCTAssertTrue(SourcePolicy.isCurrentSlug("tp--vision-quest"))
    }
    func testCategoryRoutingHasNoLegacyOrArbitraryDomainFallback() {
        XCTAssertEqual(SourcePolicy.categoryURL("phim-moi", page: 0)?.absoluteString, "https://khophimqd.vercel.app/source/danh-sach/phim-moi-cap-nhat?page=1")
        XCTAssertEqual(SourcePolicy.categoryURL("the-loai/hanh-dong", page: 2)?.absoluteString, "https://khophimqd.vercel.app/source/v1/api/the-loai/hanh-dong?page=2")
        XCTAssertNil(SourcePolicy.categoryURL("https://legacy.example/catalog"))
        XCTAssertEqual(SourcePolicy.categoryURL("phim-thuyet-minh")?.absoluteString, "https://khophimqd.vercel.app/source/v1/api/danh-sach/phim-thuyet-minh?page=1")
        XCTAssertEqual(SourcePolicy.categoryURL("phim-long-tieng")?.absoluteString, "https://khophimqd.vercel.app/source/v1/api/danh-sach/phim-long-tieng?page=1")
    }
    func testPlayerAcceptsOnlyNewGatewayStreams() {
        XCTAssertTrue(SourcePolicy.isGatewayStream("https://khophimqd.vercel.app/source/stream/abc/index.m3u8"))
        XCTAssertFalse(SourcePolicy.isGatewayStream("https://legacy.example/video.m3u8"))
        XCTAssertFalse(SourcePolicy.isGatewayStream("https://khophimqd.vercel.app.evil.test/source/stream/abc/index.m3u8"))
        XCTAssertFalse(SourcePolicy.isGatewayStream("http://khophimqd.vercel.app/source/stream/abc/index.m3u8"))
        XCTAssertFalse(SourcePolicy.isGatewayStream("https://user@khophimqd.vercel.app/source/stream/abc/index.m3u8"))
    }
    func testOldAndRelativeImagesCannotReachFormerProvider() {
        XCTAssertEqual(SourcePolicy.imageURL("https://phimimg.com/poster.jpg"), "")
        XCTAssertEqual(SourcePolicy.imageURL("https://cdn.phimimg.com/poster.jpg"), "")
        XCTAssertEqual(SourcePolicy.imageURL("uploads/poster.jpg"), "")
        XCTAssertEqual(SourcePolicy.imageURL("https://images.example/poster.jpg"), "https://images.example/poster.jpg")
    }
}
