package com.phimmoi.mobile.data
import org.junit.Assert.*
import org.junit.Test
class MovieRatingTest {
    @Test fun invalidRatingsStayAbsent() {
        for (score in listOf(0.0, -1.0, 11.0, Double.NaN, Double.POSITIVE_INFINITY)) assertNull(MovieRating.candidate(score, 1, "IMDb"))
        assertNull(MovieRating.candidate(8.0, 0, "IMDb"))
    }
    @Test fun formatRatingAndVotes() {
        assertEquals("★ TMDB 7.3/10 · 8 lượt đánh giá", MovieRating.candidate(7.25, 8, "TMDB")?.detailLabel)
        assertEquals("★ IMDb 9.0/10", MovieRating.candidate(9.0, null, "IMDb")?.detailLabel)
    }
}