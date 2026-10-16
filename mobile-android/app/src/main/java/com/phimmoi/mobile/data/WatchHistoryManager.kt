package com.phimmoi.mobile.data

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class WatchHistoryManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("phimmoi_watch_history", Context.MODE_PRIVATE)
    private val gson = Gson()

    fun saveProgress(progress: WatchProgress) {
        val currentList = getAllHistory().toMutableList()
        currentList.removeAll { it.movieSlug == progress.movieSlug }
        currentList.add(0, progress)
        val trimmed = if (currentList.size > 50) currentList.take(50) else currentList
        val json = gson.toJson(trimmed)
        prefs.edit().putString(KEY_HISTORY, json).apply()
    }

    fun getAllHistory(): List<WatchProgress> {
        val json = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<WatchProgress>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun getProgress(movieSlug: String): WatchProgress? {
        return getAllHistory().find { it.movieSlug == movieSlug }
    }

    fun remove(movieSlug: String) {
        val currentList = getAllHistory().toMutableList()
        currentList.removeAll { it.movieSlug == movieSlug }
        val json = gson.toJson(currentList)
        prefs.edit().putString(KEY_HISTORY, json).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_HISTORY).apply()
    }

    companion object {
        private const val KEY_HISTORY = "history_list"
    }
}
