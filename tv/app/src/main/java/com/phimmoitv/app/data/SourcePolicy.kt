package com.phimmoitv.app.data

import java.net.URI
import java.net.URLEncoder

/** The only catalog provider. Legacy slugs stay in history but are never sent to this source. */
object SourcePolicy {
    const val API_BASE = "https://khophimqd.vercel.app/source"
    const val LEGACY_MESSAGE = "Nguồn cũ đã ngừng dùng. Tìm lại phim trên Tủ Phim."
    private val sourceSlug = Regex("tp--[A-Za-z0-9_-]{1,176}")

    fun isCurrentSlug(slug: String?): Boolean = slug != null && sourceSlug.matches(slug)

    fun categoryUrl(path: String, page: Int = 1): String? {
        val clean = path.trim().trim('/')
        val route = when {
            clean in listOf("phim-moi", "phim-moi-cap-nhat", "danh-sach/phim-moi-cap-nhat") -> "danh-sach/phim-moi-cap-nhat"
            Regex("(the-loai|quoc-gia|danh-sach)/[a-z0-9-]+").matches(clean) -> "v1/api/$clean"
            Regex("[a-z0-9-]+").matches(clean) -> "v1/api/danh-sach/$clean"
            else -> return null
        }
        return "$API_BASE/$route?page=${page.coerceAtLeast(1)}"
    }

    fun searchUrl(query: String): String? = query.trim().takeIf { it.isNotEmpty() }?.let {
        "$API_BASE/v1/api/tim-kiem?keyword=${URLEncoder.encode(it, "UTF-8")}&limit=50&page=1"
    }

    fun detailUrl(slug: String, audio: String? = null): String? = if (isCurrentSlug(slug)) "$API_BASE/phim/$slug" + (if (audio in listOf("lt", "tm")) "?audio=$audio" else "") else null

    fun imageUrl(raw: String): String {
        val value = raw.trim()
        return try {
            val uri = URI(value)
            if (uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.userInfo == null &&
                !Regex("(^|\\.)(phimimg\\.com|phimapi\\.com|phimmoichill\\.(com|net)|phimmoic\\.(info|net)|phimmoivip\\.org)$").containsMatchIn(uri.host.lowercase())) value else ""
        } catch (_: Exception) { "" }
    }

    fun isGatewayStream(raw: String): Boolean = try {
        val uri = URI(raw)
        uri.scheme == "https" && uri.host == "khophimqd.vercel.app" && uri.userInfo == null && uri.port == -1 &&
            uri.path.startsWith("/source/stream/") && uri.path.endsWith(".m3u8") && !uri.path.contains("..")
    } catch (_: Exception) { false }
}
