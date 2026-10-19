package com.phimmoitv.app.ui.search

import android.view.KeyEvent
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SpaceBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoitv.app.data.MovieItem
import com.phimmoitv.app.data.PhimMoiRepository
import com.phimmoitv.app.ui.components.TvMovieCard
import com.phimmoitv.app.ui.theme.DarkBackground
import com.phimmoitv.app.ui.theme.DarkCard
import com.phimmoitv.app.ui.theme.NetflixRed
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(
    repository: PhimMoiRepository,
    onMovieClick: (MovieItem) -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
    focusTrigger: Long = 0L,
    modifier: Modifier = Modifier
) {
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var trendingMovies by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var hasSearched by rememberSaveable { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    val searchBarFocusRequester = remember { FocusRequester() }
    val firstKeyFocusRequester = remember { FocusRequester() }
    val firstResultFocusRequester = remember { FocusRequester() }
    val firstTagFocusRequester = remember { FocusRequester() }

    val resultsListState = rememberLazyListState()
    var targetResultSlug by remember { mutableStateOf<String?>(null) }
    var lastFocusedResultSlug by remember { mutableStateOf<String?>(null) }

    var searchJob by remember { mutableStateOf<Job?>(null) }

    fun triggerSearch(query: String, immediate: Boolean = false) {
        searchJob?.cancel()
        val clean = query.trim()
        if (clean.isEmpty()) {
            hasSearched = false
            searchResults = emptyList()
            return
        }
        hasSearched = true
        searchJob = scope.launch {
            if (!immediate) {
                delay(350)
            }
            isSearching = true
            try {
                val results = repository.search(clean)
                searchResults = results
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isSearching = false
            }
        }
    }

    // Tự động cuộn kết quả về đầu khi có kết quả tìm kiếm mới
    LaunchedEffect(searchResults) {
        if (searchResults.isNotEmpty()) {
            try {
                resultsListState.scrollToItem(0)
            } catch (_: Exception) {}
        }
    }

    // Tải phim thịnh hành cho trang tìm kiếm ban đầu
    LaunchedEffect(Unit) {
        if (trendingMovies.isEmpty()) {
            try {
                trendingMovies = repository.getCategoryPage("phim-moi", 1)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Tự động nhận tiêu điểm khi chuyển tab hoặc phục hồi
    LaunchedEffect(focusTrigger) {
        if (focusTrigger > 0L) {
            delay(100)
            try {
                if (lastFocusedResultSlug != null) {
                    targetResultSlug = lastFocusedResultSlug
                } else {
                    firstKeyFocusRequester.requestFocus()
                }
            } catch (_: Exception) {}
        }
    }

    val quickKeywords = remember {
        listOf(
            "Batman", "Conan", "Thám Tử", "Hành Động", "Kinh Dị",
            "Chiếu Rạp", "Anime",
            "Việt Nam", "Hàn Quốc", "Cổ Trang", "Hoạt Hình", "Hài Hước", "Võ Thuật"
        )
    }

    val displayMovies = if (hasSearched) searchResults else trendingMovies

    // Các hàm chuyển focus an toàn tuyệt đối, chống crash IllegalStateException
    // Tự động tìm thẻ phim đang hiển thị trong viewport để focus ngay cả khi đã cuộn xuống sâu
    val safeFocusResults: () -> Unit = {
        if (displayMovies.isNotEmpty()) {
            val visibleItems = resultsListState.layoutInfo.visibleItemsInfo
            val visibleSlugs = mutableListOf<String>()
            val chunked = displayMovies.chunked(3)
            for (vItem in visibleItems) {
                val keyStr = vItem.key.toString()
                if (keyStr.startsWith("search_row_")) {
                    val rowIdx = keyStr.removePrefix("search_row_").substringBefore("_").toIntOrNull() ?: 0
                    val rowMovies = chunked.getOrNull(rowIdx)
                    if (rowMovies != null) {
                        visibleSlugs.addAll(rowMovies.map { it.slug })
                    }
                }
            }
            val candidate = if (lastFocusedResultSlug != null && visibleSlugs.contains(lastFocusedResultSlug)) {
                lastFocusedResultSlug
            } else {
                visibleSlugs.firstOrNull() ?: displayMovies.firstOrNull()?.slug
            }

            if (candidate != null) {
                targetResultSlug = candidate
            } else {
                scope.launch {
                    try {
                        resultsListState.animateScrollToItem(0)
                        delay(80)
                        targetResultSlug = displayMovies.firstOrNull()?.slug
                    } catch (_: Exception) {}
                }
            }
        }
    }

    val safeFocusKeyboard: () -> Unit = {
        try {
            firstKeyFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    val safeFocusTags: () -> Unit = {
        if (quickKeywords.isNotEmpty()) {
            try {
                firstTagFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    // Bố cục bàn phím QWERTY chuẩn phổ thông
    val qwertyRow0 = remember { listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0") }
    val qwertyRow1 = remember { listOf("Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P") }
    val qwertyRow2 = remember { listOf("A", "S", "D", "F", "G", "H", "J", "K", "L") }
    val qwertyRow3 = remember { listOf("Z", "X", "C", "V", "B", "N", "M") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(horizontal = 24.dp, vertical = 14.dp)
    ) {
        // 1. THANH TÌM KIẾM TRÊN CÙNG
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Ô hiển thị từ khóa
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(46.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(DarkCard)
                    .border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = NetflixRed,
                        modifier = Modifier.size(20.dp).padding(end = 8.dp)
                    )
                    if (searchQuery.isEmpty()) {
                        Text(
                            text = "Chọn các chữ cái trên bàn phím QWERTY bên dưới để tìm phim...",
                            color = TextMuted,
                            fontSize = 14.sp
                        )
                    } else {
                        Text(
                            text = searchQuery,
                            color = TextWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            if (searchQuery.isNotEmpty()) {
                TvActionBtn(
                    label = "Xoá Hết",
                    icon = Icons.Default.Clear,
                    onClick = {
                        searchQuery = ""
                        triggerSearch("", immediate = true)
                        safeFocusKeyboard()
                    },
                    onNavigateLeft = safeFocusKeyboard,
                    onNavigateDown = safeFocusKeyboard
                )
            }

            TvActionBtn(
                label = "Tìm Kiếm",
                icon = Icons.Default.Search,
                isPrimary = true,
                onClick = {
                    triggerSearch(searchQuery, immediate = true)
                    scope.launch {
                        delay(100)
                        safeFocusResults()
                    }
                },
                onNavigateLeft = safeFocusKeyboard,
                onNavigateRight = safeFocusResults,
                onNavigateDown = safeFocusKeyboard
            )
        }

        // 2. GỢI Ý TỪ KHÓA NHANH (QUICK TAGS)
        Row(
            modifier = Modifier.padding(bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Gợi ý:",
                color = TextMuted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(end = 8.dp)
            )
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(end = 24.dp)
            ) {
                itemsIndexed(quickKeywords) { index, tag ->
                    SearchTagChip(
                        text = tag,
                        focusRequester = if (index == 0) firstTagFocusRequester else null,
                        onClick = {
                            searchQuery = tag
                            triggerSearch(tag, immediate = true)
                            scope.launch {
                                delay(120)
                                safeFocusResults()
                            }
                        },
                        onNavigateLeft = if (index == 0) { { onNavigateLeft?.invoke() } } else null,
                        onNavigateDown = safeFocusKeyboard
                    )
                }
            }
        }

        // 3. THÂN TRANG: CỘT BÀN PHÍM QWERTY (BÊN TRÁI) + LƯỚI PHIM KẾT QUẢ (BÊN PHẢI)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // CỘT TRÁI: BÀN PHÍM QWERTY CHUẨN PHỔ THÔNG
            Column(
                modifier = Modifier
                    .width(440.dp)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "⌨ BÀN PHÍM QWERTY",
                    color = TextMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    modifier = Modifier.padding(bottom = 2.dp)
                )

                // Hàng 0: Số 1 - 0
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    qwertyRow0.forEachIndexed { index, char ->
                        val isFirst = index == 0
                        val isLast = index == qwertyRow0.lastIndex
                        QwertyKey(
                            label = char,
                            focusRequester = if (isFirst) firstKeyFocusRequester else null,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                searchQuery += char
                                triggerSearch(searchQuery)
                            },
                            onNavigateLeft = if (isFirst) onNavigateLeft else null,
                            onNavigateRight = if (isLast) safeFocusResults else null,
                            onNavigateUp = safeFocusTags
                        )
                    }
                }

                // Hàng 1: Q - P
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    qwertyRow1.forEachIndexed { index, char ->
                        val isFirst = index == 0
                        val isLast = index == qwertyRow1.lastIndex
                        QwertyKey(
                            label = char,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                searchQuery += char
                                triggerSearch(searchQuery)
                            },
                            onNavigateLeft = if (isFirst) onNavigateLeft else null,
                            onNavigateRight = if (isLast) safeFocusResults else null
                        )
                    }
                }

                // Hàng 2: A - L
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    qwertyRow2.forEachIndexed { index, char ->
                        val isFirst = index == 0
                        val isLast = index == qwertyRow2.lastIndex
                        QwertyKey(
                            label = char,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                searchQuery += char
                                triggerSearch(searchQuery)
                            },
                            onNavigateLeft = if (isFirst) onNavigateLeft else null,
                            onNavigateRight = if (isLast) safeFocusResults else null
                        )
                    }
                }

                // Hàng 3: Z - M
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    qwertyRow3.forEachIndexed { index, char ->
                        val isFirst = index == 0
                        val isLast = index == qwertyRow3.lastIndex
                        QwertyKey(
                            label = char,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                searchQuery += char
                                triggerSearch(searchQuery)
                            },
                            onNavigateLeft = if (isFirst) onNavigateLeft else null,
                            onNavigateRight = if (isLast) safeFocusResults else null
                        )
                    }
                }

                // Hàng 4: Phím chức năng (Dấu cách / Xóa 1 ký tự / Xóa hết)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Phím Dấu cách (Space)
                    QwertyKey(
                        label = "Cách (Space)",
                        icon = Icons.Default.SpaceBar,
                        modifier = Modifier.weight(2f),
                        onClick = {
                            searchQuery += " "
                            triggerSearch(searchQuery)
                        },
                        onNavigateLeft = onNavigateLeft,
                        onNavigateDown = safeFocusResults
                    )

                    // Phím Xóa lùi (Backspace)
                    QwertyKey(
                        label = "⌫ Xoá",
                        icon = Icons.AutoMirrored.Filled.Backspace,
                        modifier = Modifier.weight(1.2f),
                        onClick = {
                            if (searchQuery.isNotEmpty()) {
                                searchQuery = searchQuery.dropLast(1)
                                triggerSearch(searchQuery)
                            }
                        },
                        onNavigateDown = safeFocusResults
                    )

                    // Phím Xóa sạch
                    QwertyKey(
                        label = "🗑 Hết",
                        modifier = Modifier.weight(1f),
                        onClick = {
                            searchQuery = ""
                            triggerSearch("", immediate = true)
                        },
                        onNavigateRight = safeFocusResults,
                        onNavigateDown = safeFocusResults
                    )
                }
            }

            // CỘT PHẢI: KẾT QUẢ TÌM KIẾM / PHIM THỊNH HÀNH
            val displayMovies = if (hasSearched) searchResults else trendingMovies

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
                Text(
                    text = if (hasSearched) {
                        if (isSearching) "Đang tìm kiếm..." else "Kết quả: \"$searchQuery\" (${searchResults.size} phim)"
                    } else {
                        "🔥 Phim Đang Thịnh Hành & Đề Xuất"
                    },
                    color = TextWhite,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 6.dp)
                )

                if (isSearching) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = NetflixRed)
                    }
                } else if (hasSearched && searchResults.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "Không tìm thấy phim phù hợp với \"$searchQuery\"",
                                color = TextMuted,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Hãy thử nhập từ khóa ngắn hơn hoặc chọn gợi ý ở trên.",
                                color = TextMuted.copy(alpha = 0.7f),
                                fontSize = 12.sp
                            )
                        }
                    }
                } else {
                    // Lưới 3 cột trong khu vực kết quả bên phải
                    val chunked = displayMovies.chunked(3)
                    LazyColumn(
                        state = resultsListState,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        itemsIndexed(chunked, key = { rowIndex, row -> "search_row_${rowIndex}_${row.firstOrNull()?.slug}" }) { rowIndex, rowMovies ->
                            val isLastRow = rowIndex == chunked.lastIndex
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                rowMovies.forEachIndexed { colIndex, movie ->
                                    val isTarget = targetResultSlug == movie.slug
                                    val cardFocusRequester = remember { FocusRequester() }

                                    LaunchedEffect(isTarget) {
                                        if (isTarget) {
                                            delay(80)
                                            try {
                                                cardFocusRequester.requestFocus()
                                            } catch (_: Exception) {}
                                            targetResultSlug = null
                                        }
                                    }

                                    val isLastCardInRow = (colIndex == rowMovies.lastIndex)
                                    TvMovieCard(
                                        movie = movie,
                                        onClick = { onMovieClick(movie) },
                                        modifier = Modifier.focusRequester(cardFocusRequester),
                                        onFocused = { lastFocusedResultSlug = movie.slug },
                                        onNavigateLeft = if (colIndex == 0) safeFocusKeyboard else null,
                                        onNavigateRight = if (isLastCardInRow) {
                                            { /* Cạnh phải: giữ nguyên tiêu điểm, không nhảy ngược lại */ }
                                        } else null,
                                        onNavigateUp = if (rowIndex == 0) safeFocusTags else null,
                                        onNavigateDown = if (isLastRow) {
                                            { /* Đã ở hàng cuối cùng của kết quả: giữ nguyên tiêu điểm, đứng ở cuối luôn! */ }
                                        } else null
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Phím trên bàn phím QWERTY in-app
 */
@Composable
private fun QwertyKey(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    focusRequester: FocusRequester? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateRight: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.12f else 1.0f,
        animationSpec = tween(100),
        label = "QwertyKeyScale"
    )

    Box(
        modifier = modifier
            .height(44.dp)
            .scale(scale)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .clip(RoundedCornerShape(6.dp))
            .background(if (isFocused) Color.White else Color(0xFF262626))
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) NetflixRed else Color.White.copy(alpha = 0.15f),
                shape = RoundedCornerShape(6.dp)
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
            .clickable(interactionSource = interactionSource, indication = null) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (isFocused) Color.Black else Color.White,
                    modifier = Modifier.size(16.dp).padding(end = 4.dp)
                )
            }
            Text(
                text = label,
                color = if (isFocused) Color.Black else Color.White,
                fontSize = if (label.length > 2) 12.sp else 14.sp,
                fontWeight = if (isFocused) FontWeight.Bold else FontWeight.Medium
            )
        }
    }
}

