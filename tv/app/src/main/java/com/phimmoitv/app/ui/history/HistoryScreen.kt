package com.phimmoitv.app.ui.history

import android.view.KeyEvent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimmoitv.app.data.SourcePolicy
import com.phimmoitv.app.data.MovieItem
import com.phimmoitv.app.data.WatchHistoryManager
import com.phimmoitv.app.data.WatchProgress
import com.phimmoitv.app.ui.components.TvButton
import com.phimmoitv.app.ui.theme.DarkBackground
import com.phimmoitv.app.ui.theme.NetflixRed
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun HistoryScreen(
    watchHistoryManager: WatchHistoryManager,
    onMovieClick: (MovieItem) -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
    onExploreClick: (() -> Unit)? = null,
    focusTrigger: Long = 0L,
    modifier: Modifier = Modifier
) {
    var historyList by remember { mutableStateOf(watchHistoryManager.getAllHistory()) }
    val historyRevision by watchHistoryManager.revision.collectAsState()
    LaunchedEffect(historyRevision) { historyList = watchHistoryManager.getAllHistory() }
    val scope = rememberCoroutineScope()

    // Lưu lại vị trí thẻ đang focus để khi chuyển tab quay lại không bị kẹt
    var lastFocusedSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var targetFocusSlug by remember { mutableStateOf<String?>(null) }

    val clearButtonFocusRequester = remember { FocusRequester() }
    val emptyExploreFocusRequester = remember { FocusRequester() }

    // Luôn tải lại lịch sử mới nhất và phục hồi tiêu điểm khi focusTrigger kích hoạt
    LaunchedEffect(focusTrigger) {
        historyList = watchHistoryManager.getAllHistory()
        if (focusTrigger > 0L) {
            delay(100)
            try {
                if (historyList.isEmpty()) {
                    emptyExploreFocusRequester.requestFocus()
                } else {
                    val candidate = lastFocusedSlug?.takeIf { slug -> historyList.any { it.movieSlug == slug } }
                        ?: historyList.firstOrNull()?.movieSlug
                    if (candidate != null) {
                        targetFocusSlug = candidate
                    }
                }
            } catch (_: Exception) {}
        }
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(horizontal = 28.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. Top Header
        item(key = "history_header") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Phim Đã Xem Gần Đây",
                        color = TextWhite,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = if (historyList.isNotEmpty()) "Tự động lưu lại tập và số phút bạn đang xem dở." else "Chưa có phim nào trong lịch sử.",
                        color = TextMuted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                if (historyList.isNotEmpty()) {
                    TvButton(
                        text = "🗑 Xoá Lịch Sử",
                        focusRequester = clearButtonFocusRequester,
                        onClick = {
                            watchHistoryManager.clear()
                            historyList = emptyList()
                            scope.launch {
                                delay(120)
                                try {
                                    emptyExploreFocusRequester.requestFocus()
                                } catch (_: Exception) {}
                            }
                        },
                        onNavigateLeft = onNavigateLeft,
                        onNavigateDown = {
                            val first = historyList.firstOrNull()?.movieSlug
                            if (first != null) {
                                targetFocusSlug = first
                            }
                        }
                    )
                }
            }
        }

        // 2. Nội dung danh sách / Trạng thái trống
        if (historyList.isEmpty()) {
            item(key = "history_empty_state") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(340.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.History,
                            contentDescription = null,
                            tint = TextMuted.copy(alpha = 0.5f),
                            modifier = Modifier.size(64.dp)
                        )
                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = "Chưa có lịch sử xem phim",
                            color = TextWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Khi bạn xem phim, tiến trình (tập, phút xem) sẽ tự động xuất hiện ở đây.",
                            color = TextMuted,
                            fontSize = 13.sp
                        )
                        Spacer(modifier = Modifier.height(20.dp))
                        TvButton(
                            text = "🎬 Khám Phá Phim Ngay",
                            isPrimary = true,
                            focusRequester = emptyExploreFocusRequester,
                            onClick = { onExploreClick?.invoke() },
                            onNavigateLeft = onNavigateLeft,
                            onNavigateRight = { /* Cạnh phải: giữ nguyên tiêu điểm */ }
                        )
                    }
                }
            }
        } else {
            val chunks = historyList.chunked(4)
            itemsIndexed(chunks, key = { rowIndex, row -> "history_row_${rowIndex}_${row.firstOrNull()?.movieSlug}" }) { rowIndex, rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    rowItems.forEachIndexed { colIndex, item ->
                        val isTarget = targetFocusSlug == item.movieSlug
                        val cardFocusRequester = remember { FocusRequester() }

                        LaunchedEffect(isTarget) {
                            if (isTarget) {
                                delay(100)
                                try {
                                    cardFocusRequester.requestFocus()
                                } catch (_: Exception) {}
                                targetFocusSlug = null
                            }
                        }

                        HistoryCard(
                            item = item,
                            modifier = Modifier
                                .weight(1f)
                                .focusRequester(cardFocusRequester),
                            onClick = {
                                onMovieClick(
                                    MovieItem(
                                        title = item.movieTitle,
                                        slug = item.movieSlug,
                                        posterUrl = item.posterUrl,
                                        bannerUrl = item.bannerUrl
                                    )
                                )
                            },
                            onFocused = { lastFocusedSlug = item.movieSlug },
                            onNavigateLeft = if (colIndex == 0) onNavigateLeft else null,
                            onNavigateRight = if (colIndex == rowItems.lastIndex) { { /* Cạnh phải: giữ nguyên, không nhảy về trước */ } } else null,
                            onNavigateUp = if (rowIndex == 0) {
                                {
                                    try {
                                        clearButtonFocusRequester.requestFocus()
                                    } catch (_: Exception) {}
                                }
                            } else null
                        )
                    }
                    // Điền khoảng trống nếu hàng không đủ 4 thẻ
                    if (rowItems.size < 4) {
                        repeat(4 - rowItems.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryCard(
    item: WatchProgress,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onFocused: (() -> Unit)? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateRight: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val context = LocalContext.current

    LaunchedEffect(isFocused) {
        if (isFocused) {
            onFocused?.invoke()
        }
    }

    val progress = if (item.durationMs > 0) {
        (item.positionMs.toFloat() / item.durationMs.toFloat()).coerceIn(0f, 1f)
    } else 0f

    val posStr = formatTime(item.positionMs)
    val durStr = formatTime(item.durationMs)

    Column(
        modifier = modifier
            .scale(if (isFocused) 1.05f else 1.0f)
            .zIndex(if (isFocused) 20f else 1f)
            .shadow(if (isFocused) 14.dp else 2.dp, RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF1E1E1E))
            .border(
                border = if (isFocused) BorderStroke(2.5.dp, Color.White) else BorderStroke(0.5.dp, Color.White.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(8.dp)
            )
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            if (onNavigateLeft != null) {
                                onNavigateLeft()
                                true
                            } else false
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            if (onNavigateRight != null) {
                                onNavigateRight()
                                true
                            } else false
                        }
                        KeyEvent.KEYCODE_DPAD_UP -> {
                            if (onNavigateUp != null) {
                                onNavigateUp()
                                true
                            } else false
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (onNavigateDown != null) {
                                onNavigateDown()
                                true
                            } else false
                        }
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER,
                        KeyEvent.KEYCODE_NUMPAD_ENTER,
                        KeyEvent.KEYCODE_BUTTON_A -> {
                            onClick()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .focusable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
    ) {
        // Thumbnail Box
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(130.dp)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(if (SourcePolicy.isCurrentSlug(item.movieSlug)) SourcePolicy.imageUrl(item.bannerUrl?.ifEmpty { null } ?: item.posterUrl) else "")
                    .crossfade(true)
                    .build(),
                contentDescription = item.movieTitle,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Play overlay when focused
            if (isFocused) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.45f)),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .background(NetflixRed, RoundedCornerShape(22.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }

            // Episode Badge
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .background(Color.Black.copy(alpha = 0.8f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 7.dp, vertical = 3.dp)
            ) {
                Text(
                    text = item.episodeName,
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Red Progress Bar at bottom of thumbnail
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(5.dp)
                    .background(Color.White.copy(alpha = 0.25f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(fraction = progress)
                        .background(NetflixRed)
                )
            }
        }

        // Details below thumbnail
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (isFocused) Color(0xFF2C2C2C) else Color(0xFF1E1E1E))
                .padding(10.dp)
        ) {
            Text(
                text = item.movieTitle,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.serverName,
                    color = TextMuted,
                    fontSize = 11.sp
                )
                Text(
                    text = "$posStr / $durStr",
                    color = if (isFocused) NetflixRed else TextMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

private fun formatTime(ms: Long): String {
    val totalSec = ms / 1000
    val hours = totalSec / 3600
    val minutes = (totalSec % 3600) / 60
    val seconds = totalSec % 60
    return if (hours > 0) {
        String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)
    }
}
