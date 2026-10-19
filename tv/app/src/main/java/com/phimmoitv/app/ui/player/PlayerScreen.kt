package com.phimmoitv.app.ui.player

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.phimmoitv.app.data.PlaybackSupport
import com.phimmoitv.app.data.SourcePolicy
import com.phimmoitv.app.data.EpisodeSource
import com.phimmoitv.app.data.WatchHistoryManager
import com.phimmoitv.app.data.WatchProgress
import com.phimmoitv.app.ui.components.TvButton
import com.phimmoitv.app.ui.theme.OrangePrimary
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite
import kotlinx.coroutines.delay
import java.util.Locale

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    movieSlug: String = "",
    movieTitle: String,
    posterUrl: String = "",
    bannerUrl: String? = null,
    initialEpisode: EpisodeSource,
    allEpisodes: List<EpisodeSource>,
    watchHistoryManager: WatchHistoryManager? = null,
    initialPositionMs: Long = 0L,
    onBackPress: () -> Unit
) {
    val context = LocalContext.current
    val playbackHistoryManager = remember(movieSlug) { watchHistoryManager?.forPlayback() }
    val playbackOwner = remember(movieSlug) { watchHistoryManager?.ownerKey() ?: "guest" }
    val playbackAccount by com.phimmoitv.app.data.CloudHistory.get(context).account.collectAsState()
    LaunchedEffect(playbackAccount.uid) {
        if ((playbackAccount.uid ?: "guest") != playbackOwner) {
            android.widget.Toast.makeText(context, "Tài khoản đã thay đổi. Mở lại phim để tiếp tục xem.", android.widget.Toast.LENGTH_SHORT).show()
            onBackPress()
        }
    }
    var currentEpisode by remember { mutableStateOf(initialEpisode) }
    var isPlaying by remember { mutableStateOf(true) }
    var isBuffering by remember { mutableStateOf(true) }
    var currentPos by remember { mutableStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var episodeStartPosition by remember { mutableStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var episodePlayWhenReady by remember { mutableStateOf(true) }
    var totalDuration by remember { mutableStateOf(0L) }
    var showControls by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var retryAttempt by remember { mutableStateOf(0) }

    BackHandler {
        onBackPress()
    }

    val focusRequester = remember { FocusRequester() }

    // TỐI ƯU RAM CHO ANDROID TV: Giới hạn buffer HLS thay vì buffer 50MB-100MB mặc định
    val exoPlayer = remember {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                15_000, // minBufferMs: 15s (đủ mượt mà không chiếm RAM)
                30_000, // maxBufferMs: 30s
                1_500,  // bufferForPlaybackMs: 1.5s
                2_500   // bufferForPlaybackAfterRebufferMs: 2.5s
            )
            .setTargetBufferBytes(15 * 1024 * 1024) // Giới hạn tối đa 15MB RAM buffer
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
            .build().apply {
                trackSelectionParameters = trackSelectionParameters.buildUpon().setPreferredTextLanguage("vi").build()
                playWhenReady = true
            }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                isBuffering = state == Player.STATE_BUFFERING
                if (state == Player.STATE_READY) {
                    totalDuration = exoPlayer.duration.coerceAtLeast(0L)
                    errorMessage = null
                }
            }

            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlayerError(error: PlaybackException) {
                isBuffering = false
                errorMessage = "Lỗi phát video: ${error.localizedMessage}"
            }
        }
        exoPlayer.addListener(listener)

        onDispose {
            // Lưu lại tiến trình ngay khi đóng player
            val finalPos = exoPlayer.currentPosition
            val finalDur = exoPlayer.duration
            if (watchHistoryManager != null && movieSlug.isNotEmpty() && finalPos > 2000L && finalDur > 0L) {
                playbackHistoryManager?.saveProgress(
                    WatchProgress(
                        movieSlug = movieSlug,
                        movieTitle = movieTitle,
                        posterUrl = posterUrl,
                        bannerUrl = bannerUrl,
                        episodeSlug = currentEpisode.episodeSlug,
                        episodeName = currentEpisode.episodeName,
                        serverName = currentEpisode.serverName,
                        streamUrl = currentEpisode.streamUrl,
                        positionMs = finalPos,
                        durationMs = finalDur
                    )
                )
            }
            exoPlayer.removeListener(listener)
            exoPlayer.stop()
            exoPlayer.clearMediaItems()
            exoPlayer.release() // Giải phóng RAM và GPU video decoders ngay lập tức
        }
    }

    fun saveCurrentProgress() {
        val position = exoPlayer.currentPosition.coerceAtLeast(0L)
        val duration = exoPlayer.duration
        if (watchHistoryManager != null && movieSlug.isNotEmpty() && position > 2000L && duration > 0L) {
            playbackHistoryManager?.saveProgress(WatchProgress(
                movieSlug = movieSlug, movieTitle = movieTitle, posterUrl = posterUrl, bannerUrl = bannerUrl,
                episodeSlug = currentEpisode.episodeSlug, episodeName = currentEpisode.episodeName,
                serverName = currentEpisode.serverName, streamUrl = currentEpisode.streamUrl,
                positionMs = position, durationMs = duration
            ))
        }
    }

    fun switchEpisode(episode: EpisodeSource) {
        if (episode.id == currentEpisode.id) return
        saveCurrentProgress()
        val position = if (episode.episodeSlug == currentEpisode.episodeSlug) exoPlayer.currentPosition.coerceAtLeast(0L) else 0L
        episodePlayWhenReady = if (episode.episodeSlug == currentEpisode.episodeSlug) exoPlayer.playWhenReady else true
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        episodeStartPosition = position
        currentPos = position
        totalDuration = 0L
        isBuffering = true
        currentEpisode = episode
    }

    LaunchedEffect(currentEpisode, retryAttempt) {
        errorMessage = null
        val streamUrl = currentEpisode.streamUrl.takeIf(SourcePolicy::isGatewayStream)
        if (streamUrl == null) {
            isBuffering = false
            errorMessage = "Nguồn này không có video trực tiếp hợp lệ. Hãy chọn nguồn khác."
        } else {
            exoPlayer.setMediaItem(MediaItem.fromUri(streamUrl), episodeStartPosition)
            exoPlayer.prepare()
            exoPlayer.playWhenReady = episodePlayWhenReady
        }
    }

    // Định kỳ lưu tiến trình mỗi 2.5s khi đang phát
    LaunchedEffect(Unit) {
        var saveTicks = 0
        while (true) {
            run {
                currentPos = exoPlayer.currentPosition.coerceAtLeast(0L)
                totalDuration = exoPlayer.duration.coerceAtLeast(0L)
                if (++saveTicks >= 5 && exoPlayer.isPlaying && watchHistoryManager != null && movieSlug.isNotEmpty() && currentPos > 2000L && totalDuration > 0L) {
                    saveTicks = 0
                    playbackHistoryManager?.saveProgress(
                        WatchProgress(
                            movieSlug = movieSlug,
                            movieTitle = movieTitle,
                            posterUrl = posterUrl,
                            bannerUrl = bannerUrl,
                            episodeSlug = currentEpisode.episodeSlug,
                            episodeName = currentEpisode.episodeName,
                            serverName = currentEpisode.serverName,
                            streamUrl = currentEpisode.streamUrl,
                            positionMs = currentPos,
                            durationMs = totalDuration
                        )
                    )
                }
            }
            delay(500)
        }
    }

    LaunchedEffect(showControls) {
        if (showControls) {
            delay(5000)
            showControls = false
        }
    }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                            if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
                            showControls = true
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            val target = PlaybackSupport.seekTarget(exoPlayer.currentPosition, exoPlayer.duration, -10_000L)
                            exoPlayer.seekTo(target)
                            currentPos = target
                            showControls = true
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            val target = PlaybackSupport.seekTarget(exoPlayer.currentPosition, exoPlayer.duration, 10_000L)
                            exoPlayer.seekTo(target)
                            currentPos = target
                            showControls = true
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                            showControls = true
                            true
                        }
                        else -> false
                    }
                } else false
            }
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        if (isBuffering) {
            CircularProgressIndicator(
                color = OrangePrimary,
                modifier = Modifier.align(Alignment.Center)
            )
        }

        errorMessage?.let { err ->
            Column(
                modifier = Modifier.align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.8f), RoundedCornerShape(8.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(text = err, color = Color.Red, fontSize = 14.sp)
                TvButton(text = "Thử lại", isPrimary = true, onClick = {
                    episodeStartPosition = exoPlayer.currentPosition.coerceAtLeast(0L)
                    episodePlayWhenReady = exoPlayer.playWhenReady
                    currentPos = episodeStartPosition
                    retryAttempt++
                })
                allEpisodes.firstOrNull {
                    it.episodeSlug == currentEpisode.episodeSlug && it.serverName != currentEpisode.serverName
                }?.let { alternative ->
                    TvButton(text = "Đổi nguồn: ${alternative.serverName}", onClick = { switchEpisode(alternative) })
                }
            }
        }

        AnimatedVisibility(
            visible = showControls && errorMessage == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter)
                        .padding(24.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = movieTitle,
                            color = TextWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${currentEpisode.serverName} • ${currentEpisode.episodeName}",
                            color = OrangePrimary,
                            fontSize = 14.sp
                        )
                    }

                    TvButton(
                        text = "✕ Đóng (Back)",
                        onClick = onBackPress
                    )
                }

                Icon(
                    imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.7f),
                    modifier = Modifier
                        .size(72.dp)
                        .align(Alignment.Center)
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .padding(24.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = formatTime(currentPos),
                            color = TextWhite,
                            fontSize = 12.sp
                        )
                        Text(
                            text = formatTime(totalDuration),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    val progress = if (totalDuration > 0) currentPos.toFloat() / totalDuration.toFloat() else 0f
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp),
                        color = OrangePrimary,
                        trackColor = Color.White.copy(alpha = 0.2f),
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    val sameServerEps = allEpisodes.filter { it.serverName == currentEpisode.serverName }
                    val currentIndex = sameServerEps.indexOfFirst { it.id == currentEpisode.id }
                    val nextEp = if (currentIndex != -1 && currentIndex + 1 < sameServerEps.size) {
                        sameServerEps[currentIndex + 1]
                    } else null

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        nextEp?.let { next ->
                            TvButton(
                                text = "Tập Tiếp Theo (${next.episodeName}) ▶",
                                isPrimary = true,
                                onClick = { switchEpisode(next) }
                            )
                        }

                        Text(
                            text = "D-Pad Trái/Phải: Tua 10s • OK: Tạm dừng • Lên/Xuống: OSD",
                            color = TextMuted,
                            fontSize = 11.sp
                        )
                    }
                }
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
