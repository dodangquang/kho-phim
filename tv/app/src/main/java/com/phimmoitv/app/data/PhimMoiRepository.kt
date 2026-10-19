package com.phimmoitv.app.data

import android.util.Log
import com.phimmoitv.app.network.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject
import org.jsoup.Jsoup

data class NetflixHomeData(val heroMovie: MovieItem?, val sections: List<MovieSection>)

/** Reads only the Kho Phim gateway backed by Tủ Phim. No HTML/domain fallback. */
class PhimMoiRepository {
    private val client = NetworkModule.okHttpClient

    private fun fetchJson(url: String): JSONObject? = try {
        client.newCall(Request.Builder().url(url).header("Accept", "application/json").build()).execute().use { response ->
            if (response.isSuccessful) response.body?.string()?.let { JSONObject(it) } else null
        }
    } catch (error: Exception) {
        Log.w("KhoPhimSource", "Không tải được dữ liệu Tủ Phim: ${error.message}")
        null
    }

    private fun parseMovies(root: JSONObject): List<MovieItem> {
        val items = root.optJSONObject("data")?.optJSONArray("items") ?: root.optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).mapNotNull { index ->
            val item = items.optJSONObject(index) ?: return@mapNotNull null
            val slug = item.optString("slug")
            if (!SourcePolicy.isCurrentSlug(slug)) return@mapNotNull null
            val poster = SourcePolicy.imageUrl(item.optString("poster_url"))
            val thumb = SourcePolicy.imageUrl(item.optString("thumb_url"))
            MovieItem(
                title = item.optString("name").ifBlank { slug }, slug = slug,
                posterUrl = poster.ifEmpty { thumb }, bannerUrl = thumb.ifEmpty { poster },
                badge = item.optString("quality").ifEmpty { item.optString("year") }.ifEmpty { null },
                episodeBadge = item.optString("episode_current").ifEmpty { item.optString("time") }.ifEmpty { null },
                modifiedTime = item.optJSONObject("modified")?.optString("time")?.ifEmpty { null },
                rating = MovieRating.fromMovie(item), audioPreference = item.optString("audio_preference").takeIf { it in listOf("lt", "tm") }
            )
        }
    }

    suspend fun getCategoryPage(categoryPath: String, page: Int = 1): List<MovieItem> = withContext(Dispatchers.IO) {
        SourcePolicy.categoryUrl(categoryPath, page)?.let { fetchJson(it)?.let(::parseMovies) } ?: emptyList()
    }

    suspend fun getHeroMovie(): MovieItem? = getCategoryPage("phim-moi", 1).firstOrNull()

    suspend fun getNetflixHomeSections(): NetflixHomeData = coroutineScope {
        val shelves = listOf(
            "⚡ Phim Mới Cập Nhật" to "danh-sach/phim-moi-cap-nhat",
            "🇻🇳 Điện Ảnh & Phim Việt Nam" to "quoc-gia/viet-nam",
            "🍿 Phim Chiếu Rạp" to "phim-chieu-rap",
            "📺 Phim Bộ Đang Thịnh Hành" to "phim-bo",
            "🗣️ Phim Lồng Tiếng" to "phim-long-tieng",
            "🎙️ Phim Thuyết Minh" to "phim-thuyet-minh",
            "⚔️ Hành Động & Kịch Tính" to "the-loai/hanh-dong",
            "💥 Anime & Hoạt Hình" to "the-loai/hoat-hinh",
            "👻 Kinh Dị & Rùng Rợn" to "the-loai/kinh-di",
            "🚀 Khoa Học Viễn Tưởng" to "the-loai/vien-tuong",
            "🌸 Tình Cảm & Lãng Mạn" to "the-loai/tinh-cam"
        )
        val requests = shelves.map { (title, path) -> async { MovieSection(title, path, getCategoryPage(path)) } }
        val sections = requests.map { it.await() }.filter { it.movies.isNotEmpty() }
        NetflixHomeData(sections.firstOrNull()?.movies?.firstOrNull(), sections)
    }

    suspend fun search(query: String): List<MovieItem> = withContext(Dispatchers.IO) {
        SourcePolicy.searchUrl(query)?.let { fetchJson(it)?.let(::parseMovies) } ?: emptyList()
    }

    suspend fun getMovieDetail(movieSlug: String, audioPreference: String? = null): MovieDetail = withContext(Dispatchers.IO) {
        val url = SourcePolicy.detailUrl(movieSlug, audioPreference) ?: return@withContext MovieDetail(
            title = movieSlug, slug = movieSlug, posterUrl = "", overview = SourcePolicy.LEGACY_MESSAGE
        )
        val root = fetchJson(url) ?: return@withContext MovieDetail(movieSlug, movieSlug, "", overview = "Không tải được phim từ Tủ Phim. Vui lòng thử lại.")
        val movie = root.optJSONObject("movie") ?: return@withContext MovieDetail(movieSlug, movieSlug, "")
        val poster = SourcePolicy.imageUrl(movie.optString("poster_url"))
        val thumb = SourcePolicy.imageUrl(movie.optString("thumb_url"))
        val episodes = mutableListOf<EpisodeSource>()
        val servers = root.optJSONArray("episodes")
        if (servers != null) for (i in 0 until servers.length()) {
            val server = servers.optJSONObject(i) ?: continue
            val name = server.optString("server_name", "Tủ Phim")
            val data = server.optJSONArray("server_data") ?: continue
            for (j in 0 until data.length()) {
                val episode = data.optJSONObject(j) ?: continue
                val stream = episode.optString("link_m3u8")
                if (!SourcePolicy.isGatewayStream(stream)) continue
                val slug = episode.optString("slug", "tap-${j + 1}")
                episodes.add(EpisodeSource("$name-$slug-$j", name, episode.optString("name", "Tập ${j + 1}"), slug, stream))
            }
        }
        MovieDetail(
            title = movie.optString("name").ifBlank { movieSlug }, slug = movieSlug,
            posterUrl = poster.ifEmpty { thumb }, backdropUrl = thumb.ifEmpty { poster },
            overview = listOf(movie.optString("audio_notice"), Jsoup.parse(movie.optString("content")).text()).filter { it.isNotBlank() }.joinToString("\n\n"), year = movie.optString("year"),
            quality = movie.optString("quality"), episodes = episodes, rating = MovieRating.fromMovie(movie)
        )
    }
}
