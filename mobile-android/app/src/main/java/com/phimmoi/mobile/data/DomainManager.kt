package com.phimmoi.mobile.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class DomainManager(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("phimmoi_config", Context.MODE_PRIVATE)

    private val fallbackDomains = listOf(
        "https://phimmoichill.net",
        "https://phimmoichill.com",
        "https://phimmoic.info",
        "https://phimmoic.net",
        "https://phimmoivip.org"
    )

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    fun getActiveDomain(): String {
        return prefs.getString("active_domain", null) ?: fallbackDomains.first()
    }

    fun setActiveDomain(domain: String) {
        val clean = domain.trim().trimEnd('/')
        prefs.edit().putString("active_domain", clean).apply()
    }

    suspend fun resolveWorkingDomain(): String? = withContext(Dispatchers.IO) {
        val current = getActiveDomain()
        if (isDomainAlive(current)) {
            return@withContext current
        }
        for (domain in fallbackDomains) {
            if (domain != current && isDomainAlive(domain)) {
                setActiveDomain(domain)
                return@withContext domain
            }
        }
        null
    }

    private fun isDomainAlive(domain: String): Boolean {
        return try {
            val request = Request.Builder()
                .url(domain)
                .header("User-Agent", "Mozilla/5.0")
                .head()
                .build()
            httpClient.newCall(request).execute().use { response ->
                response.isSuccessful || response.code in 200..399
            }
        } catch (_: Exception) {
            false
        }
    }

    fun getAllFallbackDomains(): List<String> = fallbackDomains
}
