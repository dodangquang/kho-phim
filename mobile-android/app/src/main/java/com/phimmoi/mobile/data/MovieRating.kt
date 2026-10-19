package com.phimmoi.mobile.data

import org.json.JSONObject
import java.util.Locale

data class MovieRating(val score: Double, val source: String, val votes: Long?) {
    val label: String get() = "★ $source "+String.format(Locale.US, "%.1f", score)
    val detailLabel: String get() = label+"/10"+(votes?.let { " · $it lượt đánh giá" } ?: "")

    companion object {
        fun candidate(score: Double, votes: Long?, source: String): MovieRating? {
            if (!score.isFinite() || score <= 0 || score > 10 || (votes != null && votes < 1)) return null
            return MovieRating(kotlin.math.floor(score * 10 + 0.5) / 10, source, votes)
        }

        fun fromMovie(movie: JSONObject): MovieRating? {
            fun read(key: String, source: String): MovieRating? {
                val value = movie.optJSONObject(key) ?: return null
                val votes = if (value.has("vote_count") && !value.isNull("vote_count")) value.optLong("vote_count", -1) else null
                return candidate(value.optDouble("vote_average", Double.NaN), votes, source)
            }
            return read("imdb", "IMDb") ?: read("tmdb", "TMDB")
        }
    }
}
