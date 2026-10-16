package com.phimmoi.mobile.data

data class MovieItem(
    val title: String,
    val slug: String,
    val posterUrl: String,
    val bannerUrl: String? = null,
    val badge: String? = null,
    val episodeBadge: String? = null
)

data class MovieSection(
    val title: String,
    val slug: String,
    val movies: List<MovieItem>
)

data class MovieDetail(
    val title: String,
    val slug: String,
    val posterUrl: String,
    val backdropUrl: String? = null,
    val overview: String = "",
    val year: String = "",
    val quality: String = "",
    val episodes: List<EpisodeSource> = emptyList(),
    val relatedMovies: List<MovieItem> = emptyList()
)

data class EpisodeSource(
    val id: String,
    val serverName: String,
    val episodeName: String,
    val episodeSlug: String,
    val streamUrl: String
)

data class WatchProgress(
    val movieSlug: String,
    val movieTitle: String,
    val posterUrl: String,
    val bannerUrl: String? = null,
    val episodeSlug: String,
    val episodeName: String,
    val serverName: String,
    val streamUrl: String = "",
    val positionMs: Long,
    val durationMs: Long,
    val timestamp: Long = System.currentTimeMillis()
)
