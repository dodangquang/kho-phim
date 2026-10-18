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
import com.phimmoi.mobile.data.DomainManager
import com.phimmoi.mobile.data.UpdateInfo
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    domainManager: DomainManager,
    appUpdateManager: AppUpdateManager
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var currentDomain by remember { mutableStateOf(domainManager.getActiveDomain()) }
    var statusMessage by remember { mutableStateOf("Tên miền đang hoạt động bình thường") }
    var customDomainInput by remember { mutableStateOf("") }

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

        // 2. Active Domain Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = NetflixCard),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "TÊN MIỀN KẾT NỐI",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = currentDomain,
                        color = NetflixRed,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Trạng thái: $statusMessage",
                        color = Color(0xFF46D369),
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                scope.launch {
                                    statusMessage = "Đang kiểm tra server..."
                                    val working = domainManager.resolveWorkingDomain()
                                    if (working != null) currentDomain = working
                                    statusMessage = working?.let { "Đã kết nối: $it" } ?: "Không kết nối được tên miền nào. Hãy kiểm tra mạng hoặc nhập tên miền khác."
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF333333)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("Kiểm tra domain", fontSize = 12.sp)
                        }


                    }
                }
            }
        }

        // 3. Fallback Domains List
        item {
            Text(
                text = "Tên Miền Dự Phòng Sẵn Có",
                color = TextWhite,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }

        items(domainManager.getAllFallbackDomains()) { domain ->
            val isCurrent = domain == currentDomain
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isCurrent) NetflixRed.copy(alpha = 0.15f) else NetflixCard)
                    .border(
                        1.dp,
                        if (isCurrent) NetflixRed else Color.Transparent,
                        RoundedCornerShape(8.dp)
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = domain,
                    color = if (isCurrent) NetflixRed else TextWhite,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )

                if (isCurrent) {
                    Text(text = "✓ Đang dùng", color = NetflixRed, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                } else {
                    TextButton(onClick = {
                        domainManager.setActiveDomain(domain)
                        currentDomain = domain
                        statusMessage = "Đã chuyển sang $domain"
                    }) {
                        Text("Kích hoạt", color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        }

        // 4. Custom domain input
        item {
            Column {
                Text(
                    text = "Nhập Tên Miền Thủ Công",
                    color = TextWhite,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = customDomainInput,
                        onValueChange = { customDomainInput = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("https://domain-moi.com", color = TextMuted, fontSize = 12.sp) },
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = NetflixCard,
                            unfocusedContainerColor = NetflixCard,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite,
                            focusedBorderColor = NetflixRed,
                            unfocusedBorderColor = Color.Transparent
                        )
                    )
                    Button(
                        onClick = {
                            if (customDomainInput.isNotBlank()) {
                                domainManager.setActiveDomain(customDomainInput)
                                currentDomain = domainManager.getActiveDomain()
                                statusMessage = "Đã lưu: $currentDomain"
                                customDomainInput = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Lưu")
                    }
                }
            }
        }
    }
}
