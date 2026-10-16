package com.phimmoi.mobile.ui.player

import com.phimmoi.mobile.data.EpisodeSource
import com.phimmoi.mobile.data.MovieItem

object PlayerSession {
    var movie: MovieItem? = null
    var currentEpisode: EpisodeSource? = null
    var allEpisodes: List<EpisodeSource> = emptyList()
    var initialPositionMs: Long = 0L

    fun set(
        movie: MovieItem,
        episode: EpisodeSource,
        episodes: List<EpisodeSource>,
        startPositionMs: Long = 0L
    ) {
        this.movie = movie
        this.currentEpisode = episode
        this.allEpisodes = episodes
        this.initialPositionMs = startPositionMs
    }

    fun clear() {
        movie = null
        currentEpisode = null
        allEpisodes = emptyList()
        initialPositionMs = 0L
    }
}
