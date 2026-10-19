package com.phimmoi.mobile.data
import android.content.Context
class WatchHistoryManager(private val context: Context, private val playbackOwner: String? = null) {
    private val cloud = CloudHistory.get(context)
    val revision get() = cloud.revision
    fun ownerKey() = cloud.ownerKey()
    fun forPlayback() = WatchHistoryManager(context, cloud.ownerKey())
    fun saveProgress(progress: WatchProgress) = cloud.save(progress, playbackOwner)
    fun getAllHistory(): List<WatchProgress> = cloud.history()
    fun getProgress(movieSlug: String): WatchProgress? = getAllHistory().find { it.movieSlug == movieSlug }
    fun remove(movieSlug: String) = cloud.remove(movieSlug)
    fun clear() = cloud.clear()
}
