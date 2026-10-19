package com.phimmoi.mobile.ui.detail

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimmoi.mobile.data.*
import com.phimmoi.mobile.ui.components.MobileMovieCard
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite

@Composable
fun DetailScreen(
    movie: MovieItem,
    repository: PhimMoiRepository,
    watchHistoryManager: WatchHistoryManager,
    onPlayEpisode: (MovieItem, EpisodeSource, List<EpisodeSource>, Long) -> Unit,
    onBackPress: () -> Unit
) {
    val context = LocalContext.current
    var currentMovie by remember(movie) { mutableStateOf(movie) }
    var movieDetail by remember { mutableStateOf<MovieDetail?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedServer by remember { mutableStateOf("") }

    val lastProgress = remember(currentMovie.slug) {
        watchHistoryManager.getProgress(currentMovie.slug)
    }

    LaunchedEffect(currentMovie.slug) {
        isLoading = true
        try {
            val detail = repository.getMovieDetail(currentMovie.slug)
            movieDetail = detail
            if (detail.episodes.isNotEmpty()) {
                val servers = detail.episodes.map { it.serverName }.distinct()
                val targetServer = lastProgress?.serverName?.takeIf { servers.contains(it) } ?: servers.firstOrNull() ?: ""
                selectedServer = targetServer
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    val detail = movieDetail
    val backdrop = detail?.backdropUrl?.takeIf { it.isNotBlank() } ?: currentMovie.bannerUrl?.takeIf { it.isNotBlank() } ?: currentMovie.posterUrl
    val episodes = detail?.episodes ?: emptyList()
    val servers = episodes.map { it.serverName }.distinct()
    val filteredEpisodes = episodes.filter { it.serverName == selectedServer }

    fun launchPlayer(ep: EpisodeSource, startPos: Long = 0L) {
        onPlayEpisode(currentMovie, ep, episodes, startPos)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = NetflixRed,
                strokeWidth = 3.dp,
                modifier = Modifier.align(Alignment.Center)
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 32.dp)
            ) {
                // 1. Movie Backdrop with Gradient
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(280.dp)
                    ) {
                        AsyncImage(
                            model = ImageRequest.Builder(context)
                                .data(backdrop)
                                .crossfade(true)
                                .build(),
                            contentDescription = movie.title,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )

                        // Top & Bottom gradient overlay
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.verticalGradient(
                                        colors = listOf(
                                            Color.Black.copy(alpha = 0.6f),
                                            Color.Transparent,
                                            NetflixBlack.copy(alpha = 0.8f),
                                            NetflixBlack
                                        )
                                    )
                                )
                        )
                    }
                }

                // 2. Movie Title & Info
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                    ) {
                        Text(
                            text = detail?.title ?: movie.title,
                            color = TextWhite,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            movie.badge?.let { b ->
                                if (b.isNotBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .background(NetflixRed, RoundedCornerShape(3.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(text = b, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                            if (!detail?.year.isNullOrBlank()) {
                                Text(text = detail!!.year, color = TextMuted, fontSize = 12.sp)
                            }
                            if (!detail?.quality.isNullOrBlank()) {
                                Box(
                                    modifier = Modifier
                                        .background(Color.White.copy(alpha = 0.15f), RoundedCornerShape(3.dp))
                                        .padding(horizontal = 5.dp, vertical = 2.dp)
                                ) {
                                    Text(text = detail!!.quality, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            Text(text = "Độ nét cao", color = Color(0xFF46D369), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        val rating = if (detail != null) detail?.rating else movie.rating
                        Text(text = rating?.detailLabel ?: "Chưa có điểm", color = Color(0xFFFFD166), fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(12.dp))

                        // Big Play / Resume Button
                        val firstEp = filteredEpisodes.firstOrNull() ?: episodes.firstOrNull()
                        val resumeEp = PlaybackSupport.resumeEpisode(filteredEpisodes, lastProgress) ?: firstEp

                        if (resumeEp != null) {
                            Button(
                                onClick = {
                                    val startPos = if (lastProgress != null && resumeEp.episodeSlug == lastProgress.episodeSlug) lastProgress.positionMs else 0L
                                    launchPlayer(resumeEp, startPos)
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PlayArrow,
                                    contentDescription = "Play",
                                    tint = Color.White
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (lastProgress != null && lastProgress.positionMs > 2000L) "Tiếp Tục Xem (${resumeEp.episodeName})" else "Xem Phim Ngay",
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Overview / Synopsis
                        if (!detail?.overview.isNullOrBlank()) {
                            Text(
                                text = "Nội dung phim",
                                color = TextWhite,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = detail!!.overview,
                                color = TextMuted,
                                fontSize = 13.sp,
                                lineHeight = 19.sp
                            )
                            Spacer(modifier = Modifier.height(20.dp))
                        }
                    }
                }

                // 3. Server Selector
                if (servers.size > 1) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp)
                        ) {
                            Text(
                                text = "Nguồn Phát (Server)",
                                color = TextWhite,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(servers) { srv ->
                                    val isCur = srv == selectedServer
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(if (isCur) NetflixRed else NetflixCard)
                                            .clickable { selectedServer = srv }
                                            .padding(horizontal = 14.dp, vertical = 8.dp)
                                    ) {
                                        Text(
                                            text = srv,
                                            color = Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = if (isCur) FontWeight.Bold else FontWeight.Medium
                                        )
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                    }
                }

                // 4. Episodes Grid
                if (filteredEpisodes.isNotEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp)
                        ) {
                            Text(
                                text = "Danh Sách Tập (${filteredEpisodes.size} tập)",
                                color = TextWhite,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                    }

                    val rows = filteredEpisodes.chunked(4)
                    items(rows) { rowEps ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            rowEps.forEach { ep ->
                                val isWatched = lastProgress?.episodeSlug == ep.episodeSlug
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp)
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(if (isWatched) NetflixRed.copy(alpha = 0.85f) else NetflixCard)
                                        .clickable {
                                            val startPos = if (isWatched && lastProgress != null) lastProgress.positionMs else 0L
                                            launchPlayer(ep, startPos)
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = ep.episodeName,
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = if (isWatched) FontWeight.Bold else FontWeight.Normal,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
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

                // 5. Related Movies
                if (!detail?.relatedMovies.isNullOrEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(20.dp))
                        Text(
                            text = "Phim Tương Tự",
                            color = TextWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(detail!!.relatedMovies) { related ->
                                MobileMovieCard(
                                    movie = related,
                                    onClick = {
                                        movieDetail = null
                                        currentMovie = related
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        // Floating Back Button on top left
        IconButton(
            onClick = onBackPress,
            modifier = Modifier
                .padding(top = 40.dp, start = 12.dp)
                .size(40.dp)
                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(20.dp))
                .align(Alignment.TopStart)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                tint = Color.White
            )
        }
    }
}
