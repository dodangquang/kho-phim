package com.phimmoi.mobile.data

import android.util.Log
import com.phimmoi.mobile.network.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject
import org.jsoup.Jsoup
import java.net.URLEncoder
import java.net.URLDecoder
import java.util.regex.Pattern

data class NetflixHomeData(
    val heroMovie: MovieItem?,
    val sections: List<MovieSection>
)

class PhimMoiRepository(private val domainManager: DomainManager? = null) {

    companion object {
        private val BROKEN_MOVIE_SLUGS = setOf(
            "vision-quest",
            "mot-tran-thanh-danh"
        )

        fun isBrokenMovie(slug: String?): Boolean {
            if (slug.isNullOrBlank()) return false
            val clean = slug.lowercase().trim().trim('/').substringAfterLast('/')
            return BROKEN_MOVIE_SLUGS.contains(clean) || clean.contains("vision-quest") || clean.contains("mot-tran-thanh-danh")
        }
    }

    private val client = NetworkModule.okHttpClient

    fun getBaseUrl(): String {
        return domainManager?.getActiveDomain()?.trimEnd('/') ?: "https://phimmoic.info"
    }

    fun buildPageUrl(categoryPath: String, page: Int = 1): String {
        val base = getBaseUrl()
        val clean = categoryPath.trim().trimStart('/').trimEnd('/')
        val fullPath = when {
            clean.startsWith("http") -> clean
            clean.startsWith("the-loai/") || clean.startsWith("danh-sach/") -> clean
            clean == "phim-moi" -> ""
            else -> "danh-sach/$clean"
        }
        return if (fullPath.isEmpty()) {
            base
        } else if (page <= 1) {
            "$base/$fullPath"
        } else {
            "$base/$fullPath/$page"
        }
    }

    private fun parseMoviesFromHtml(html: String, baseUrl: String): List<MovieItem> {
        val doc = Jsoup.parse(html)
        val movies = mutableListOf<MovieItem>()
        val elements = doc.select("a[href^=/phim/]")
        for (el in elements) {
            val href = el.attr("href").trim()
            if (href.split("/").filter { it.isNotEmpty() }.size > 2) continue
            val slug = href.removePrefix("/phim/").trim('/')
            if (slug.isEmpty() || isBrokenMovie(slug)) continue
            val title = el.attr("title").ifEmpty { el.select("h2, h3, p, span").text() }
            val imgEl = el.select("img").first()
            val posterSrc = imgEl?.attr("src") ?: ""
            val fullPoster = if (posterSrc.startsWith("http")) posterSrc else "$baseUrl$posterSrc"
            val badge = el.select("div.absolute.top-1.left-1").text()
            val epBadge = el.select("div.absolute.top-1.right-1").text()
            if (!movies.any { it.slug == slug }) {
                movies.add(
                    MovieItem(
                        title = title.ifEmpty { slug },
                        slug = slug,
                        posterUrl = fullPoster,
                        badge = badge.ifEmpty { null },
                        episodeBadge = epBadge.ifEmpty { null }
                    )
                )
            }
        }
        return movies
    }