@Composable
private fun TvActionBtn(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    isPrimary: Boolean = false,
    focusRequester: FocusRequester? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateRight: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.05f else 1.0f,
        animationSpec = tween(120),
        label = "ActionBtnScale"
    )

    Box(
        modifier = modifier
            .scale(scale)
            .height(46.dp)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    isFocused -> Color.White
                    isPrimary -> NetflixRed
                    else -> DarkCard
                }
            )
            .border(
                border = if (isFocused) BorderStroke(2.dp, NetflixRed) else BorderStroke(1.dp, Color.White.copy(alpha = 0.2f)),
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
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = if (isFocused) Color.Black else TextWhite,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
            }
            Text(
                text = label,
                color = if (isFocused) Color.Black else TextWhite,
                fontSize = 14.sp,
                fontWeight = if (isFocused || isPrimary) FontWeight.Bold else FontWeight.Medium
            )
        }
    }
}

@Composable
private fun SearchTagChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateRight: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Box(
        modifier = modifier
            .scale(if (isFocused) 1.08f else 1.0f)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .clip(RoundedCornerShape(6.dp))
            .background(if (isFocused) Color.White else Color(0xFF262626))
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) NetflixRed else Color.White.copy(alpha = 0.2f),
                shape = RoundedCornerShape(6.dp)
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
            .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = if (isFocused) Color.Black else TextWhite,
            fontSize = 12.sp,
            fontWeight = if (isFocused) FontWeight.Bold else FontWeight.Medium
        )
    }
}
