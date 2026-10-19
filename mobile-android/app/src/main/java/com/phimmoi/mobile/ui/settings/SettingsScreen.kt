package com.phimmoi.mobile.ui.settings

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoi.mobile.BuildConfig
import com.phimmoi.mobile.data.AppUpdateManager
import com.phimmoi.mobile.data.UpdateInfo
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    appUpdateManager: AppUpdateManager
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var isCheckingUpdate by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
    var updateMsg by remember { mutableStateOf<String?>(null) }
    var downloadProgress by remember { mutableStateOf<Float?>(null) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { SyncAccountCard() }
        item {
            Text(
                text = "Cài Đặt Hệ Thống",
                color = TextWhite,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // 1. App Update Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = NetflixCard),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "PHIÊN BẢN ỨNG DỤNG",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})",
                        color = TextWhite,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    if (downloadProgress == null) {
                        Button(
                            onClick = {
                                if (!isCheckingUpdate) {
                                    scope.launch {
                                        isCheckingUpdate = true
                                        updateMsg = "Đang kiểm tra cập nhật..."
                                        val info = appUpdateManager.checkUpdate(BuildConfig.VERSION_CODE)
                                        if (info != null) {
                                            updateInfo = info
                                            updateMsg = "Có bản cập nhật mới v${info.versionName}!"
                                        } else {
                                            updateInfo = null
                                            updateMsg = "Bạn đang sử dụng phiên bản mới nhất."
                                        }
                                        isCheckingUpdate = false
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(if (isCheckingUpdate) "Đang kiểm tra..." else "Kiểm tra cập nhật")
                        }
                    }

                    updateMsg?.let { msg ->
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(text = msg, color = Color(0xFF46D369), fontSize = 12.sp)
                    }

                    updateInfo?.let { info ->
                        Spacer(modifier = Modifier.height(8.dp))
                        if (downloadProgress != null) {
                            val p = downloadProgress ?: 0f
                            LinearProgressIndicator(
                                progress = { p },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(4.dp),
                                color = NetflixRed
                            )
                        } else {
                            Button(
                                onClick = {
                                    val act = context as? Activity
                                    if (act != null) {
                                        scope.launch {
                                            downloadProgress = 0f
                                            appUpdateManager.downloadAndInstallApk(
                                                activity = act,
                                                apkUrl = info.apkUrl,
                                                onProgress = { downloadProgress = it },
                                                onError = {
                                                    updateMsg = "Lỗi: $it"
                                                    downloadProgress = null
                                                }
                                            )
                                        }
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF34D399)),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("Tải & Cài Đặt Ngay", color = Color.Black, fontWeight = FontWeight.Bold)
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