    suspend fun getCategoryPage(categoryPath: String, page: Int = 1): List<MovieItem> = withContext(Dispatchers.IO) {
        val apiMovies = fetchCategoryFromApi(categoryPath, page)
        if (apiMovies.isNotEmpty()) return@withContext apiMovies
        val url = buildPageUrl(categoryPath, page)
        try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            val html = response.body?.string() ?: return@withContext emptyList()
            parseMoviesFromHtml(html, getBaseUrl())
        } catch (e: Exception) {
            Log.e("PhimMoiRepo", "Lỗi fetch $url: ${e.message}")
            emptyList()
        }
    }

    private fun fetchCategoryFromApi(categoryPath: String, page: Int): List<MovieItem> {
        val clean = categoryPath.trim().trimStart('/').trimEnd('/')
        val apiUrl = when {
            clean == "phim-moi" || clean == "danh-sach/phim-moi-cap-nhat" || clean == "phim-moi-cap-nhat" -> "https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=$page"
            clean == "danh-sach/phim-thuyet-minh" || clean == "phim-thuyet-minh" -> "https://phimapi.com/v1/api/danh-sach/phim-thuyet-minh?page=$page"
            clean == "danh-sach/phim-long-tieng" || clean == "phim-long-tieng" -> "https://phimapi.com/v1/api/danh-sach/phim-long-tieng?page=$page"
            clean == "quoc-gia/viet-nam" || clean == "viet-nam" -> "https://phimapi.com/v1/api/quoc-gia/viet-nam?page=$page"
            clean == "danh-sach/phim-bo" || clean == "phim-bo" -> "https://phimapi.com/v1/api/danh-sach/phim-bo?page=$page"
            clean == "danh-sach/phim-le" || clean == "phim-le" -> "https://phimapi.com/v1/api/danh-sach/phim-le?page=$page"
            clean == "danh-sach/phim-chieu-rap" || clean == "phim-chieu-rap" -> "https://phimapi.com/v1/api/danh-sach/phim-chieu-rap?page=$page"
            clean.startsWith("the-loai/") -> "https://phimapi.com/v1/api/$clean?page=$page"
            clean.startsWith("quoc-gia/") -> "https://phimapi.com/v1/api/$clean?page=$page"
            clean.startsWith("danh-sach/") -> "https://phimapi.com/v1/api/$clean?page=$page"
            else -> "https://phimapi.com/v1/api/danh-sach/$clean?page=$page"
        }
        try {
            val req = Request.Builder().url(apiUrl).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36").build()
            val resp = client.newCall(req).execute()
            if (resp.isSuccessful) {
                val body = resp.body?.string() ?: return emptyList()
                return parseMoviesFromJson(body)
            }
        } catch (e: Exception) {
            Log.w("PhimMoiRepo", "API error $apiUrl: ${e.message}")
        }
        return emptyList()
    }

    private fun formatImageUrl(url: String): String {
        var trimmed = url.trim()
        if (trimmed.isEmpty()) return ""
        if (trimmed.startsWith("http://")) {
            trimmed = "https://" + trimmed.removePrefix("http://")
        }
        val clean = trimmed.trimStart('/')
        return when {
            trimmed.startsWith("https://") -> trimmed
            trimmed.startsWith("//") -> "https:$trimmed"
            clean.startsWith("uploads/") || clean.startsWith("upload/") -> "https://phimimg.com/$clean"
            clean.contains(".vn/") || clean.contains(".com/") || clean.contains(".net/") || clean.contains(".org/") -> "https://$clean"
            else -> "https://phimimg.com/$clean"
        }
    }

    private fun parseMoviesFromJson(jsonStr: String): List<MovieItem> {
        val list = mutableListOf<MovieItem>()
        try {
            val root = JSONObject(jsonStr)
            val itemsArr = when {
                root.has("data") && root.getJSONObject("data").has("items") -> root.getJSONObject("data").getJSONArray("items")
                root.has("items") -> root.getJSONArray("items")
                else -> null
            } ?: return emptyList()
            for (i in 0 until itemsArr.length()) {
                val item = itemsArr.optJSONObject(i) ?: continue
                val name = item.optString("name").trim()
                val slug = item.optString("slug").trim()
                if (slug.isEmpty() || isBrokenMovie(slug)) continue
                val rawPoster = item.optString("poster_url").trim()
                val rawThumb = item.optString("thumb_url").trim()
                val resolvedPoster = formatImageUrl(rawPoster)
                val resolvedThumb = formatImageUrl(rawThumb)
                val isPosterFromCdn = resolvedPoster.contains("phimimg.com") && !resolvedPoster.contains("danviet") && !resolvedPoster.contains("kenh14")
                val isThumbFromCdn = resolvedThumb.contains("phimimg.com") && !resolvedThumb.contains("danviet") && !resolvedThumb.contains("kenh14")
                val finalPoster = if (!isPosterFromCdn && isThumbFromCdn) resolvedThumb else if (resolvedPoster.isNotEmpty()) resolvedPoster else resolvedThumb
                val finalBanner = if (isThumbFromCdn) resolvedThumb else if (resolvedThumb.isNotEmpty()) resolvedThumb else resolvedPoster
                val badge = item.optString("quality").ifEmpty { if (item.has("year")) item.optString("year") else "" }
                val epBadge = item.optString("episode_current").ifEmpty { item.optString("time", "") }
                val modifiedObj = item.optJSONObject("modified")
                val modifiedTime = modifiedObj?.optString("time")?.ifEmpty { null }
                list.add(MovieItem(title = name.ifEmpty { slug }, slug = slug, posterUrl = finalPoster, bannerUrl = finalBanner, badge = badge.ifEmpty { null }, episodeBadge = epBadge.ifEmpty { null }, modifiedTime = modifiedTime))
            }
            // Sắp xếp các phim: phim mới cập nhật lên đầu
            list.sortWith(compareByDescending<MovieItem> { it.modifiedTime ?: "" }.thenByDescending { it.badge ?: "" })
        } catch (e: Exception) {
            Log.e("PhimMoiRepo", "JSON parse error: ${e.message}")
        }
        return list
    }

    suspend fun getHeroMovie(): MovieItem? = withContext(Dispatchers.IO) {
        val list = getCategoryPage("phim-moi", 1)
        list.firstOrNull()
    }

    suspend fun getNetflixHomeSections(): NetflixHomeData = withContext(Dispatchers.IO) {
        coroutineScope {
            val moiCapNhatReq = async { getCategoryPage("danh-sach/phim-moi-cap-nhat", 1) }
            val thuyetMinhReq = async { getCategoryPage("danh-sach/phim-thuyet-minh", 1) }
            val longTiengReq = async { getCategoryPage("danh-sach/phim-long-tieng", 1) }
            val vietNamReq = async { getCategoryPage("quoc-gia/viet-nam", 1) }
            val newestReq = async { getCategoryPage("phim-moi", 1) }
            val theaterReq = async { getCategoryPage("phim-chieu-rap", 1) }
            val seriesReq = async { getCategoryPage("phim-bo", 1) }
            val actionReq = async { getCategoryPage("the-loai/hanh-dong", 1) }
            val animeReq = async { getCategoryPage("the-loai/hoat-hinh", 1) }
            val horrorReq = async { getCategoryPage("the-loai/kinh-di", 1) }
            val scifiReq = async { getCategoryPage("the-loai/vien-tuong", 1) }
            val romanceReq = async { getCategoryPage("the-loai/tinh-cam", 1) }
            val moiCapNhat = moiCapNhatReq.await()
            val thuyetMinh = thuyetMinhReq.await()
            val longTieng = longTiengReq.await()
            val vietNam = vietNamReq.await()
            val newest = newestReq.await()
            val theater = theaterReq.await()
            val series = seriesReq.await()
            val action = actionReq.await()
            val anime = animeReq.await()
            val horror = horrorReq.await()
            val scifi = scifiReq.await()
            val romance = romanceReq.await()
            val hero = moiCapNhat.firstOrNull() ?: thuyetMinh.firstOrNull() ?: longTieng.firstOrNull() ?: vietNam.firstOrNull() ?: newest.firstOrNull()
            val sections = mutableListOf<MovieSection>()
            if (moiCapNhat.isNotEmpty()) sections.add(MovieSection("⚡ Phim Mới Cập Nhật", "danh-sach/phim-moi-cap-nhat", moiCapNhat))
            if (thuyetMinh.isNotEmpty()) sections.add(MovieSection("🎙️ Phim Thuyết Minh", "danh-sach/phim-thuyet-minh", thuyetMinh))
            if (longTieng.isNotEmpty()) sections.add(MovieSection("🎧 Phim Lồng Tiếng", "danh-sach/phim-long-tieng", longTieng))
            if (vietNam.isNotEmpty()) sections.add(MovieSection("🇻🇳 Phim Việt Nam", "quoc-gia/viet-nam", vietNam))
            if (newest.isNotEmpty()) sections.add(MovieSection("🔥 Phim Mới Cập Nhật", "phim-moi", newest))
            if (theater.isNotEmpty()) sections.add(MovieSection("🍿 Chiếu Rạp", "phim-chieu-rap", theater))
            if (series.isNotEmpty()) sections.add(MovieSection("📺 Phim Bộ", "phim-bo", series))
            if (action.isNotEmpty()) sections.add(MovieSection("⚔️ Hành Động", "the-loai/hanh-dong", action))
            if (anime.isNotEmpty()) sections.add(MovieSection("💥 Anime", "the-loai/hoat-hinh", anime))
            if (horror.isNotEmpty()) sections.add(MovieSection("👻 Kinh Dị", "the-loai/kinh-di", horror))
            if (scifi.isNotEmpty()) sections.add(MovieSection("🚀 Viễn Tưởng", "the-loai/vien-tuong", scifi))
            if (romance.isNotEmpty()) sections.add(MovieSection("🌸 Tình Cảm", "the-loai/tinh-cam", romance))
            NetflixHomeData(hero, sections)
        }
    }

    suspend fun search(query: String): List<MovieItem> = withContext(Dispatchers.IO) {
        val cleanQuery = query.trim()
        if (cleanQuery.isEmpty()) return@withContext emptyList()
        val encoded = URLEncoder.encode(cleanQuery, "UTF-8")
        val apiUrl = "https://phimapi.com/v1/api/tim-kiem?keyword=$encoded&limit=50&page=1"
        try {
            val req = Request.Builder().url(apiUrl).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36").build()
            val resp = client.newCall(req).execute()
            if (resp.isSuccessful) {
                val body = resp.body?.string()
                if (!body.isNullOrBlank()) {
                    val movies = parseMoviesFromJson(body)
                    if (movies.isNotEmpty()) return@withContext movies
                }
            }
        } catch (e: Exception) {
            Log.w("PhimMoiRepo", "Search API error: ${e.message}")
        }
        val baseUrl = getBaseUrl()
        val url = "$baseUrl/search?q=$encoded"
        try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            val html = response.body?.string() ?: return@withContext emptyList()
            parseMoviesFromHtml(html, baseUrl)
        } catch (e: Exception) {
            Log.e("PhimMoiRepo", "Search HTML error: ${e.message}")
            emptyList()
        }
    }

    suspend fun getMovieDetail(movieSlug: String): MovieDetail = withContext(Dispatchers.IO) {
        val slugCandidates = PlaybackSupport.movieSlugCandidates(movieSlug)
        val cleanSlug = slugCandidates.firstOrNull() ?: movieSlug
        if (isBrokenMovie(movieSlug) || isBrokenMovie(cleanSlug)) {
            return@withContext MovieDetail(
                title = movieSlug,
                slug = movieSlug,
                posterUrl = "",
                overview = "Phim này đã bị gỡ khỏi kho do máy chủ gốc bị lỗi nguồn phát (HTTP 404).",
                episodes = emptyList()
            )
        }
        for (candidate in slugCandidates) {
            val detail = fetchDetailFromApi(candidate, movieSlug)
            if (detail != null && detail.episodes.isNotEmpty()) return@withContext detail
        }
        val baseUrl = getBaseUrl()
        val url = "$baseUrl/phim/$movieSlug"
        try {
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            val html = response.body?.string() ?: return@withContext MovieDetail(movieSlug, movieSlug, "")
            val doc = Jsoup.parse(html)
            val title = doc.select("h1").text().ifEmpty { movieSlug }
            val posterEl = doc.select("img[src*=/storage/images/]").first()
            val posterSrc = posterEl?.attr("src") ?: ""
            val fullPoster = if (posterSrc.startsWith("http")) posterSrc else "$baseUrl$posterSrc"
            val overview = doc.select("div.prose, p.line-clamp-3, div.text-sm").text()
            val epLinks = doc.select("a[href*=/phim/$movieSlug/]")
            val episodes = mutableListOf<EpisodeSource>()
            if (epLinks.isNotEmpty()) {
                val distinctSlugs = epLinks.mapNotNull { it.attr("href").substringAfterLast('/').ifEmpty { null } }.distinct()
                for (epSlug in distinctSlugs) {
                    val eps = getEpisodesAndStreams(movieSlug, epSlug)
                    episodes.addAll(eps)
                }
            }
            if (episodes.isEmpty()) {
                val defaultEps = getEpisodesAndStreams(movieSlug, "k-tap-01")
                episodes.addAll(defaultEps)
            }
            MovieDetail(title = title, slug = movieSlug, posterUrl = fullPoster, backdropUrl = fullPoster, overview = overview, episodes = episodes.distinctBy { it.id })
        } catch (e: Exception) {
            Log.e("PhimMoiRepo", "Detail scrape error: ${e.message}")
            MovieDetail(movieSlug, movieSlug, "")
        }
    }

    private fun fetchDetailFromApi(slug: String, fallbackSlug: String): MovieDetail? {
        val providers = listOf("https://phimapi.com/phim/$slug")
        for (url in providers) {
            try {
                val req = Request.Builder().url(url).header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36").build()
                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val body = resp.body?.string() ?: return@use
                        val detail = parseDetailFromJson(body, fallbackSlug)
                        if (detail != null && detail.episodes.isNotEmpty()) return detail
                    }
                }
            } catch (e: Exception) {
                Log.w("PhimMoiRepo", "API error $url: ${e.message}")
            }
        }
        return null
    }

    private fun parseDetailFromJson(jsonStr: String, fallbackSlug: String): MovieDetail? {
        try {
            val root = JSONObject(jsonStr)
            if (!root.optBoolean("status", true) && !root.has("movie")) return null
            val movieObj = root.optJSONObject("movie") ?: return null
            val name = movieObj.optString("name").ifEmpty { movieObj.optString("origin_name", fallbackSlug) }
            val rawContent = movieObj.optString("content", "")
            val overview = if (rawContent.contains("<")) Jsoup.parse(rawContent).text() else rawContent
            val rawPoster = movieObj.optString("poster_url", "").trim()
            val rawThumb = movieObj.optString("thumb_url", "").trim()
            val resolvedPoster = formatImageUrl(rawPoster)
            val resolvedThumb = formatImageUrl(rawThumb)
            val isPosterFromCdn = resolvedPoster.contains("phimimg.com") && !resolvedPoster.contains("danviet") && !resolvedPoster.contains("kenh14")
            val isThumbFromCdn = resolvedThumb.contains("phimimg.com") && !resolvedThumb.contains("danviet") && !resolvedThumb.contains("kenh14")
            val finalPoster = if (!isPosterFromCdn && isThumbFromCdn) resolvedThumb else if (resolvedPoster.isNotEmpty()) resolvedPoster else resolvedThumb
            val finalBackdrop = if (isThumbFromCdn) resolvedThumb else if (resolvedThumb.isNotEmpty()) resolvedThumb else resolvedPoster
            val year = movieObj.optString("year", "")
            val quality = movieObj.optString("quality", "")
            val episodesList = mutableListOf<EpisodeSource>()
            val episodesArr = root.optJSONArray("episodes")
            if (episodesArr != null) {
                for (i in 0 until episodesArr.length()) {
                    val srvObj = episodesArr.optJSONObject(i) ?: continue
                    val serverName = srvObj.optString("server_name", "Server VIP").trim()
                    val serverData = srvObj.optJSONArray("server_data") ?: continue
                    for (j in 0 until serverData.length()) {
                        val epObj = serverData.optJSONObject(j) ?: continue
                        val epName = epObj.optString("name", "Tập ${j + 1}").trim()
                        val epSlug = epObj.optString("slug", "tap-${j + 1}").trim()
                        val linkM3u8 = epObj.optString("link_m3u8", "").trim()
                        val linkEmbed = epObj.optString("link_embed", "").trim()
                        val streamUrl = PlaybackSupport.nativeStream(linkM3u8, linkEmbed).orEmpty()
                        if (streamUrl.isNotEmpty()) {
                            episodesList.add(EpisodeSource(id = "$serverName-$epSlug-$j", serverName = serverName, episodeName = epName, episodeSlug = epSlug, streamUrl = streamUrl))
                        }
                    }
                }
            }
            return MovieDetail(title = name, slug = fallbackSlug, posterUrl = finalPoster, backdropUrl = finalBackdrop, overview = overview, year = year, quality = quality, episodes = episodesList)
        } catch (e: Exception) {
            Log.e("PhimMoiRepo", "JSON detail parse error: ${e.message}")
            return null
        }
    }

    suspend fun getEpisodesAndStreams(movieSlug: String, epSlug: String = "k-tap-01"): List<EpisodeSource> = withContext(Dispatchers.IO) {
        val baseUrl = getBaseUrl()
        val url = "$baseUrl/phim/$movieSlug/$epSlug"
        val request = Request.Builder().url(url).build()
        val response = client.newCall(request).execute()
        val rawHtml = response.body?.string() ?: return@withContext emptyList()
        val normalized = rawHtml.replace("\\\"", "\"").replace("\\/", "/")
        val pattern = Pattern.compile("""\{"id":"(\d+)","movie_id":"\d+","server":"([^"]+)","name":"([^"]+)","slug":"([^"]+)","type":"m3u8","link":"([^"]+)"""")
        val matcher = pattern.matcher(normalized)
        val list = mutableListOf<EpisodeSource>()
        while (matcher.find()) {
            val id = matcher.group(1) ?: ""
            val server = matcher.group(2) ?: "Server Phụ"
            val name = matcher.group(3) ?: "Tập"
            val slug = matcher.group(4) ?: ""
            var link = matcher.group(5) ?: ""
            if (link.contains("url=")) {
                val extracted = link.substringAfter("url=").substringBefore("&")
                link = try { URLDecoder.decode(extracted, "UTF-8") } catch (_: Exception) { extracted }
            }
            link = PlaybackSupport.nativeStream(link).orEmpty()
            if (link.isNotEmpty()) {
                list.add(EpisodeSource(id = id, serverName = server, episodeName = name, episodeSlug = slug, streamUrl = link))
            }
        }
        list
    }
}
