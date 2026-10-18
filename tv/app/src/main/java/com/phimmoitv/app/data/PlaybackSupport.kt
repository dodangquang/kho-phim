package com.phimmoitv.app.data

import java.net.URI
import java.net.URLDecoder

/** Native playback accepts media, never an iframe document. */
internal object PlaybackSupport {
    fun movieSlugCandidates(raw: String): List<String> {
        val exact = raw.trim().trimEnd('/').substringAfterLast('/')
        if (exact.isBlank()) return emptyList()
        return listOf(exact)
    }

    fun nativeStream(media: String, embed: String = ""): String? =
        mediaUrl(media) ?: mediaUrl(embed)

    private fun mediaUrl(raw: String): String? {
        var candidate = raw.trim().replace(" ", "%20")
        repeat(4) {
            if (candidate.isBlank()) return null
            val uri = try { URI(candidate) } catch (_: Exception) { return null }
            if (uri.scheme?.lowercase() !in setOf("http", "https") || uri.host.isNullOrBlank()) {
                candidate = decode(candidate) ?: return null
            } else {
                val path = uri.path.orEmpty().lowercase()
                if (listOf(".m3u8", ".mp4", ".m4v", ".mov", ".webm").any(path::endsWith)) return candidate
                val nested = uri.rawQuery?.split("&")?.firstOrNull {
                    it.substringBefore("=").equals("url", ignoreCase = true)
                }?.substringAfter("=", "")
                if (nested != null) {
                    candidate = decode(nested) ?: return null
                } else {
                    return null
                }
            }
        }
        return null
    }

    private fun decode(value: String): String? = try {
        URLDecoder.decode(value, "UTF-8")
    } catch (_: IllegalArgumentException) { null }

    fun seekTarget(positionMs: Long, durationMs: Long, deltaMs: Long): Long {
        val target = (positionMs.coerceAtLeast(0L) + deltaMs).coerceAtLeast(0L)
        return if (durationMs > 0L) target.coerceAtMost(durationMs) else target
    }

    fun resumeEpisode(episodes: List<EpisodeSource>, progress: WatchProgress?): EpisodeSource? {
        if (progress == null) return null
        return episodes.firstOrNull {
            it.episodeSlug == progress.episodeSlug && it.serverName == progress.serverName
        } ?: episodes.firstOrNull { it.streamUrl == progress.streamUrl }
            ?: episodes.firstOrNull { it.episodeSlug == progress.episodeSlug }
    }
}

