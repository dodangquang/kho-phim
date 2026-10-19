package com.phimmoitv.app.ui.settings

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoitv.app.BuildConfig
import com.phimmoitv.app.data.AppUpdateManager
import com.phimmoitv.app.data.UpdateInfo
import com.phimmoitv.app.ui.components.TvButton
import com.phimmoitv.app.ui.theme.DarkBackground
import com.phimmoitv.app.ui.theme.DarkCard
import com.phimmoitv.app.ui.theme.NetflixRed
import com.phimmoitv.app.ui.theme.OrangePrimary
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite
import kotlinx.coroutines.launch

import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import kotlinx.coroutines.delay

@Composable
fun SettingsScreen(
    appUpdateManager: AppUpdateManager? = null,
    onNavigateLeft: (() -> Unit)? = null,
    focusTrigger: Long = 0L,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var isCheckingUpdate by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
    var updateCheckMessage by remember { mutableStateOf<String?>(null) }
    var downloadProgress by remember { mutableStateOf<Float?>(null) }
    var updateErrorMessage by remember { mutableStateOf<String?>(null) }

    val firstButtonFocusRequester = remember { FocusRequester() }

    LaunchedEffect(focusTrigger) {
        if (focusTrigger > 0L) {
            delay(100)
            try {
                firstButtonFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }


    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { SyncAccountCard(onNavigateLeft = onNavigateLeft) }
        // CLOUD AUTO-UPDATE SECTION
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkCard, RoundedCornerShape(10.dp))
                    .padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "CẬP NHẬT ỨNG DỤNG (CLOUD AUTO-UPDATE):",
                            color = TextMuted,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Phiên bản hiện tại: v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})",
                            color = TextWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    if (downloadProgress == null) {
                        TvButton(
                            text = if (isCheckingUpdate) "Đang Kiểm Tra..." else "🚀 Kiểm Tra Cập Nhật",
                            isPrimary = true,
                            focusRequester = firstButtonFocusRequester,
                            onNavigateLeft = onNavigateLeft,
                            onClick = {
                                if (appUpdateManager != null && !isCheckingUpdate) {
                                    scope.launch {
                                        isCheckingUpdate = true
                                        updateCheckMessage = "Đang kiểm tra máy chủ cloud..."
                                        updateErrorMessage = null
                                        val info = appUpdateManager.checkUpdate(BuildConfig.VERSION_CODE)
                                        if (info != null) {
                                            updateInfo = info
                                            updateCheckMessage = "Đã tìm thấy bản mới: v${info.versionName}!"
                                        } else {
                                            updateInfo = null
                                            updateCheckMessage = "Bạn đang dùng phiên bản mới nhất! (v${BuildConfig.VERSION_NAME})"
                                        }
                                        isCheckingUpdate = false
                                    }
                                }
                            }
                        )
                    }
                }

                updateCheckMessage?.let { msg ->
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = msg,
                        color = if (updateInfo != null) Color(0xFF34D399) else OrangePrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Khi phát hiện có bản cập nhật
                updateInfo?.let { info ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF262626), RoundedCornerShape(8.dp))
                            .border(1.dp, NetflixRed.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                            .padding(14.dp)
                    ) {
                        Column {
                            Text(
                                text = "Bản Cập Nhật Mới: v${info.versionName} (Build ${info.versionCode})",
                                color = NetflixRed,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = info.changelog,
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 13.sp,
                                lineHeight = 18.sp
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            if (downloadProgress != null) {
                                val p = downloadProgress ?: 0f
                                Column {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(text = "Đang tải bản cập nhật...", color = TextWhite, fontSize = 12.sp)
                                        Text(text = "${(p * 100).toInt()}%", color = NetflixRed, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    LinearProgressIndicator(
                                        progress = { p },
                                        modifier = Modifier.fillMaxWidth().height(6.dp),
                                        color = NetflixRed,
                                        trackColor = Color.White.copy(alpha = 0.2f)
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = "Sau khi tải xong, màn hình cài đặt sẽ tự động mở để nâng cấp.",
                                        color = TextMuted,
                                        fontSize = 11.sp
                                    )
                                }
                            } else {
                                TvButton(
                                    text = "⬇ Tải & Cài Đặt Trực Tiếp Ngay",
                                    isPrimary = true,
                                    onClick = {
                                        val activity = context as? Activity
                                        if (activity != null && appUpdateManager != null) {
                                            scope.launch {
                                                downloadProgress = 0f
                                                appUpdateManager.downloadAndInstallApk(
                                                    activity = activity,
                                                    apkUrl = info.apkUrl,
                                                    onProgress = { p -> downloadProgress = p },
                                                    onError = { err ->
                                                        updateErrorMessage = err
                                                        downloadProgress = null
                                                    }
                                                )
                                            }
                                        }
                                    }
                                )
                            }

                            updateErrorMessage?.let { err ->
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(text = err, color = Color.Red, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }

        item {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text("NGUỒN PHIM: TỦ PHIM", color = TextWhite, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                Text("Danh mục và máy chủ phát được lấy từ Tủ Phim. Chọn Vietsub hoặc âm thanh tại danh sách máy chủ của từng phim.", color = TextMuted, fontSize = 13.sp)
            }
        }
    }
}
