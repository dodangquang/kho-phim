package com.phimmoi.mobile.data

@com.google.firebase.firestore.IgnoreExtraProperties
data class HistoryRow(
    val movieSlug: String = "", val movieTitle: String = "", val posterUrl: String = "", val bannerUrl: String = "",
    val episodeSlug: String = "", val episodeName: String = "", val serverName: String = "",
    val positionMs: Long = 0, val durationMs: Long = 0, val timestamp: Long = 1, val deleted: Boolean = false
) {
    fun progress() = WatchProgress(movieSlug, movieTitle, posterUrl, bannerUrl.ifEmpty { null }, episodeSlug, episodeName, serverName,
        positionMs = positionMs, durationMs = durationMs, timestamp = timestamp)
    fun cloud(): Map<String, Any> = linkedMapOf(
        "movieSlug" to movieSlug, "movieTitle" to movieTitle, "posterUrl" to posterUrl, "bannerUrl" to bannerUrl,
        "episodeSlug" to episodeSlug, "episodeName" to episodeName, "serverName" to serverName,
        "positionMs" to positionMs, "durationMs" to durationMs, "timestamp" to timestamp, "deleted" to deleted)
    fun tieKey() = listOf(movieTitle, posterUrl, bannerUrl, episodeSlug, episodeName, serverName, positionMs.toString(), durationMs.toString()).joinToString("\u0000")
}

object HistoryPolicy {
    private fun image(value: String) = value.takeIf { it.matches(Regex("^https://[^\\s<>\"']+$")) }?.take(2048) ?: ""
    fun fromProgress(value: WatchProgress) = HistoryRow(value.movieSlug, value.movieTitle, value.posterUrl, value.bannerUrl ?: "",
        value.episodeSlug, value.episodeName, value.serverName, value.positionMs, value.durationMs, value.timestamp)
    fun normalize(row: HistoryRow): HistoryRow? {
        if (!row.movieSlug.matches(Regex("^[a-zA-Z0-9_-]{1,180}$"))) return null
        return row.copy(movieTitle = row.movieTitle.take(300), posterUrl = image(row.posterUrl), bannerUrl = image(row.bannerUrl),
            episodeSlug = row.episodeSlug.take(180), episodeName = row.episodeName.take(200), serverName = row.serverName.take(200),
            positionMs = row.positionMs.coerceIn(0, 31536000000), durationMs = row.durationMs.coerceIn(0, 31536000000), timestamp = row.timestamp.coerceAtLeast(1))
    }
    fun later(a: HistoryRow?, b: HistoryRow): HistoryRow {
        if (a == null) return b
        if (a.timestamp != b.timestamp) return if (a.timestamp > b.timestamp) a else b
        if (a.deleted != b.deleted) return if (a.deleted) a else b
        return if (a.tieKey() >= b.tieKey()) a else b
    }
    fun merge(a: List<HistoryRow>, b: List<HistoryRow>, clearedAt: Long): List<HistoryRow> {
        val rows = linkedMapOf<String, HistoryRow>()
        for (raw in a + b) normalize(raw)?.takeIf { it.timestamp > clearedAt }?.let { rows[it.movieSlug] = later(rows[it.movieSlug], it) }
        return rows.values.sortedWith(compareByDescending<HistoryRow> { it.timestamp }.thenBy { it.movieSlug }).take(240)
    }
}

data class HistorySyncState(
    var rows: List<HistoryRow> = emptyList(), var dirty: MutableMap<String, Long> = mutableMapOf(),
    var clearedAt: Long = 0, var clearDirty: Boolean = false
)
