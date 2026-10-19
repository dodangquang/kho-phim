package com.phimmoi.mobile.ui.history

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimmoi.mobile.data.MovieItem
import com.phimmoi.mobile.data.WatchHistoryManager
import com.phimmoi.mobile.data.WatchProgress
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite

@Composable
fun HistoryScreen(
    watchHistoryManager: WatchHistoryManager,
    onMovieClick: (MovieItem) -> Unit,
    onExploreClick: () -> Unit
) {
    val context = LocalContext.current
    var historyList by remember { mutableStateOf(watchHistoryManager.getAllHistory()) }
    val historyRevision by watchHistoryManager.revision.collectAsState()
    LaunchedEffect(historyRevision) { historyList = watchHistoryManager.getAllHistory() }
    var showClearConfirm by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
            .padding(horizontal = 16.dp)
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Lịch Sử Xem Phim",
                color = TextWhite,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )

            if (historyList.isNotEmpty()) {
                TextButton(onClick = { showClearConfirm = true }) {
                    Text("Xóa tất cả", color = NetflixRed, fontSize = 13.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (historyList.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Bạn chưa có lịch sử xem phim",
                        color = TextMuted,
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = onExploreClick,
                        colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Khám Phá Phim Ngay", color = Color.White)
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                items(historyList, key = { it.movieSlug }) { item ->
                    HistoryItemCard(
                        item = item,
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
                        onDelete = {
                            watchHistoryManager.remove(item.movieSlug)
                            historyList = watchHistoryManager.getAllHistory()
                        }
                    )
                }
            }
        }
    }

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            containerColor = Color(0xFF222222),
            title = { Text("Xác nhận xóa", color = Color.White, fontWeight = FontWeight.Bold) },
            text = { Text("Bạn có chắc chắn muốn xóa toàn bộ lịch sử xem phim?", color = TextMuted) },
            confirmButton = {
                TextButton(
                    onClick = {
                        watchHistoryManager.clear()
                        historyList = emptyList()
                        showClearConfirm = false
                    }
                ) {
                    Text("Xóa hết", color = NetflixRed, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearConfirm = false }) {
                    Text("Hủy", color = Color.White)
                }
            }
        )
    }
}

@Composable
fun HistoryItemCard(
    item: WatchProgress,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val context = LocalContext.current
    val image = item.bannerUrl?.takeIf { it.isNotBlank() } ?: item.posterUrl

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(NetflixCard)
            .clickable { onClick() }
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(110.dp)
                .height(68.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color.Black)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(image)
                    .crossfade(true)
                    .build(),
                contentDescription = item.movieTitle,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Play icon
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
            }

            // Progress bar
            val ratio = if (item.durationMs > 0) {
                (item.positionMs.toFloat() / item.durationMs.toFloat()).coerceIn(0f, 1f)
            } else 0f

            LinearProgressIndicator(
                progress = { ratio },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .align(Alignment.BottomCenter),
                color = NetflixRed,
                trackColor = Color.White.copy(alpha = 0.3f)
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.movieTitle,
                color = TextWhite,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "${item.serverName} • ${item.episodeName}",
                color = NetflixRed,
                fontSize = 12.sp,
                maxLines = 1
            )

            Spacer(modifier = Modifier.height(4.dp))

            val currentMin = item.positionMs / 60000
            val totalMin = item.durationMs / 60000
            Text(
                text = "Đã xem $currentMin/$totalMin phút",
                color = TextMuted,
                fontSize = 11.sp
            )
        }

        IconButton(onClick = onDelete) {
            Icon(
                imageVector = Icons.Default.Delete,
                contentDescription = "Delete",
                tint = TextMuted.copy(alpha = 0.6f),
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
