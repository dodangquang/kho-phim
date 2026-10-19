package com.phimmoi.mobile.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimmoi.mobile.MobileTab
import com.phimmoi.mobile.data.*
import com.phimmoi.mobile.ui.components.MobileMovieCard
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    currentTab: MobileTab,
    repository: PhimMoiRepository,
    watchHistoryManager: WatchHistoryManager,
    onMovieClick: (MovieItem) -> Unit,
    onCategoryMoreClick: ((MovieSection) -> Unit)? = null,
    onContinueWatchingClick: ((WatchProgress) -> Unit)? = null,
    onSettingsClick: (() -> Unit)? = null
) {
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(true) }
    var heroMovie by remember { mutableStateOf<MovieItem?>(null) }
    var sections by remember { mutableStateOf<List<MovieSection>>(emptyList()) }
    var historyList by remember { mutableStateOf<List<WatchProgress>>(emptyList()) }
    val historyRevision by watchHistoryManager.revision.collectAsState()
    LaunchedEffect(historyRevision) { historyList = watchHistoryManager.getAllHistory() }

    // Category grid mode for Phim lẻ & Phim bộ
    var categoryMovies by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var categoryPage by remember { mutableIntStateOf(1) }
    var isLoadingMore by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()

    // Infinite scroll for category tabs (SINGLE & SERIES)
    val shouldLoadMore by remember {
        derivedStateOf {
            val total = listState.layoutInfo.totalItemsCount
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            total > 0 && lastVisible >= total - 2
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore && !isLoading && !isLoadingMore && currentTab != MobileTab.HOME && categoryMovies.isNotEmpty()) {
            val slug = if (currentTab == MobileTab.SINGLE) "phim-le" else "phim-bo"
            val nextPage = categoryPage + 1
            isLoadingMore = true
            try {
                val more = repository.getCategoryPage(slug, nextPage)
                if (more.isNotEmpty()) {
                    val existingSlugs = categoryMovies.map { it.slug }.toSet()
                    val uniqueNew = more.filter { !existingSlugs.contains(it.slug) }
                    categoryMovies = categoryMovies + uniqueNew
                    categoryPage = nextPage
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoadingMore = false
            }
        }
    }

    LaunchedEffect(currentTab) {
        isLoading = true
        try {
            historyList = watchHistoryManager.getAllHistory()

            if (currentTab == MobileTab.HOME) {
                if (sections.isEmpty()) {
                    val homeData = repository.getNetflixHomeSections()
                    heroMovie = homeData.heroMovie
                    sections = homeData.sections
                }
            } else {
                val categorySlug = when (currentTab) {
                    MobileTab.SINGLE -> "phim-le"
                    MobileTab.SERIES -> "phim-bo"
                    else -> "phim-moi"
                }
                categoryMovies = repository.getCategoryPage(categorySlug, 1)
                heroMovie = categoryMovies.firstOrNull()
                categoryPage = 1
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    if (isLoading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(NetflixBlack),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = NetflixRed, strokeWidth = 3.dp)
        }
        return
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        // 1. Mobile Hero Billboard
        heroMovie?.let { hero ->
            item {
                MobileHeroBanner(
                    movie = hero,
                    onPlayClick = { onMovieClick(hero) },
                    onInfoClick = { onMovieClick(hero) },
                    onSettingsClick = onSettingsClick
                )
            }
        }

        // 2. Tiếp tục xem (Continue Watching)
        if (currentTab == MobileTab.HOME && historyList.isNotEmpty()) {
            item {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    Text(
                        text = "Tiếp Tục Xem",
                        color = TextWhite,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(historyList) { item ->
                            ContinueWatchingMobileCard(
                                progress = item,
                                onClick = {
                                    if (onContinueWatchingClick != null) {
                                        onContinueWatchingClick(item)
                                    } else {
                                        onMovieClick(
                                            MovieItem(
                                                title = item.movieTitle,
                                                slug = item.movieSlug,
                                                posterUrl = item.posterUrl,
                                                bannerUrl = item.bannerUrl
                                            )
                                        )
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }

        // 3. Tab HOME: Themed rows
        if (currentTab == MobileTab.HOME) {
            items(sections) { section ->
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = section.title,
                            color = TextWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        if (onCategoryMoreClick != null) {
                            Text(
                                text = "Tải thêm ›",
                                color = NetflixRed,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .clickable { onCategoryMoreClick(section) }
                                    .padding(vertical = 4.dp, horizontal = 4.dp)
                            )
                        }
                    }
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        items(section.movies) { movie ->
                            MobileMovieCard(
                                movie = movie,
                                onClick = { onMovieClick(movie) }
                            )
                        }
                        if (onCategoryMoreClick != null) {
                            item {
                                CategoryMoreCard(
                                    title = section.title,
                                    onClick = { onCategoryMoreClick(section) }
                                )
                            }
                        }
                    }
                }
            }
        } else {
            // Tab SINGLE or SERIES: 3-column Grid with Load More
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = currentTab.label,
                    color = TextWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }

            val rows = categoryMovies.chunked(3)
            items(rows) { rowMovies ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    rowMovies.forEach { movie ->
                        Box(modifier = Modifier.weight(1f)) {
                            MobileMovieCard(
                                movie = movie,
                                onClick = { onMovieClick(movie) },
                                modifier = Modifier.fillMaxWidth(),
                                width = 110,
                                height = 160
                            )
                        }
                    }
                    if (rowMovies.size < 3) {
                        repeat(3 - rowMovies.size) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }

            // Load more button
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Button(
                        onClick = {
                            if (!isLoadingMore) {
                                scope.launch {
                                    isLoadingMore = true
                                    try {
                                        val slug = if (currentTab == MobileTab.SINGLE) "phim-le" else "phim-bo"
                                        val nextPage = categoryPage + 1
                                        val more = repository.getCategoryPage(slug, nextPage)
                                        if (more.isNotEmpty()) {
                                            val existingSlugs = categoryMovies.map { it.slug }.toSet()
                                            val uniqueNew = more.filter { !existingSlugs.contains(it.slug) }
                                            categoryMovies = categoryMovies + uniqueNew
                                            categoryPage = nextPage
                                        }
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                    } finally {
                                        isLoadingMore = false
                                    }
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NetflixCard),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        if (isLoadingMore) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Đang tải...", color = Color.White)
                        } else {
                            Text("Tải thêm phim (Trang ${categoryPage + 1})", color = Color.White, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MobileHeroBanner(
    movie: MovieItem,
    onPlayClick: () -> Unit,
    onInfoClick: () -> Unit,
    onSettingsClick: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val image = movie.bannerUrl?.takeIf { it.isNotBlank() } ?: movie.posterUrl

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp)
    ) {
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data(image)
                .crossfade(true)
                .build(),
            contentDescription = movie.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        // Settings Button on top-right
        if (onSettingsClick != null) {
            IconButton(
                onClick = onSettingsClick,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .size(36.dp)
                    .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(18.dp))
            ) {
                Icon(
                    imageVector = Icons.Default.Settings,
                    contentDescription = "Settings",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Gradient fade
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            NetflixBlack.copy(alpha = 0.5f),
                            NetflixBlack
                        )
                    )
                )
        )

        // Title and actions at bottom
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = movie.title,
                color = TextWhite,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(
                    onClick = onPlayClick,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = "Play",
                        tint = Color.Black
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Xem Phim", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }

                OutlinedButton(
                    onClick = onInfoClick,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(Color.White.copy(alpha = 0.6f))),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "Info",
                        tint = Color.White
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Chi Tiết", color = Color.White, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
fun ContinueWatchingMobileCard(
    progress: WatchProgress,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val image = progress.bannerUrl?.takeIf { it.isNotBlank() } ?: progress.posterUrl

    Column(
        modifier = Modifier
            .width(150.dp)
            .clip(RoundedCornerShape(6.dp))
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .width(150.dp)
                .height(95.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(NetflixCard)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(image)
                    .crossfade(true)
                    .build(),
                contentDescription = progress.movieTitle,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Play icon overlay
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Play",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Progress bar
            val ratio = if (progress.durationMs > 0) {
                (progress.positionMs.toFloat() / progress.durationMs.toFloat()).coerceIn(0f, 1f)
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

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = progress.movieTitle,
            color = TextWhite,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Text(
            text = "${progress.serverName} • ${progress.episodeName}",
            color = TextMuted,
            fontSize = 10.sp,
            maxLines = 1
        )
    }
}

@Composable
fun CategoryMoreCard(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Int = 110,
    height: Int = 160
) {
    Card(
        modifier = modifier
            .width(width.dp)
            .height(height.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = NetflixCard),
        border = BorderStroke(1.dp, Color(0xFF333333))
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(NetflixRed.copy(alpha = 0.2f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = "Xem thêm",
                    tint = NetflixRed,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Tải thêm",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = "Xem tất cả",
                color = TextMuted,
                fontSize = 10.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

