package com.phimmoitv.app.ui.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import kotlinx.coroutines.delay
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimmoitv.app.data.EpisodeSource
import com.phimmoitv.app.data.MovieDetail
import com.phimmoitv.app.data.MovieItem
import com.phimmoitv.app.data.PhimMoiRepository
import com.phimmoitv.app.data.WatchHistoryManager
import com.phimmoitv.app.ui.components.TvButton
import com.phimmoitv.app.ui.theme.DarkBackground
import com.phimmoitv.app.ui.theme.DarkCard
import com.phimmoitv.app.ui.theme.OrangePrimary
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite

@Composable
fun DetailScreen(
    movie: MovieItem,
    repository: PhimMoiRepository,
    watchHistoryManager: WatchHistoryManager? = null,
    onPlayEpisode: (EpisodeSource, List<EpisodeSource>, Long) -> Unit,
    onBackPress: () -> Unit,
    focusTrigger: Long = 0L,
    modifier: Modifier = Modifier
) {
    var isLoading by remember { mutableStateOf(true) }
    var detail by remember { mutableStateOf<MovieDetail?>(null) }
    var selectedServer by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(movie.slug) {
        isLoading = true
        try {
            val d = repository.getMovieDetail(movie.slug)
            detail = d
            val servers = d.episodes.map { it.serverName }.distinct()
            selectedServer = servers.firstOrNull()
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    if (isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(DarkBackground),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = OrangePrimary)
        }
        return
    }

    val currentDetail = detail ?: return

    val availableServers = currentDetail.episodes.map { it.serverName }.distinct()
    val activeServer = selectedServer ?: availableServers.firstOrNull() ?: ""
    val episodesForServer = currentDetail.episodes.filter { it.serverName == activeServer }

    val playFocusRequester = remember { FocusRequester() }

    LaunchedEffect(currentDetail) {
        delay(150)
        try {
            playFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    // Tự động phục hồi focus nếu người dùng bấm phím mà bị mất tiêu điểm
    LaunchedEffect(focusTrigger) {
        if (focusTrigger > 0L) {
            delay(50)
            try {
                playFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(24.dp)
    ) {
        // Top Back Button
        item {
            TvButton(
                text = "← Quay Lại",
                onClick = onBackPress,
                onNavigateLeft = { /* Giữ tiêu điểm ở nút Quay lại */ },
                onNavigateUp = { /* Giữ tiêu điểm ở nút Quay lại */ },
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }

        // Header Info Section
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                // Movie Poster
                val context = LocalContext.current
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(currentDetail.posterUrl.ifEmpty { currentDetail.backdropUrl })
                        .crossfade(true)
                        .build(),
                    contentDescription = currentDetail.title,
                    modifier = Modifier
                        .width(180.dp)
                        .height(260.dp)
                        .clip(RoundedCornerShape(10.dp)),
                    contentScale = ContentScale.Crop
                )

                // Info text & action buttons
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = currentDetail.title,
                        color = TextWhite,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )

                    if (currentDetail.overview.isNotEmpty()) {
                        Text(
                            text = currentDetail.overview,
                            color = TextMuted,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                            maxLines = 4
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    val savedProgress = watchHistoryManager?.getProgress(movie.slug)
                    val firstEp = episodesForServer.firstOrNull() ?: currentDetail.episodes.firstOrNull()

                    if (savedProgress != null) {
                        val resumeEp = currentDetail.episodes.find {
                            it.episodeSlug == savedProgress.episodeSlug || it.streamUrl == savedProgress.streamUrl
                        } ?: firstEp

                        val posMin = (savedProgress.positionMs / 60000).coerceAtLeast(0)
                        val durMin = (savedProgress.durationMs / 60000).coerceAtLeast(0)

                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            resumeEp?.let { ep ->
                                TvButton(
                                    text = "▶ Tiếp Tục Xem: ${savedProgress.episodeName} (${posMin}p / ${durMin}p)",
                                    isPrimary = true,
                                    modifier = Modifier.focusRequester(playFocusRequester),
                                    onClick = {
                                        onPlayEpisode(ep, currentDetail.episodes, savedProgress.positionMs)
                                    }
                                )
                            }

                            firstEp?.let { ep ->
                                TvButton(
                                    text = "Xem Từ Đầu",
                                    onClick = {
                                        onPlayEpisode(ep, currentDetail.episodes, 0L)
                                    }
                                )
                            }
                        }
                    } else {
                        firstEp?.let { ep ->
                            TvButton(
                                text = "▶ Xem Phim (${ep.episodeName})",
                                isPrimary = true,
                                modifier = Modifier.focusRequester(playFocusRequester),
                                onClick = {
                                    onPlayEpisode(ep, currentDetail.episodes, 0L)
                                }
                            )
                        }
                    }
                }
            }
        }

        // Server selection row
        if (availableServers.size > 1) {
            item {
                Column(modifier = Modifier.padding(bottom = 16.dp)) {
                    Text(
                        text = "Chọn Nguồn Phát (Server):",
                        color = TextWhite,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        itemsIndexed(availableServers) { sIdx, sName ->
                            val isSelected = sName == activeServer
                            TvButton(
                                text = sName,
                                isPrimary = isSelected,
                                onNavigateLeft = if (sIdx == 0) { { /* Cạnh trái: giữ tiêu điểm */ } } else null,
                                onNavigateRight = if (sIdx == availableServers.lastIndex) { { /* Cạnh phải: giữ tiêu điểm */ } } else null,
                                onClick = { selectedServer = sName }
                            )
                        }
                    }
                }
            }
        }

        // Episodes Section
        item {
            Text(
                text = if (episodesForServer.isNotEmpty()) "Danh Sách Tập ($activeServer):" else "Danh Sách Tập:",
                color = TextWhite,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(bottom = 10.dp)
            )
        }

        item {
            if (episodesForServer.isEmpty()) {
                Text(
                    text = "Đang cập nhật nguồn phát hoặc phim đang chiếu...",
                    color = TextMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(vertical = 12.dp)
                )
            } else {
                val totalEps = episodesForServer.size
                val episodeFocusRequesters = remember(episodesForServer) {
                    List(totalEps) { FocusRequester() }
                }
                val epChunks = episodesForServer.chunked(8)

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    epChunks.forEachIndexed { rowIndex, rowEps ->
                        val nextRowSize = epChunks.getOrNull(rowIndex + 1)?.size ?: 0
                        val isLastRow = rowIndex == epChunks.lastIndex

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            rowEps.forEachIndexed { colIndex, ep ->
                                val flatIndex = rowIndex * 8 + colIndex
                                val isFirstEpOverall = flatIndex == 0
                                val isLastEpOverall = flatIndex == totalEps - 1
                                val isLastInRow = colIndex == rowEps.lastIndex
                                val isFirstInRow = colIndex == 0

                                val onRightAction: (() -> Unit)? = when {
                                    isLastEpOverall -> {
                                        { /* Đã ở tập cuối cùng của cả phim: đứng ở cuối luôn, không mất focus */ }
                                    }
                                    isLastInRow && flatIndex + 1 < totalEps -> {
                                        {
                                            try {
                                                episodeFocusRequesters[flatIndex + 1].requestFocus()
                                            } catch (_: Exception) {}
                                        }
                                    }
                                    else -> null
                                }

                                val onLeftAction: (() -> Unit)? = when {
                                    isFirstEpOverall -> {
                                        { /* Tập đầu tiên: giữ tiêu điểm */ }
                                    }
                                    isFirstInRow && flatIndex > 0 -> {
                                        {
                                            try {
                                                episodeFocusRequesters[flatIndex - 1].requestFocus()
                                            } catch (_: Exception) {}
                                        }
                                    }
                                    else -> null
                                }

                                val onDownAction: (() -> Unit)? = when {
                                    isLastRow -> {
                                        { /* Hàng cuối cùng: giữ nguyên tiêu điểm, đứng ở cuối luôn */ }
                                    }
                                    colIndex >= nextRowSize && nextRowSize > 0 -> {
                                        {
                                            // Vị trí bên dưới bị khuyết, chuyển focus vào tập cuối cùng của hàng dưới
                                            val targetIdx = (rowIndex + 1) * 8 + (nextRowSize - 1)
                                            if (targetIdx in 0 until totalEps) {
                                                try {
                                                    episodeFocusRequesters[targetIdx].requestFocus()
                                                } catch (_: Exception) {}
                                            }
                                        }
                                    }
                                    else -> null
                                }

                                TvButton(
                                    text = ep.episodeName,
                                    focusRequester = episodeFocusRequesters.getOrNull(flatIndex),
                                    onNavigateRight = onRightAction,
                                    onNavigateLeft = onLeftAction,
                                    onNavigateDown = onDownAction,
                                    onClick = {
                                        onPlayEpisode(ep, currentDetail.episodes, 0L)
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(48.dp))
        }
    }
}
