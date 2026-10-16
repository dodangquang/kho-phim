package com.phimmoitv.app.data

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.phimmoitv.app.network.NetworkModule
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

    // Cloud endpoint mặc định kiểm tra cập nhật (GitHub raw + GitHub Pages fallback)
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
                client.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val jsonStr = resp.body?.string()
                        if (!jsonStr.isNullOrBlank()) {
                            val obj = JSONObject(jsonStr)
                            val remoteVersionCode = obj.optInt("versionCode", 0)
                            val remoteVersionName = obj.optString("versionName", "")
                            val apkUrl = obj.optString("apkUrlTv", "").ifEmpty { obj.optString("apkUrl", "") }
                            val changelog = obj.optString("changelog", "Bản cập nhật mới với nhiều tính năng và cải tiến.")

                            if (remoteVersionCode > currentVersionCode && apkUrl.isNotEmpty()) {
                                return@withContext UpdateInfo(
                                    versionCode = remoteVersionCode,
                                    versionName = remoteVersionName,
                                    apkUrl = apkUrl,
                                    changelog = changelog
                                )
                            } else if (remoteVersionCode > 0) {
                                return@withContext null
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w("AppUpdateManager", "Không thể kiểm tra cập nhật cloud từ $url: ${e.message}")
            }
        }
        return@withContext null
    }

    fun getCachedApkFile(context: Context, versionCode: Int? = null): File {
        return if (versionCode != null) {
            File(context.cacheDir, "update_v$versionCode.apk")
        } else {
            File(context.cacheDir, "update.apk")
        }
    }

    fun hasInstallPermission(activity: Activity): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun installApk(activity: Activity, apkFile: File = getCachedApkFile(activity)): Boolean {
        try {
            if (!apkFile.exists() || apkFile.length() == 0L) {
                return false
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.packageManager.canRequestPackageInstalls()) {
                    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${activity.packageName}")
                    }
                    activity.startActivity(intent)
                    return false
                }
            }

            val contentUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.provider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            activity.startActivity(installIntent)
            return true
        } catch (e: Exception) {
            Log.e("AppUpdateManager", "Không thể mở file cài đặt APK: ${e.message}")
            return false
        }
    }

    suspend fun downloadAndInstallApk(
        activity: Activity,
        apkUrl: String,
        versionCode: Int? = null,
        onProgress: (Float) -> Unit,
        onSuccess: (installed: Boolean) -> Unit = {},
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder().url(apkUrl).build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    withContext(Dispatchers.Main) { onError("Tải bản cập nhật thất bại: HTTP ${resp.code}") }
                    return@withContext
                }

                val body = resp.body ?: run {
                    withContext(Dispatchers.Main) { onError("Không có dữ liệu file APK") }
                    return@withContext
                }

                val totalBytes = body.contentLength()
                val updateFile = getCachedApkFile(activity, versionCode)
                if (updateFile.exists()) updateFile.delete()

                body.byteStream().use { input ->
                    FileOutputStream(updateFile).use { output ->
                        val buffer = ByteArray(32 * 1024)
                        var bytesRead: Int
                        var downloaded: Long = 0
                        var lastReportTime = 0L

                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            downloaded += bytesRead
                            val now = System.currentTimeMillis()
                            if (totalBytes > 0 && (now - lastReportTime > 100 || downloaded == totalBytes)) {
                                lastReportTime = now
                                val progress = downloaded.toFloat() / totalBytes.toFloat()
                                withContext(Dispatchers.Main) { onProgress(progress) }
                            }
                        }
                        output.flush()
                    }
                }

                withContext(Dispatchers.Main) {
                    val launched = installApk(activity, updateFile)
                    onSuccess(launched)
                }
            }
        } catch (e: Exception) {
            Log.e("AppUpdateManager", "Lỗi tải bản cập nhật: ${e.message}")
            withContext(Dispatchers.Main) { onError("Lỗi tải bản cập nhật: ${e.localizedMessage ?: "Không xác định"}") }
        }
    }
}
