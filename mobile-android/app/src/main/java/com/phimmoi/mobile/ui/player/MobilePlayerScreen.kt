package com.phimmoi.mobile.ui.player

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.phimmoi.mobile.data.PlaybackSupport
import com.phimmoi.mobile.data.EpisodeSource
import com.phimmoi.mobile.data.WatchHistoryManager
import com.phimmoi.mobile.data.WatchProgress
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite
import kotlinx.coroutines.delay
import java.util.Locale

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@OptIn(UnstableApi::class)
@Composable
fun MobilePlayerScreen(
    movieSlug: String = "",
    movieTitle: String,
    posterUrl: String = "",
    bannerUrl: String? = null,
    initialEpisode: EpisodeSource,
    allEpisodes: List<EpisodeSource> = emptyList(),
    watchHistoryManager: WatchHistoryManager? = null,
    initialPositionMs: Long = 0L,
    onBackPress: () -> Unit
) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }

    // 1. AUTO-ROTATE TO LANDSCAPE WHEN ENTERING, RESTORE PORTRAIT WHEN EXITING
    DisposableEffect(Unit) {
        val originalOrientation = activity?.requestedOrientation ?: ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE

        // Immersive sticky full screen
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity?.window?.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            activity?.window?.decorView?.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }

        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                activity?.window?.insetsController?.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            } else {
                @Suppress("DEPRECATION")
                activity?.window?.decorView?.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
            }
        }
    }

    var currentEp by remember { mutableStateOf(initialEpisode) }
    var isPlaying by remember { mutableStateOf(true) }
    var isBuffering by remember { mutableStateOf(true) }
    var currentPos by remember { mutableStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var episodeStartPosition by remember { mutableStateOf(initialPositionMs.coerceAtLeast(0L)) }
    var episodePlayWhenReady by remember { mutableStateOf(true) }
    var totalDuration by remember { mutableStateOf(0L) }
    var showControls by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSeeking by remember { mutableStateOf(false) }
    var seekSliderPos by remember { mutableStateOf(0f) }
    var showEpisodeSheet by remember { mutableStateOf(false) }

    BackHandler {
        onBackPress()
    }

    val exoPlayer = remember {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(15_000, 30_000, 1_500, 2_500)
            .setTargetBufferBytes(20 * 1024 * 1024)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        val audioAttributes = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .setUsage(C.USAGE_MEDIA)
            .build()

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36")
            .setAllowCrossProtocolRedirects(true)

        val mediaSourceFactory = DefaultMediaSourceFactory(context.applicationContext)
            .setDataSourceFactory(httpDataSourceFactory)

        ExoPlayer.Builder(context.applicationContext)
            .setLoadControl(loadControl)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ false)
            .build().apply {
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
            val finalPos = exoPlayer.currentPosition
            val finalDur = exoPlayer.duration
            if (watchHistoryManager != null && movieSlug.isNotEmpty() && finalPos > 2000L && finalDur > 0L) {
                watchHistoryManager.saveProgress(
                    WatchProgress(
                        movieSlug = movieSlug,
                        movieTitle = movieTitle,
                        posterUrl = posterUrl,
                        bannerUrl = bannerUrl,
                        episodeSlug = currentEp.episodeSlug,
                        episodeName = currentEp.episodeName,
                        serverName = currentEp.serverName,
                        streamUrl = currentEp.streamUrl,
                        positionMs = finalPos,
                        durationMs = finalDur
                    )
                )
            }
            exoPlayer.removeListener(listener)
            exoPlayer.stop()
            exoPlayer.clearMediaItems()
            exoPlayer.release()
        }
    }

    fun saveCurrentProgress() {
        val position = exoPlayer.currentPosition.coerceAtLeast(0L)
        val duration = exoPlayer.duration
        if (watchHistoryManager != null && movieSlug.isNotEmpty() && position > 2000L && duration > 0L) {
            watchHistoryManager.saveProgress(WatchProgress(
                movieSlug = movieSlug, movieTitle = movieTitle, posterUrl = posterUrl, bannerUrl = bannerUrl,
                episodeSlug = currentEp.episodeSlug, episodeName = currentEp.episodeName,
                serverName = currentEp.serverName, streamUrl = currentEp.streamUrl,
                positionMs = position, durationMs = duration
            ))
        }
    }

    fun switchEpisode(episode: EpisodeSource) {
        if (episode.id == currentEp.id) return
        saveCurrentProgress()
        val position = if (episode.episodeSlug == currentEp.episodeSlug) exoPlayer.currentPosition.coerceAtLeast(0L) else 0L
        episodePlayWhenReady = if (episode.episodeSlug == currentEp.episodeSlug) exoPlayer.playWhenReady else true
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        episodeStartPosition = position
        currentPos = position
        totalDuration = 0L
        isSeeking = false
        seekSliderPos = 0f
        isBuffering = true
        currentEp = episode
    }

    LaunchedEffect(currentEp) {
        errorMessage = null
        val rawUrl = PlaybackSupport.nativeStream(currentEp.streamUrl).orEmpty()
        if (rawUrl.isNotBlank()) {
            try {
                val sanitized = rawUrl.replace(" ", "%20")
                val mediaItem = MediaItem.Builder()
                    .setUri(sanitized)
                    .apply {
                        if (sanitized.contains("m3u8", ignoreCase = true)) {
                            setMimeType(MimeTypes.APPLICATION_M3U8)
                        }
                    }
                    .build()
                val startPos = episodeStartPosition
                exoPlayer.setMediaItem(mediaItem, startPos)
                exoPlayer.prepare()
                exoPlayer.playWhenReady = episodePlayWhenReady
            } catch (e: Exception) {
                errorMessage = "Không thể tải luồng phát: ${e.localizedMessage ?: "Lỗi"}"
            }
        } else {
            isBuffering = false
            errorMessage = "Nguồn này không có video trực tiếp hợp lệ. Hãy chọn nguồn hoặc tập khác."
        }
    }

    // Auto-save history every 3s
    LaunchedEffect(Unit) {
        var saveTicks = 0
        while (true) {
            if (!isSeeking) {
                currentPos = exoPlayer.currentPosition.coerceAtLeast(0L)
                totalDuration = exoPlayer.duration.coerceAtLeast(0L)
                if (++saveTicks >= 6 && exoPlayer.isPlaying && watchHistoryManager != null && movieSlug.isNotEmpty() && currentPos > 2000L && totalDuration > 0L) {
                    saveTicks = 0
                    watchHistoryManager.saveProgress(
                        WatchProgress(
                            movieSlug = movieSlug,
                            movieTitle = movieTitle,
                            posterUrl = posterUrl,
                            bannerUrl = bannerUrl,
                            episodeSlug = currentEp.episodeSlug,
                            episodeName = currentEp.episodeName,
                            serverName = currentEp.serverName,
                            streamUrl = currentEp.streamUrl,
                            positionMs = currentPos,
                            durationMs = totalDuration
                        )
                    )
                }
            }
            delay(500)
        }
    }

    // Auto-hide controls after 4s
    LaunchedEffect(showControls, isPlaying) {
        if (showControls && isPlaying) {
            delay(4000)
            showControls = false
        }
    }

    val sameServerEps = allEpisodes.filter { it.serverName == currentEp.serverName }
    val currentIdx = sameServerEps.indexOfFirst { it.id == currentEp.id }
    val nextEp = if (currentIdx != -1 && currentIdx + 1 < sameServerEps.size) sameServerEps[currentIdx + 1] else null

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                showControls = !showControls
            }
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                }
            },
            update = { playerView ->
                if (playerView.player != exoPlayer) {
                    playerView.player = exoPlayer
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        if (isBuffering && errorMessage == null) {
            CircularProgressIndicator(
                color = NetflixRed,
                strokeWidth = 3.dp,
                modifier = Modifier.align(Alignment.Center)
            )
        }

        errorMessage?.let { err ->
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.85f), RoundedCornerShape(12.dp))
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = err, color = Color.Red, fontSize = 13.sp)
                Spacer(modifier = Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {
                            errorMessage = null
                            val rawUrl = PlaybackSupport.nativeStream(currentEp.streamUrl).orEmpty()
                            if (rawUrl.isNotBlank()) {
                                try {
                                    val sanitized = rawUrl.replace(" ", "%20")
                                    val mediaItem = MediaItem.Builder()
                                        .setUri(sanitized)
                                        .apply {
                                            if (sanitized.contains("m3u8", ignoreCase = true)) {
                                                setMimeType(MimeTypes.APPLICATION_M3U8)
                                            }
                                        }
                                        .build()
                                    val retryPos = exoPlayer.currentPosition.coerceAtLeast(0L)
                                    exoPlayer.setMediaItem(mediaItem, retryPos)
                                    exoPlayer.prepare()
                                    exoPlayer.play()
                                } catch (e: Exception) {
                                    errorMessage = "Lỗi phát: ${e.localizedMessage}"
                                }
                            } else {
                                isBuffering = false
                                errorMessage = "Nguồn này không có video trực tiếp hợp lệ. Hãy chọn nguồn hoặc tập khác."
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text("Thử lại", color = Color.White, fontSize = 12.sp)
                    }
                    if (allEpisodes.isNotEmpty()) {
                        OutlinedButton(
                            onClick = { showEpisodeSheet = true },
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text("Đổi tập", color = Color.White, fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // TOUCH CONTROLS OVERLAY
        AnimatedVisibility(
            visible = showControls && errorMessage == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.55f))
            ) {
                // Top Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter)
                        .padding(horizontal = 24.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        IconButton(onClick = onBackPress) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = Color.White
                            )
                        }
                        Column {
                            Text(
                                text = movieTitle,
                                color = TextWhite,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "${currentEp.serverName} • ${currentEp.episodeName}",
                                color = NetflixRed,
                                fontSize = 12.sp
                            )
                        }
                    }

                    if (allEpisodes.isNotEmpty()) {
                        Button(
                            onClick = { showEpisodeSheet = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2A2A2A)),
                            shape = RoundedCornerShape(20.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.FormatListNumbered,
                                contentDescription = "Episodes",
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Danh sách tập", color = Color.White, fontSize = 12.sp)
                        }
                    }
                }

                // Center Controls (Rewind 10s, Play/Pause, Forward 10s)
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(40.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = {
                            val current = exoPlayer.currentPosition
                            val target = PlaybackSupport.seekTarget(current, exoPlayer.duration, -10_000L)
                            exoPlayer.seekTo(target)
                            currentPos = target
                        },
                        modifier = Modifier
                            .size(52.dp)
                            .background(Color.White.copy(alpha = 0.15f), CircleShape)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Replay10,
                            contentDescription = "Seek -10s",
                            tint = Color.White,
                            modifier = Modifier.size(28.dp)
                        )
                    }

                    IconButton(
                        onClick = {
                            if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
                        },
                        modifier = Modifier
                            .size(68.dp)
                            .background(NetflixRed, CircleShape)
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(38.dp)
                        )
                    }

                    IconButton(
                        onClick = {
                            val current = exoPlayer.currentPosition
                            val dur = exoPlayer.duration
                            val target = PlaybackSupport.seekTarget(current, dur, 10_000L)
                            exoPlayer.seekTo(target)
                            currentPos = target
                        },
                        modifier = Modifier
                            .size(52.dp)
                            .background(Color.White.copy(alpha = 0.15f), CircleShape)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Forward10,
                            contentDescription = "Seek +10s",
                            tint = Color.White,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                // Bottom Scrub Bar
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 24.dp, vertical = 16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val displayPos = if (isSeeking) (seekSliderPos * totalDuration).toLong() else currentPos
                        Text(
                            text = formatTime(displayPos),
                            color = TextWhite,
                            fontSize = 12.sp
                        )

                        if (nextEp != null) {
                            TextButton(
                                onClick = { switchEpisode(nextEp) },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "Tập kế tiếp (${nextEp.episodeName}) ▶",
                                    color = NetflixRed,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Text(
                            text = formatTime(totalDuration),
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }

                    val sliderValue = if (isSeeking) {
                        seekSliderPos
                    } else if (totalDuration > 0) {
                        (currentPos.toFloat() / totalDuration.toFloat()).coerceIn(0f, 1f)
                    } else 0f

                    Slider(
                        value = sliderValue,
                        onValueChange = { newVal ->
                            isSeeking = true
                            seekSliderPos = newVal
                        },
                        onValueChangeFinished = {
                            isSeeking = false
                            if (totalDuration > 0L) {
                                val target = (seekSliderPos * totalDuration).toLong().coerceIn(0L, totalDuration)
                                exoPlayer.seekTo(target)
                                currentPos = target
                            }
                        },
                        colors = SliderDefaults.colors(
                            thumbColor = NetflixRed,
                            activeTrackColor = NetflixRed,
                            inactiveTrackColor = Color.White.copy(alpha = 0.25f)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        // EPISODES SELECTOR DIALOG
        if (showEpisodeSheet) {
            AlertDialog(
                onDismissRequest = { showEpisodeSheet = false },
                containerColor = Color(0xFF1E1E1E),
                title = {
                    Text(
                        text = "Chọn Tập Phim",
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                },
                text = {
                    val servers = allEpisodes.map { it.serverName }.distinct()
                    var selectedServer by remember { mutableStateOf(currentEp.serverName) }
                    val currentServerEps = allEpisodes.filter { it.serverName == selectedServer }

                    Column(modifier = Modifier.fillMaxWidth()) {
                        if (servers.size > 1) {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(servers) { srv ->
                                    val isCurServer = srv == selectedServer
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(if (isCurServer) NetflixRed else Color(0xFF2A2A2A))
                                            .clickable { selectedServer = srv }
                                            .padding(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text(
                                            text = srv,
                                            color = Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = if (isCurServer) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                        }

                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 240.dp)
                        ) {
                            val rows = currentServerEps.chunked(4)
                            items(rows) { rowEps ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    rowEps.forEach { ep ->
                                        val isCurrent = ep.id == currentEp.id
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(40.dp)
                                                .clip(RoundedCornerShape(6.dp))
                                                .background(if (isCurrent) NetflixRed else Color(0xFF333333))
                                                .clickable {
                                                    switchEpisode(ep)
                                                    showEpisodeSheet = false
                                                },
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = ep.episodeName,
                                                color = Color.White,
                                                fontSize = 12.sp,
                                                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium
                                            )
                                        }
                                    }
                                    if (rowEps.size < 4) {
                                        repeat(4 - rowEps.size) {
                                            Spacer(modifier = Modifier.weight(1f))
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showEpisodeSheet = false }) {
                        Text("Đóng", color = Color.White)
                    }
                }
            )
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
