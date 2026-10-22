package com.phimmoitv.app.data

import android.content.Context
import com.phimmoitv.app.network.NetworkModule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class StartupNotice(val id: String, val title: String, val message: String) {
    companion object {
        fun validated(active: Boolean, id: String, title: String, message: String): StartupNotice? {
            if (!active || !id.matches(Regex("[a-zA-Z0-9_-]{1,80}")) || title.isBlank() ||
                title.length > 120 || message.isBlank() || message.length > 1200) return null
            return StartupNotice(id, title, message)
        }
    }
}

/** Public text-only feed. Failing to fetch a notice must never prevent startup. */
class StartupNoticeManager(context: Context) {
    private val prefs = context.getSharedPreferences("startup_notice", Context.MODE_PRIVATE)
    private val client = NetworkModule.okHttpClient.newBuilder().callTimeout(5, TimeUnit.SECONDS).build()

    suspend fun fetchUnseen(): StartupNotice? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url("https://khophimqd.vercel.app/announcement.json")
                .header("Cache-Control", "no-cache").build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val source = response.body?.source() ?: return@withContext null
                source.request(16385)
                if (source.buffer.size > 16384) return@withContext null
                val data = JSONObject(source.readUtf8())
                val notice = StartupNotice.validated(
                    data.opt("active") == true,
                    data.opt("id") as? String ?: "",
                    data.opt("title") as? String ?: "",
                    data.opt("message") as? String ?: ""
                ) ?: return@withContext null
                notice.takeUnless { prefs.getString("seen", null) == it.id }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { null }
    }

    fun acknowledge(notice: StartupNotice) { prefs.edit().putString("seen", notice.id).apply() }
}
