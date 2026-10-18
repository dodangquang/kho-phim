package com.phimmoitv.app.data

import org.junit.Assert.*
import org.junit.Test

class PlaybackSupportTest {
    @Test fun numericSuffixKeepsExactFilmBeforeLegacyCollision() {
        val catalog = mapOf("sat-thu-ve-vuon-2026" to "2026 single", "sat-thu-ve-vuon" to "2025 animation")
        val selected = PlaybackSupport.movieSlugCandidates("sat-thu-ve-vuon-2026").firstNotNullOfOrNull(catalog::get)
        assertEquals("2026 single", selected)
        assertEquals(listOf("sat-thu-ve-vuon-2026"), PlaybackSupport.movieSlugCandidates("sat-thu-ve-vuon-2026"))
        assertEquals(listOf("dau-pha-thuong-khung-phan-5"),
            PlaybackSupport.movieSlugCandidates("https://example.com/phim/dau-pha-thuong-khung-phan-5/"))
    }

    @Test fun encodedEmbedResolvesHlsAndPreservesSignature() {
        assertEquals("https://cdn.example/episode.m3u8?token=a%2Bb&x=2",
            PlaybackSupport.nativeStream("", "https://player.example/watch?url=https%3A%2F%2Fcdn.example%2Fepisode.m3u8%3Ftoken%3Da%252Bb%26x%3D2"))
        assertEquals("https://cdn.example/episode.m3u8",
            PlaybackSupport.nativeStream("", "https://player.example/watch?url=https://cdn.example/episode.m3u8"))
    }

    @Test fun encodedWholeUrlAndDirectSignedMediaWork() {
        assertEquals("https://cdn.example/ep.m3u8", PlaybackSupport.nativeStream("https%3A%2F%2Fcdn.example%2Fep.m3u8"))
        assertEquals("https://cdn.example/ep.m3u8?token=a+b", PlaybackSupport.nativeStream("https://cdn.example/ep.m3u8?token=a+b"))
        assertEquals("https://cdn.example/video.mp4", PlaybackSupport.nativeStream("https://cdn.example/video.mp4"))
        assertEquals("https://cdn.example/ep.m3u8?url=signature", PlaybackSupport.nativeStream("https://cdn.example/ep.m3u8?url=signature"))
    }

    @Test fun htmlEmbedIsNeverNativeMedia() {
        assertNull(PlaybackSupport.nativeStream("", "https://player.example/embed/123"))
        assertNull(PlaybackSupport.nativeStream("https://player.example/index.html"))
        assertNull(PlaybackSupport.nativeStream("https://player.example/page?name=video.m3u8"))
    }

    @Test fun invalidAndNonHttpMediaAreRejected() {
        assertNull(PlaybackSupport.nativeStream("javascript:play('episode.m3u8')"))
        assertNull(PlaybackSupport.nativeStream("file:///episode.m3u8"))
        assertNull(PlaybackSupport.nativeStream("https:///episode.m3u8"))
        assertNull(PlaybackSupport.nativeStream("", "https://player.example/?url=%ZZ"))
    }

    @Test fun directMediaWinsOverEmbed() {
        assertEquals("https://cdn.example/main.m3u8",
            PlaybackSupport.nativeStream("https://cdn.example/main.m3u8", "https://player.example/embed/123"))
    }

    @Test fun unknownDurationDoesNotResetForwardSeek() {
        assertEquals(30_000L, PlaybackSupport.seekTarget(20_000L, -9223372036854775807L, 10_000L))
        assertEquals(0L, PlaybackSupport.seekTarget(2_000L, 0L, -10_000L))
        assertEquals(25_000L, PlaybackSupport.seekTarget(20_000L, 25_000L, 10_000L))
    }

    @Test fun resumePrefersSavedServerWhenEpisodeSlugsCollide() {
        val sub = EpisodeSource("sub-1", "Vietsub", "1", "tap-1", "https://cdn.example/sub.m3u8")
        val dub = EpisodeSource("dub-1", "Long tieng", "1", "tap-1", "https://cdn.example/dub.m3u8")
        val progress = WatchProgress(movieSlug = "movie", movieTitle = "Movie", posterUrl = "",
            episodeSlug = "tap-1", episodeName = "1", serverName = "Long tieng",
            streamUrl = dub.streamUrl, positionMs = 60_000L, durationMs = 120_000L)
        assertEquals(dub, PlaybackSupport.resumeEpisode(listOf(sub, dub), progress))
        assertEquals(sub, PlaybackSupport.resumeEpisode(listOf(sub), progress))
        assertNull(PlaybackSupport.resumeEpisode(listOf(sub), null))
    }
}

