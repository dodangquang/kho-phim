package com.phimmoi.mobile.data

import org.junit.Assert.*
import org.junit.Test

class HistoryPolicyTest {
    private fun row(time: Long, position: Long = 65000, deleted: Boolean = false) = HistoryRow("phim-2026", "Phim", episodeSlug = "tap-2", serverName = "Thuyết Minh", positionMs = position, timestamp = time, deleted = deleted)
    @Test fun latestActionWinsWhenSeekingBackwards() {
        assertEquals(15000L, HistoryPolicy.merge(listOf(row(10)), listOf(row(20, 15000)), 0).single().positionMs)
    }
    @Test fun episodeAndServerFollowTheLatestViewingAction() {
        val latest = row(20).copy(episodeSlug = "tap-3", serverName = "Vietsub")
        assertEquals(latest, HistoryPolicy.merge(listOf(row(10)), listOf(latest), 0).single())
    }
    @Test fun tombstonePreventsStaleRestoreAndWinsTies() {
        assertTrue(HistoryPolicy.merge(listOf(row(20, deleted = true)), listOf(row(10)), 0).single().deleted)
        assertTrue(HistoryPolicy.merge(listOf(row(20)), listOf(row(20, deleted = true)), 0).single().deleted)
    }
    @Test fun clearWatermarkRejectsAllOlderOfflineProgress() {
        assertTrue(HistoryPolicy.merge(listOf(row(10)), listOf(row(20)), 30).isEmpty())
        assertEquals(40L, HistoryPolicy.merge(listOf(row(10)), listOf(row(40)), 30).single().timestamp)
    }
    @Test fun deterministicTieOrder() {
        val a = row(10, 15000); val b = row(10, 20000)
        assertEquals(HistoryPolicy.merge(listOf(a), listOf(b), 0), HistoryPolicy.merge(listOf(b), listOf(a), 0))
    }
    @Test fun invalidSlugAndUnsafeImagesAreRejected() {
        assertNull(HistoryPolicy.normalize(row(10).copy(movieSlug = "../other")))
        assertEquals("", HistoryPolicy.normalize(row(10).copy(posterUrl = "javascript:alert(1)"))?.posterUrl)
        assertEquals(0L, HistoryPolicy.normalize(row(10).copy(positionMs = -1))?.positionMs)
    }
    @Test fun roundTripKeepsMillisecondsEpisodeAndServerWithoutStaleStreamUrl() {
        val original = WatchProgress("phim-2026", "Phim", "https://phimimg.com/poster.jpg", episodeSlug = "tap-2", episodeName = "Tập 2", serverName = "Thuyết Minh", streamUrl = "https://expired.test/video.m3u8", positionMs = 65000, durationMs = 120000, timestamp = 123)
        val result = HistoryPolicy.fromProgress(original).progress()
        assertEquals(original.copy(streamUrl = ""), result)
    }
}
