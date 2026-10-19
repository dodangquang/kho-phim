package com.phimmoitv.app.ui.home

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import android.view.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.phimmoitv.app.data.SourcePolicy
import com.phimmoitv.app.data.MovieItem
import com.phimmoitv.app.data.MovieSection
import com.phimmoitv.app.data.PhimMoiRepository
import com.phimmoitv.app.ui.components.TvMovieCard
import com.phimmoitv.app.ui.components.TvNavTab
import com.phimmoitv.app.ui.theme.NetflixBlack
import com.phimmoitv.app.ui.theme.NetflixRed
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

import com.phimmoitv.app.data.WatchHistoryManager
import com.phimmoitv.app.data.WatchProgress

@Composable
fun HomeScreen(
    currentTab: TvNavTab,
    repository: PhimMoiRepository,
    onMovieClick: (MovieItem) -> Unit,
    modifier: Modifier = Modifier,
    isActive: Boolean = true,
    focusTrigger: Long = 0L,
    watchHistoryManager: WatchHistoryManager? = null,
    onContinueWatchingClick: ((WatchProgress) -> Unit)? = null,
    onNavigateLeft: (() -> Unit)? = null
) {
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(true) }

    var heroMovie by remember { mutableStateOf<MovieItem?>(null) }
    
    // Lưu trữ danh sách phim của sections ở cấp HomeScreen để KHÔNG BỊ MẤT khi cuộn ra khỏi màn hình
    var sections by remember { mutableStateOf<List<MovieSection>>(emptyList()) }
    val sectionPages = remember { mutableStateMapOf<String, Int>() }
    val sectionLoading = remember { mutableStateMapOf<String, Boolean>() }

    // Quản lý trạng thái và danh sách phim ĐỘC LẬP cho từng Tab (Phim Lẻ, Phim Bộ, Chiếu Rạp)
    // Giúp lưu vị trí đã lướt của từng mục và không bị reset khi mở chi tiết phim hoặc chuyển tab
    val homeListState = rememberLazyListState()
    val singleListState = rememberLazyListState()
    val seriesListState = rememberLazyListState()
    val theaterListState = rememberLazyListState()

    val currentListState = when (currentTab) {
        TvNavTab.HOME -> homeListState
        TvNavTab.SINGLE -> singleListState
        TvNavTab.SERIES -> seriesListState
        TvNavTab.THEATER -> theaterListState
        else -> homeListState
    }

    val categoryMoviesMap = remember { mutableStateMapOf<TvNavTab, List<MovieItem>>() }
    val categoryPageMap = remember { mutableStateMapOf<TvNavTab, Int>() }
    val categoryLoadingMoreMap = remember { mutableStateMapOf<TvNavTab, Boolean>() }
    val categoryHeroMovies = remember { mutableStateMapOf<TvNavTab, MovieItem?>() }

    var categoryTargetFocusSlug by remember { mutableStateOf<String?>(null) }
    var categoryTargetFocusTrigger by remember { mutableStateOf(0L) }
    var shelfTargetFocusSlug by remember { mutableStateOf<String?>(null) }
    var shelfTargetFocusTrigger by remember { mutableStateOf(0L) }
    var lastClickedMovieSlug by remember { mutableStateOf<String?>(null) }
    val lastFocusedTabSlug = remember { mutableStateMapOf<TvNavTab, String?>() }

    var historyList by remember { mutableStateOf<List<WatchProgress>>(emptyList()) }
    val cloudContext = androidx.compose.ui.platform.LocalContext.current
    val cloudHistory = remember { com.phimmoitv.app.data.CloudHistory.get(cloudContext) }
    val historyRevision by cloudHistory.revision.collectAsState()
    LaunchedEffect(historyRevision) { historyList = watchHistoryManager?.getAllHistory()?.filter { SourcePolicy.isCurrentSlug(it.movieSlug) } ?: emptyList() }
    val playFocusRequester = remember { FocusRequester() }

    val findVisibleCandidateSlug: () -> String? = {
        val lastSlug = lastFocusedTabSlug[currentTab]
        val visibleItems = currentListState.layoutInfo.visibleItemsInfo

        if (currentTab == TvNavTab.HOME) {
            val visibleMovieSlugs = mutableListOf<String>()
            for (vItem in visibleItems) {
                if (vItem.key == "continue_watching_shelf") {
                    visibleMovieSlugs.addAll(historyList.map { it.movieSlug })
                } else {
                    val matchingSection = sections.firstOrNull { it.slug == vItem.key }
                    if (matchingSection != null) {
                        visibleMovieSlugs.addAll(matchingSection.movies.map { it.slug })
                    }
                }
            }
            if (lastSlug != null && visibleMovieSlugs.contains(lastSlug)) {
                lastSlug
            } else {
                visibleMovieSlugs.firstOrNull()
            }
        } else {
            val currentMovies = categoryMoviesMap[currentTab] ?: emptyList()
            val rows = currentMovies.chunked(5)
            val visibleMovieSlugs = mutableListOf<String>()

            for (vItem in visibleItems) {
                val keyStr = vItem.key.toString()
                if (keyStr.startsWith("${currentTab.name}_row_")) {
                    val rowIndex = keyStr.removePrefix("${currentTab.name}_row_").toIntOrNull() ?: 0
                    if (rowIndex in rows.indices) {
                        visibleMovieSlugs.addAll(rows[rowIndex].map { it.slug })
                    }
                }
            }

            if (lastSlug != null && visibleMovieSlugs.contains(lastSlug)) {
                lastSlug
            } else {
                visibleMovieSlugs.firstOrNull()
            }
        }
    }

    val navigateUpToBillboard: () -> Unit = {
        scope.launch {
            currentListState.animateScrollToItem(0)
            delay(80)
            try {
                playFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    val navigateDownToContent: () -> Unit = {
        if (currentTab == TvNavTab.HOME) {
            val hasHistory = historyList.isNotEmpty()
            val targetRowIndex = if (hasHistory) 1 else (if (sections.isNotEmpty()) 1 else 0)
            scope.launch {
                currentListState.animateScrollToItem(targetRowIndex)
            }

            if (hasHistory) {
                val lastSlug = lastFocusedTabSlug[currentTab]
                val slug = if (lastSlug != null && historyList.any { it.movieSlug == lastSlug }) {
                    lastSlug
                } else {
                    historyList.first().movieSlug
                }
                shelfTargetFocusSlug = slug
                shelfTargetFocusTrigger++
                lastFocusedTabSlug[currentTab] = slug
            } else {
                val firstSection = sections.firstOrNull { it.movies.isNotEmpty() }
                val lastSlug = lastFocusedTabSlug[currentTab]
                val slug = if (lastSlug != null && firstSection?.movies?.any { it.slug == lastSlug } == true) {
                    lastSlug
                } else {
                    firstSection?.movies?.firstOrNull()?.slug
                }
                if (slug != null) {
                    shelfTargetFocusSlug = slug
                    shelfTargetFocusTrigger++
                    lastFocusedTabSlug[currentTab] = slug
                }
            }
        } else {
            scope.launch {
                currentListState.animateScrollToItem(1)
            }
            val currentMovies = categoryMoviesMap[currentTab] ?: emptyList()
            val lastSlug = lastFocusedTabSlug[currentTab]
            val slug = if (lastSlug != null && currentMovies.any { it.slug == lastSlug }) {
                lastSlug
            } else {
                currentMovies.firstOrNull()?.slug
            }
            if (slug != null) {
                categoryTargetFocusSlug = slug
                categoryTargetFocusTrigger++
                lastFocusedTabSlug[currentTab] = slug
            }
        }
    }

    // Phục hồi tiêu điểm (Focus Recovery) khi người dùng bấm phím điều hướng hoặc chuyển từ Sidebar sang
    LaunchedEffect(focusTrigger) {
        if (focusTrigger > 0 && isActive) {
            delay(60)
            try {
                val candidate = findVisibleCandidateSlug()
                if (candidate != null) {
                    if (currentTab == TvNavTab.HOME) {
                        shelfTargetFocusSlug = candidate
                        shelfTargetFocusTrigger++
                    } else {
                        categoryTargetFocusSlug = candidate
                        categoryTargetFocusTrigger++
                    }
                } else if (currentListState.firstVisibleItemIndex == 0) {
                    playFocusRequester.requestFocus()
                } else {
                    currentListState.animateScrollToItem(0)
                    delay(80)
                    playFocusRequester.requestFocus()
                }
            } catch (_: Exception) {}
        }
    }

    // Khi quay trở lại HomeScreen từ DetailScreen hoặc PlayerScreen, tự động phục hồi focus vào đúng phim vừa bấm
    LaunchedEffect(isActive) {
        if (isActive && lastClickedMovieSlug != null) {
            delay(150)
            categoryTargetFocusSlug = lastClickedMovieSlug
            categoryTargetFocusTrigger++
            shelfTargetFocusSlug = lastClickedMovieSlug
            shelfTargetFocusTrigger++
            lastFocusedTabSlug[currentTab] = lastClickedMovieSlug
            lastClickedMovieSlug = null
        }
    }

    // Tải dữ liệu ban đầu
    LaunchedEffect(currentTab) {
        try {
            if (currentTab == TvNavTab.HOME) {
                historyList = watchHistoryManager?.getAllHistory()?.filter { SourcePolicy.isCurrentSlug(it.movieSlug) } ?: emptyList()
                if (sections.isEmpty()) {
                    isLoading = true
                    val homeData = repository.getNetflixHomeSections()
                    heroMovie = homeData.heroMovie
                    sections = homeData.sections
                    homeData.sections.forEach { s ->
                        sectionPages[s.slug] = 1
                        sectionLoading[s.slug] = false
                    }
                }
            } else {
                if (categoryMoviesMap[currentTab].isNullOrEmpty()) {
                    isLoading = true
                    val categorySlug = when (currentTab) {
                        TvNavTab.SINGLE -> "phim-le"
                        TvNavTab.SERIES -> "phim-bo"
                        TvNavTab.THEATER -> "phim-chieu-rap"
                        else -> "phim-moi"
                    }
                    val movies = repository.getCategoryPage(categorySlug, 1)
                    categoryMoviesMap[currentTab] = movies
                    categoryPageMap[currentTab] = 1
                    categoryHeroMovies[currentTab] = movies.firstOrNull()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
        delay(250)
        if (currentListState.firstVisibleItemIndex == 0) {
            try {
                playFocusRequester.requestFocus()
            } catch (_: Exception) {}
        } else {
            val candidate = findVisibleCandidateSlug()
            if (candidate != null) {
                if (currentTab == TvNavTab.HOME) {
                    shelfTargetFocusSlug = candidate
                    shelfTargetFocusTrigger++
                } else {
                    categoryTargetFocusSlug = candidate
                    categoryTargetFocusTrigger++
                }
            }
        }
    }

        if (isLoading) {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .background(NetflixBlack),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = NetflixRed, strokeWidth = 3.dp)
            }
            return
        }

    val currentHeroMovie = if (currentTab == TvNavTab.HOME) heroMovie else (categoryHeroMovies[currentTab] ?: heroMovie)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(NetflixBlack)
    ) {
        LazyColumn(
            state = currentListState,
            modifier = Modifier.fillMaxSize()
        ) {
            // 1. NETFLIX IMMERSIVE HERO BILLBOARD
            item(key = "netflix_hero_billboard_${currentTab.name}") {
                currentHeroMovie?.let { hero ->
                    NetflixHeroBillboard(
                        movie = hero,
                        playFocusRequester = playFocusRequester,
                        onButtonFocused = {
                            scope.launch {
                                currentListState.animateScrollToItem(0)
                            }
                        },
                        onPlayClick = { onMovieClick(hero) },
                        onInfoClick = { onMovieClick(hero) },
                        onNavigateLeft = onNavigateLeft,
                        onNavigateDown = navigateDownToContent
                    )
                }
            }

            // 2. TIẾP TỤC XEM (CONTINUE WATCHING)
            if (currentTab == TvNavTab.HOME && historyList.isNotEmpty()) {
                item(key = "continue_watching_shelf") {
                    ContinueWatchingRow(
                        historyList = historyList,
                        targetFocusSlug = shelfTargetFocusSlug,
                        targetFocusTrigger = shelfTargetFocusTrigger,
                        onTargetFocusConsumed = { shelfTargetFocusSlug = null },
                        onNavigateUp = navigateUpToBillboard,
                        onNavigateLeft = onNavigateLeft,
                        onNavigateDown = if (sections.isNotEmpty()) {
                            {
                                val targetSlug = sections.firstOrNull { it.movies.isNotEmpty() }?.movies?.firstOrNull()?.slug
                                if (targetSlug != null) {
                                    scope.launch {
                                        currentListState.animateScrollToItem(2)
                                    }
                                    shelfTargetFocusSlug = targetSlug
                                    shelfTargetFocusTrigger++
                                    lastFocusedTabSlug[currentTab] = targetSlug
                                }
                            }
                        } else {
                            { /* Không có hàng nào bên dưới: giữ nguyên tiêu điểm, đứng ở cuối luôn */ }
                        },
                        onItemFocused = { item -> lastFocusedTabSlug[currentTab] = item.movieSlug },
                        onItemClick = { item ->
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

            // 3. NETFLIX ROWS / SHELVES CHO TRANG CHỦ
            if (currentTab == TvNavTab.HOME) {
                itemsIndexed(sections, key = { _, s -> s.slug }) { index, section ->
                    val isRowLoading = sectionLoading[section.slug] ?: false
                    val isFirstRow = index == 0 && historyList.isEmpty()
                    val isLastRow = index == sections.lastIndex

                    NetflixMovieRow(
                        section = section,
                        isRowLoading = isRowLoading,
                        targetFocusSlug = shelfTargetFocusSlug,
                        targetFocusTrigger = shelfTargetFocusTrigger,
                        onTargetFocusConsumed = { shelfTargetFocusSlug = null },
                        onNavigateUp = if (isFirstRow) navigateUpToBillboard else null,
                        onNavigateDown = if (isLastRow) { { /* Cạnh dưới cùng của trang Home: đứng ở cuối luôn, không nhảy lên billboard */ } } else null,
                        onNavigateLeft = onNavigateLeft,
                        onLoadMore = {
                            if (sectionLoading[section.slug] != true) {
                                scope.launch {
                                    sectionLoading[section.slug] = true
                                    try {
                                        val curPage = sectionPages[section.slug] ?: 1
                                        val nextPage = curPage + 1
                                        val newItems = repository.getCategoryPage(section.slug, nextPage)
                                        if (newItems.isNotEmpty()) {
                                            val existingSlugs = section.movies.map { it.slug }.toSet()
                                            val uniqueNew = newItems.filter { !existingSlugs.contains(it.slug) }
                                            if (uniqueNew.isNotEmpty()) {
                                                sections = sections.map { s ->
                                                    if (s.slug == section.slug) {
                                                        s.copy(movies = s.movies + uniqueNew)
                                                    } else s
                                                }
                                                sectionPages[section.slug] = nextPage
                                                val targetSlug = uniqueNew.first().slug
                                                shelfTargetFocusSlug = targetSlug
                                                lastFocusedTabSlug[currentTab] = targetSlug
                                            }
                                        }
                                    } catch (e: Exception) {
                                        android.util.Log.e("HomeScreen", "Lỗi tải thêm kệ ${section.slug}: ${e.message}")
                                    } finally {
                                        sectionLoading[section.slug] = false
                                    }
                                }
                            }
                        },
                        onMovieClick = { movie ->
                            lastClickedMovieSlug = movie.slug
                            onMovieClick(movie)
                        },
                        onMovieFocused = { movie ->
                            heroMovie = movie
                            lastFocusedTabSlug[currentTab] = movie.slug
                        }
                    )
                }
            } else {
                // CHUYÊN MỤC PHIM LẺ / PHIM BỘ / CHIẾU RẠP (TÁCH THÀNH TỪNG HÀNG ẢO HÓA)
                val currentMovies = categoryMoviesMap[currentTab] ?: emptyList()
                val rows = currentMovies.chunked(5)
                val curPage = categoryPageMap[currentTab] ?: 1
                val isLoadingMore = categoryLoadingMoreMap[currentTab] ?: false

                item(key = "category_header_${currentTab.name}") {
                    Text(
                        text = currentTab.label,
                        color = TextWhite,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 28.dp, top = 20.dp, bottom = 8.dp)
                    )
                }

                // Từng hàng 5 phim là một item độc lập trong LazyColumn -> Focus mượt mà, không bị nhảy
                itemsIndexed(
                    items = rows,
                    key = { rowIndex, _ -> "${currentTab.name}_row_$rowIndex" }
                ) { rowIndex, rowMovies ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        rowMovies.forEachIndexed { colIndex, movie ->
                            val isTarget = categoryTargetFocusSlug == movie.slug
                            val cardFocusRequester = remember { FocusRequester() }

                            LaunchedEffect(isTarget, categoryTargetFocusTrigger) {
                                if (isTarget) {
                                    repeat(5) {
                                        delay(60)
                                        try {
                                            cardFocusRequester.requestFocus()
                                        } catch (_: Exception) {}
                                    }
                                    categoryTargetFocusSlug = null
                                }
                            }

                            TvMovieCard(
                                movie = movie,
                                modifier = Modifier.focusRequester(cardFocusRequester),
                                onNavigateUp = if (rowIndex == 0) navigateUpToBillboard else null,
                                onNavigateLeft = if (colIndex == 0) onNavigateLeft else null,
                                onNavigateRight = if (colIndex == rowMovies.lastIndex) { { /* Cạnh phải: giữ nguyên tiêu điểm, không nhảy ngược lại */ } } else null,
                                onClick = {
                                    lastClickedMovieSlug = movie.slug
                                    onMovieClick(movie)
                                },
                                onFocused = {
                                    categoryHeroMovies[currentTab] = movie
                                    lastFocusedTabSlug[currentTab] = movie.slug
                                }
                            )
                        }
                    }
                }

                // Nút tải thêm phim cho mục category
                item(key = "load_more_category_${currentTab.name}") {
                    val performLoadMore: () -> Unit = {
                        if (!isLoadingMore) {
                            scope.launch {
                                categoryLoadingMoreMap[currentTab] = true
                                try {
                                    val categorySlug = when (currentTab) {
                                        TvNavTab.SINGLE -> "phim-le"
                                        TvNavTab.SERIES -> "phim-bo"
                                        TvNavTab.THEATER -> "phim-chieu-rap"
                                        else -> "phim-moi"
                                    }
                                    val nextPage = curPage + 1
                                    val more = repository.getCategoryPage(categorySlug, nextPage)
                                    if (more.isNotEmpty()) {
                                        val existing = categoryMoviesMap[currentTab] ?: emptyList()
                                        val existingSlugs = existing.map { it.slug }.toSet()
                                        val uniqueNew = more.filter { !existingSlugs.contains(it.slug) }
                                        if (uniqueNew.isNotEmpty()) {
                                            val firstNewSlug = uniqueNew.first().slug
                                            categoryMoviesMap[currentTab] = existing + uniqueNew
                                            categoryPageMap[currentTab] = nextPage
                                            
                                            // Cuộn đến hàng mới đầu tiên và focus ngay phim mới đầu tiên
                                            val targetRowIndex = (existing.size / 5) + 1
                                            currentListState.animateScrollToItem(targetRowIndex)
                                            delay(200)
                                            categoryTargetFocusSlug = firstNewSlug
                                            lastFocusedTabSlug[currentTab] = firstNewSlug
                                        }
                                    }
                                } catch (e: Exception) {
                                    android.util.Log.e("HomeScreen", "Lỗi tải category: ${e.message}")
                                } finally {
                                    categoryLoadingMoreMap[currentTab] = false
                                }
                            }
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 28.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        val interactionSource = remember { MutableInteractionSource() }
                        val isFocused by interactionSource.collectIsFocusedAsState()

                        Row(
                            modifier = Modifier
                                .scale(if (isFocused) 1.08f else 1.0f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isFocused) NetflixRed else Color(0xFF262626))
                                .border(
                                    width = if (isFocused) 2.5.dp else 1.dp,
                                    color = if (isFocused) Color.White else Color.White.copy(alpha = 0.2f),
                                    shape = RoundedCornerShape(8.dp)
                                )
                                .onKeyEvent {
                                    if (it.type == KeyEventType.KeyDown) {
                                        when (it.nativeKeyEvent.keyCode) {
                                            KeyEvent.KEYCODE_DPAD_CENTER,
                                            KeyEvent.KEYCODE_ENTER,
                                            KeyEvent.KEYCODE_NUMPAD_ENTER,
                                            KeyEvent.KEYCODE_BUTTON_A -> {
                                                performLoadMore()
                                                true
                                            }
                                            KeyEvent.KEYCODE_DPAD_DOWN,
                                            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                                // Đã ở cuối trang/cuối nút: giữ nguyên tiêu điểm ở đây, không nhảy lên trên hay nhảy về trước!
                                                true
                                            }
                                            KeyEvent.KEYCODE_DPAD_LEFT -> {
                                                onNavigateLeft?.invoke()
                                                true
                                            }
                                            else -> false
                                        }
                                    } else false
                                }
                                .clickable(interactionSource = interactionSource, indication = null) {
                                    performLoadMore()
                                }
                                .padding(horizontal = 36.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            if (isLoadingMore) {
                                CircularProgressIndicator(
                                    color = Color.White,
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.5.dp
                                )
                                Text(
                                    text = "Đang tải thêm phim...",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Add,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(22.dp)
                                )
                                Text(
                                    text = "Tải Thêm Phim (Trang ${curPage + 1})",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
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
}

/**
 * Netflix Hero Billboard with immersive cinematic gradients
 */
@Composable
private fun NetflixHeroBillboard(
    movie: MovieItem,
    playFocusRequester: FocusRequester? = null,
    onButtonFocused: () -> Unit,
    onPlayClick: () -> Unit,
    onInfoClick: () -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val context = LocalContext.current

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(340.dp)
    ) {
        // Dynamic Backdrop with crossfade (Ưu tiên ảnh ngang bannerUrl, fallback posterUrl)
        val billboardImage = movie.bannerUrl?.ifEmpty { null } ?: movie.posterUrl
        Crossfade(targetState = billboardImage, animationSpec = tween(400), label = "BillboardCrossfade") { bannerImg ->
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(bannerImg)
                    .crossfade(true)
                    .size(1080, 720)
                    .build(),
                contentDescription = movie.title,
                modifier = Modifier
                    .fillMaxSize()
                    .align(Alignment.TopEnd),
                contentScale = ContentScale.Crop
            )
        }

        // Netflix Signature Dual Gradient (Bottom Vignette + Left Fade)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            NetflixBlack,
                            NetflixBlack.copy(alpha = 0.95f),
                            NetflixBlack.copy(alpha = 0.6f),
                            Color.Transparent
                        )
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            NetflixBlack.copy(alpha = 0.7f),
                            NetflixBlack
                        )
                    )
                )
        )

        // Movie Info and Action Buttons
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 32.dp, bottom = 28.dp)
                .width(460.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .background(NetflixRed, RoundedCornerShape(2.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "TOP 1",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                }
                Text(
                    text = "XU HƯỚNG HÔM NAY",
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
            }

            Text(
                text = movie.title,
                color = TextWhite,
                fontSize = 28.sp,
                fontWeight = FontWeight.Black,
                lineHeight = 34.sp,
                maxLines = 2
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "98% Phù hợp", color = Color(0xFF46D369), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text(text = "2026", color = TextMuted, fontSize = 13.sp)
                Box(
                    modifier = Modifier
                        .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(2.dp))
                        .padding(horizontal = 5.dp, vertical = 1.dp)
                ) {
                    Text(text = "16+", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Text(text = "Ultra HD 4K", color = TextMuted, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                NetflixPlayButton(
                    focusRequester = playFocusRequester,
                    onFocused = onButtonFocused,
                    onClick = onPlayClick,
                    onNavigateLeft = onNavigateLeft,
                    onNavigateDown = onNavigateDown
                )
                NetflixInfoButton(
                    onFocused = onButtonFocused,
                    onClick = onInfoClick,
                    playFocusRequester = playFocusRequester,
                    onNavigateDown = onNavigateDown
                )
            }
        }
    }
}

/**
 * Netflix White Play Button ("Xem Phim")
 */
@Composable
private fun NetflixPlayButton(
    focusRequester: FocusRequester? = null,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    LaunchedEffect(isFocused) {
        if (isFocused) {
            onFocused()
        }
    }

    Row(
        modifier = Modifier
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .scale(if (isFocused) 1.08f else 1.0f)
            .shadow(if (isFocused) 12.dp else 0.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(if (isFocused) Color(0xFFC00000) else Color.White)
            .onKeyEvent {
                if (it.type == KeyEventType.KeyDown) {
                    when (it.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER,
                        KeyEvent.KEYCODE_NUMPAD_ENTER,
                        KeyEvent.KEYCODE_BUTTON_A -> {
                            onClick()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_UP -> {
                            // Cạnh trên: giữ focus ở billboard, không nhảy ra ngoài
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            if (onNavigateLeft != null) {
                                onNavigateLeft()
                                true
                            } else false
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (onNavigateDown != null) {
                                onNavigateDown()
                                true
                            } else false
                        }
                        else -> false
                    }
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(horizontal = 22.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = Icons.Default.PlayArrow,
            contentDescription = null,
            tint = if (isFocused) Color.White else Color.Black,
            modifier = Modifier.size(22.dp)
        )
        Text(
            text = "Xem Phim",
            color = if (isFocused) Color.White else Color.Black,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Netflix Translucent Info Button ("Chi Tiết")
 */
@Composable
private fun NetflixInfoButton(
    onFocused: () -> Unit,
    onClick: () -> Unit,
    playFocusRequester: FocusRequester? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    LaunchedEffect(isFocused) {
        if (isFocused) {
            onFocused()
        }
    }

    Row(
        modifier = Modifier
            .scale(if (isFocused) 1.08f else 1.0f)
            .clip(RoundedCornerShape(4.dp))
            .background(if (isFocused) Color.White else Color(0x66FFFFFF))
            .onKeyEvent {
                if (it.type == KeyEventType.KeyDown) {
                    when (it.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER,
                        KeyEvent.KEYCODE_NUMPAD_ENTER,
                        KeyEvent.KEYCODE_BUTTON_A -> {
                            onClick()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_UP,
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            // Cạnh trên & phải billboard: giữ focus
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            try {
                                playFocusRequester?.requestFocus()
                            } catch (_: Exception) {}
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (onNavigateDown != null) {
                                onNavigateDown()
                                true
                            } else false
                        }
                        else -> false
                    }
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Info,
            contentDescription = null,
            tint = if (isFocused) Color.Black else Color.White,
            modifier = Modifier.size(20.dp)
        )
        Text(
            text = "Chi Tiết",
            color = if (isFocused) Color.Black else Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

/**
 * Netflix Movie Shelf
 */
@Composable
private fun NetflixMovieRow(
    section: MovieSection,
    isRowLoading: Boolean,
    targetFocusSlug: String? = null,
    targetFocusTrigger: Long = 0L,
    onTargetFocusConsumed: () -> Unit = {},
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onLoadMore: () -> Unit,
    onMovieClick: (MovieItem) -> Unit,
    onMovieFocused: (MovieItem) -> Unit
) {
    val rowListState = rememberLazyListState()
    val loadMoreFocusRequester = remember { FocusRequester() }

    LaunchedEffect(targetFocusSlug, targetFocusTrigger) {
        if (!targetFocusSlug.isNullOrEmpty()) {
            val targetIdx = section.movies.indexOfFirst { it.slug == targetFocusSlug }
            if (targetIdx >= 0) {
                rowListState.scrollToItem(targetIdx)
            }
        }
    }

    Column(modifier = Modifier.padding(top = 18.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = section.title,
                color = Color(0xFFE5E5E5),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp
            )
            Text(
                text = " ›",
                color = Color(0xFF54B9C5),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp)
            )
        }

        LazyRow(
            state = rowListState,
            contentPadding = PaddingValues(horizontal = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            itemsIndexed(section.movies, key = { movieIndex, it -> "${section.slug}_${it.slug}_$movieIndex" }) { movieIndex, movie ->
                val isTarget = targetFocusSlug == movie.slug
                val cardFocusRequester = remember { FocusRequester() }

                LaunchedEffect(isTarget, targetFocusTrigger) {
                    if (isTarget) {
                        repeat(5) {
                            delay(60)
                            try {
                                cardFocusRequester.requestFocus()
                            } catch (_: Exception) {}
                        }
                        onTargetFocusConsumed()
                    }
                }

                TvMovieCard(
                    movie = movie,
                    modifier = Modifier.focusRequester(cardFocusRequester),
                    onNavigateUp = onNavigateUp,
                    onNavigateDown = onNavigateDown,
                    onNavigateLeft = if (movieIndex == 0) onNavigateLeft else null,
                    onClick = { onMovieClick(movie) },
                    onFocused = { onMovieFocused(movie) }
                )
            }

            // Nút tải thêm phim ở cuối mỗi kệ phim ngang
            item(key = "${section.slug}_shelf_load_more") {
                TvShelfLoadMoreCard(
                    isLoading = isRowLoading,
                    focusRequester = loadMoreFocusRequester,
                    onNavigateDown = onNavigateDown,
                    onClick = {
                        onLoadMore()
                    }
                )
            }
        }
    }
}

/**
 * Hàng "Tiếp Tục Xem" (Continue Watching)
 */
@Composable
private fun ContinueWatchingRow(
    historyList: List<WatchProgress>,
    targetFocusSlug: String? = null,
    targetFocusTrigger: Long = 0L,
    onTargetFocusConsumed: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onItemFocused: ((WatchProgress) -> Unit)? = null,
    onItemClick: (WatchProgress) -> Unit
) {
    val rowListState = rememberLazyListState()

    LaunchedEffect(targetFocusSlug, targetFocusTrigger) {
        if (!targetFocusSlug.isNullOrEmpty()) {
            val targetIdx = historyList.indexOfFirst { it.movieSlug == targetFocusSlug }
            if (targetIdx >= 0) {
                rowListState.scrollToItem(targetIdx)
            }
        }
    }

    Column(modifier = Modifier.padding(top = 18.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Tiếp Tục Xem",
                color = Color(0xFFE5E5E5),
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp
            )
            Text(
                text = " >",
                color = NetflixRed,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 4.dp)
            )
        }

        LazyRow(
            state = rowListState,
            contentPadding = PaddingValues(horizontal = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            itemsIndexed(historyList, key = { _, item -> "continue_${item.movieSlug}" }) { index, item ->
                val isTarget = targetFocusSlug == item.movieSlug
                val cardFocusRequester = remember { FocusRequester() }

                LaunchedEffect(isTarget, targetFocusTrigger) {
                    if (isTarget) {
                        repeat(5) {
                            delay(60)
                            try {
                                cardFocusRequester.requestFocus()
                            } catch (_: Exception) {}
                        }
                        onTargetFocusConsumed?.invoke()
                    }
                }

                ContinueWatchingCard(
                    item = item,
                    modifier = Modifier.focusRequester(cardFocusRequester),
                    onNavigateUp = onNavigateUp,
                    onNavigateDown = onNavigateDown,
                    onNavigateLeft = if (index == 0) onNavigateLeft else null,
                    onNavigateRight = if (index == historyList.lastIndex) { { /* Cạnh phải: giữ nguyên tiêu điểm ở thẻ cuối cùng, đứng ở cuối luôn */ } } else null,
                    onFocused = { onItemFocused?.invoke(item) },
                    onClick = { onItemClick(item) }
                )
            }
        }
    }
}

@Composable
fun ContinueWatchingCard(
    item: WatchProgress,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateRight: (() -> Unit)? = null,
    onFocused: (() -> Unit)? = null
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

    val remainingSec = ((item.durationMs - item.positionMs) / 1000).coerceAtLeast(0)
    val remainingMinutes = remainingSec / 60
    val timeLabel = if (remainingMinutes > 0) "Còn ${remainingMinutes}p" else "Đã xem"

    Column(
        modifier = modifier
            .width(180.dp)
            .scale(if (isFocused) 1.08f else 1.0f)
            .zIndex(if (isFocused) 20f else 1f)
            .clip(RoundedCornerShape(6.dp))
            .background(Color(0xFF1E1E1E))
            .border(
                border = if (isFocused) BorderStroke(2.5.dp, Color.White) else BorderStroke(0.5.dp, Color.White.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(6.dp)
            )
            .onKeyEvent {
                if (it.type == KeyEventType.KeyDown) {
                    when (it.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER,
                        KeyEvent.KEYCODE_NUMPAD_ENTER,
                        KeyEvent.KEYCODE_BUTTON_A -> {
                            onClick()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_UP -> {
                            if (onNavigateUp != null) {
                                onNavigateUp()
                                true
                            } else false
                        }
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
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (onNavigateDown != null) {
                                onNavigateDown()
                                true
                            } else false
                        }
                        else -> false
                    }
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
    ) {
        // Thumbnail Box
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(105.dp)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(item.bannerUrl?.ifEmpty { null } ?: item.posterUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = item.movieTitle,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Play icon when focused
            if (isFocused) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.4f)),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(NetflixRed, RoundedCornerShape(18.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
            }

            // Episode Badge
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(6.dp)
                    .background(Color.Black.copy(alpha = 0.75f), RoundedCornerShape(3.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = item.episodeName,
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Red Progress Bar at the bottom of thumbnail
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(Color.White.copy(alpha = 0.2f))
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
                .background(if (isFocused) Color(0xFF2B2B2B) else Color(0xFF1E1E1E))
                .padding(8.dp)
        ) {
            Text(
                text = item.movieTitle,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(2.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.serverName,
                    color = TextMuted,
                    fontSize = 10.sp
                )
                Text(
                    text = timeLabel,
                    color = if (isFocused) NetflixRed else TextMuted,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

/**
 * Thẻ "Tải thêm phim" ở cuối mỗi hàng ngang
 */
@Composable
private fun TvShelfLoadMoreCard(
    isLoading: Boolean,
    focusRequester: FocusRequester,
    onNavigateDown: (() -> Unit)? = null,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Column(
        modifier = Modifier
            .width(135.dp)
            .height(240.dp)
            .focusRequester(focusRequester)
            .scale(if (isFocused) 1.15f else 1.0f)
            .zIndex(if (isFocused) 30f else 1f)
            .padding(vertical = 8.dp, horizontal = 4.dp)
            .shadow(
                elevation = if (isFocused) 16.dp else 2.dp,
                shape = RoundedCornerShape(4.dp)
            )
            .clip(RoundedCornerShape(4.dp))
            .background(if (isFocused) NetflixRed.copy(alpha = 0.35f) else Color(0xFF1E1E1E))
            .border(
                border = if (isFocused) BorderStroke(2.5.dp, Color.White) else BorderStroke(0.5.dp, Color.White.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(4.dp)
            )
            .onKeyEvent {
                if (it.type == KeyEventType.KeyDown) {
                    when (it.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER,
                        KeyEvent.KEYCODE_NUMPAD_ENTER,
                        KeyEvent.KEYCODE_BUTTON_A -> {
                            onClick()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            // Đã ở cuối hàng: giữ nguyên tiêu điểm ở đây, không nhảy về các ô phía trước
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (onNavigateDown != null) {
                                onNavigateDown()
                                true
                            } else false
                        }
                        else -> false
                    }
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.5.dp,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Đang tải...",
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        } else {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .background(if (isFocused) NetflixRed else Color(0xFF333333), RoundedCornerShape(21.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Tải thêm",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Tải Thêm Phim",
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Trang tiếp theo",
                color = TextMuted,
                fontSize = 10.sp
            )
        }
    }
}
