package com.phimmoi.mobile.data

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.phimmoi.mobile.network.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

data class UpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val changelog: String
)

class AppUpdateManager(private val context: Context) {

    private val client = NetworkModule.okHttpClient
    private val defaultUpdateUrl = "https://raw.githubusercontent.com/dodangquang/kho-phim/main/version.json"
    private val fallbackUpdateUrl = "https://dodangquang.github.io/kho-phim/version.json"

    suspend fun checkUpdate(currentVersionCode: Int): UpdateInfo? = withContext(Dispatchers.IO) {
        val urls = listOf(defaultUpdateUrl, fallbackUpdateUrl)
        for (url in urls) {
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("Cache-Control", "no-cache")
                    .build()
                val resp = client.newCall(req).execute()
                if (resp.isSuccessful) {
                    val jsonStr = resp.body?.string()
                    if (!jsonStr.isNullOrBlank()) {
                        val obj = JSONObject(jsonStr)
                        val remoteVersionCode = obj.optInt("versionCode", 0)
                        val remoteVersionName = obj.optString("versionName", "")
                        val apkUrl = obj.optString("apkUrl", "")
                        val changelog = obj.optString("changelog", "Bản cập nhật mới.")
                        if (remoteVersionCode > currentVersionCode && apkUrl.isNotEmpty()) {
                            return@withContext UpdateInfo(remoteVersionCode, remoteVersionName, apkUrl, changelog)
                        } else if (remoteVersionCode > 0) {
                            return@withContext null
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w("AppUpdateManager", "Không thể kiểm tra cập nhật từ $url: ${e.message}")
            }
        }
        return@withContext null
    }

    suspend fun downloadAndInstallApk(
        activity: Activity,
        apkUrl: String,
        onProgress: (Float) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(apkUrl).build()
            val resp = client.newCall(req).execute()
            if (!resp.isSuccessful) {
                withContext(Dispatchers.Main) { onError("Tải thất bại: HTTP ${resp.code}") }
                return@withContext
            }
            val body = resp.body ?: run {
                withContext(Dispatchers.Main) { onError("Không có dữ liệu") }
                return@withContext
            }
            val totalBytes = body.contentLength()
            val updateFile = File(activity.cacheDir, "update.apk")
            if (updateFile.exists()) updateFile.delete()
            body.byteStream().use { input ->
                FileOutputStream(updateFile).use { output ->
                    val buffer = ByteArray(8 * 1024)
                    var bytesRead: Int
                    var downloaded: Long = 0
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloaded += bytesRead
                        if (totalBytes > 0) {
                            withContext(Dispatchers.Main) { onProgress(downloaded.toFloat() / totalBytes.toFloat()) }
                        }
                    }
                    output.flush()
                }
            }
            withContext(Dispatchers.Main) { installApk(activity, updateFile) }
        } catch (e: Exception) {
            Log.e("AppUpdateManager", "Lỗi tải: ${e.message}")
            withContext(Dispatchers.Main) { onError("Lỗi: ${e.localizedMessage}") }
        }
    }

    private fun installApk(activity: Activity, apkFile: File) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${activity.packageName}")
                    }
                    activity.startActivity(intent)
                    return
                }
            }
            val contentUri = FileProvider.getUriForFile(activity, "${activity.packageName}.provider", apkFile)
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            activity.startActivity(installIntent)
        } catch (e: Exception) {
            Log.e("AppUpdateManager", "Không thể cài APK: ${e.message}")
        }
    }
}
