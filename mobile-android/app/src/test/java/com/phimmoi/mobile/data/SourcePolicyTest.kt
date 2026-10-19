package com.phimmoi.mobile.data

import org.junit.Assert.*
import org.junit.Test

class SourcePolicyTest {
    @Test fun routesUseOnlyTheTuphimGateway() {
        assertEquals("https://khophimqd.vercel.app/source/danh-sach/phim-moi-cap-nhat?page=1", SourcePolicy.categoryUrl("phim-moi", 0))
        assertEquals("https://khophimqd.vercel.app/source/v1/api/the-loai/hanh-dong?page=2", SourcePolicy.categoryUrl("/the-loai/hanh-dong/", 2))
        assertEquals("https://khophimqd.vercel.app/source/v1/api/quoc-gia/viet-nam?page=1", SourcePolicy.categoryUrl("quoc-gia/viet-nam"))
        assertEquals("https://khophimqd.vercel.app/source/v1/api/danh-sach/phim-bo?page=1", SourcePolicy.categoryUrl("phim-bo"))
        assertNull(SourcePolicy.categoryUrl("https://legacy.example/catalog"))
        assertNull(SourcePolicy.categoryUrl("../phim-moi"))
        assertNull(SourcePolicy.categoryUrl("danh-sach/phim-thuyet-minh"))
        assertNull(SourcePolicy.categoryUrl("phim-long-tieng"))
    }

    @Test fun legacyHistoryCannotResolveToANewProviderTitle() {
        assertNull(SourcePolicy.detailUrl("sat-thu-ve-vuon-2026"))
        assertFalse(SourcePolicy.isCurrentSlug("tp--"))
        assertFalse(SourcePolicy.isCurrentSlug("tp--movie/episode"))
        assertEquals("https://khophimqd.vercel.app/source/phim/tp--sat-thu-ve-vuon-2026", SourcePolicy.detailUrl("tp--sat-thu-ve-vuon-2026"))
        // Old provider's broken title exclusions must not hide the new provider's title.
        assertTrue(SourcePolicy.isCurrentSlug("tp--vision-quest"))
    }

    @Test fun searchCannotInjectAnotherQueryOrSource() {
        assertNull(SourcePolicy.searchUrl("  "))
        assertEquals("https://khophimqd.vercel.app/source/v1/api/tim-kiem?keyword=a%26page%3D99&limit=50&page=1", SourcePolicy.searchUrl(" a&page=99 "))
    }

    @Test fun onlyGatewayHlsCanReachTheNativePlayer() {
        assertTrue(SourcePolicy.isGatewayStream("https://khophimqd.vercel.app/source/stream/abc/index.m3u8"))
        assertFalse(SourcePolicy.isGatewayStream("https://legacy.example/video.m3u8"))
        assertFalse(SourcePolicy.isGatewayStream("https://khophimqd.vercel.app.evil.test/source/stream/abc/index.m3u8"))
        assertFalse(SourcePolicy.isGatewayStream("https://user@khophimqd.vercel.app/source/stream/abc/index.m3u8"))
        assertFalse(SourcePolicy.isGatewayStream("https://khophimqd.vercel.app/source/stream/../old.m3u8"))
        assertFalse(SourcePolicy.isGatewayStream("http://khophimqd.vercel.app/source/stream/abc/index.m3u8"))
    }

    @Test fun oldCdnAndRelativeImagesCannotContactTheFormerSource() {
        assertEquals("", SourcePolicy.imageUrl("uploads/poster.jpg"))
        assertEquals("", SourcePolicy.imageUrl("https://phimimg.com/poster.jpg"))
        assertEquals("", SourcePolicy.imageUrl("https://cdn.phimimg.com/poster.jpg"))
        assertEquals("", SourcePolicy.imageUrl("http://images.example/poster.jpg"))
        assertEquals("https://images.example/poster.jpg", SourcePolicy.imageUrl("https://images.example/poster.jpg"))
    }
}
