package com.phimmoi.mobile.ui.settings

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.phimmoi.mobile.data.CloudHistory


@Composable
fun SyncAccountCard() {
    val context = LocalContext.current
    val manager = remember { CloudHistory.get(context) }
    if (!manager.enabled) return
    val state by manager.account.collectAsState()
    var openWhenReady by remember { mutableStateOf(false) }
    var browserMessage by remember { mutableStateOf<String?>(null) }
    fun openBrowser(url: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            .onFailure { browserMessage = "Hãy quét mã QR bằng điện thoại để tiếp tục đăng nhập." }
    }
    LaunchedEffect(state.qrUrl) {
        if (openWhenReady && state.qrUrl != null) { openWhenReady = false; openBrowser(state.qrUrl!!) }
    }
    Column(Modifier.fillMaxWidth().background(Color(0xFF202024)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("TÀI KHOẢN & LỊCH SỬ", color = Color.White, fontSize = 15.sp)
        Text(state.name ?: "Dùng cùng Google trên web và APK để tiếp tục xem ở thiết bị khác.", color = Color.White, fontSize = 13.sp)
        Text(browserMessage ?: state.message, color = Color(0xFFBDBDC6), fontSize = 12.sp)
        if (state.name != null) {
            SyncMobileButton("Đồng bộ ngay") { manager.syncNow() }
            SyncMobileButton("Đăng xuất") { manager.signOut() }
        } else if (state.qrUrl != null) {
            val image = remember(state.qrUrl) {
                val matrix = QRCodeWriter().encode(state.qrUrl, BarcodeFormat.QR_CODE, 256, 256)
                Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888).apply {
                    val colors = IntArray(256 * 256) { index -> if (matrix[index % 256, index / 256]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
                    setPixels(colors, 0, 256, 0, 0, 256, 256)
                }.asImageBitmap()
            }
            Image(image, "Mã QR đăng nhập Kho Phim", Modifier.size(216.dp).background(Color.White))
            Text("Chỉ xác nhận mã trên thiết bị của bạn. Mã dùng một lần, hết hạn sau 5 phút.", color = Color(0xFFBDBDC6), fontSize = 12.sp)
            SyncMobileButton("Mở đăng nhập bằng trình duyệt") { openBrowser(state.qrUrl!!) }
            SyncMobileButton("Hủy liên kết") { manager.cancelPairing() }
        } else {
            SyncMobileButton("Đăng nhập Google") { openWhenReady = true; browserMessage = null; manager.signIn() }
        }
    }
}

@Composable
private fun SyncMobileButton(label: String, action: () -> Unit) {
    Button(onClick = action) { Text(label) }
}
