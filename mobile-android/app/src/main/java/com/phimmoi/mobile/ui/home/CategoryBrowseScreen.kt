package com.phimmoi.mobile.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoi.mobile.data.MovieItem
import com.phimmoi.mobile.data.PhimMoiRepository
import com.phimmoi.mobile.ui.components.MobileMovieCard
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextWhite
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryBrowseScreen(
    title: String,
    categoryPath: String,
    repository: PhimMoiRepository,
    onMovieClick: (MovieItem) -> Unit,
    onBackPress: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var movies by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var isLoading by remember { mutableStateOf(true) }
    var isLoadingMore by remember { mutableStateOf(false) }
    var hasMore by remember { mutableStateOf(true) }

    val listState = rememberLazyListState()

    fun loadMore() {
        if (isLoadingMore || !hasMore) return
        scope.launch {
            isLoadingMore = true
            try {
                val nextPage = page + 1
                val more = repository.getCategoryPage(categoryPath, nextPage)
                if (more.isNotEmpty()) {
                    val existingSlugs = movies.map { it.slug }.toSet()
                    val uniqueNew = more.filter { !existingSlugs.contains(it.slug) }
                    movies = movies + uniqueNew
                    page = nextPage
                    if (more.size < 24) {
                        hasMore = false
                    }
                } else {
                    hasMore = false
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoadingMore = false
            }
        }
    }

    LaunchedEffect(categoryPath) {
        isLoading = true
        hasMore = true
        page = 1
        try {
            movies = repository.getCategoryPage(categoryPath, 1)
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    // Infinite scroll trigger
    val shouldLoadMore by remember {
        derivedStateOf {
            val total = listState.layoutInfo.totalItemsCount
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            total > 0 && lastVisible >= total - 2
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore && !isLoading && !isLoadingMore && hasMore && movies.isNotEmpty()) {
            loadMore()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = title,
                        color = TextWhite,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackPress) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Quay lại",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = NetflixBlack,
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = NetflixBlack
    ) { paddingValues ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = NetflixRed, strokeWidth = 3.dp)
            }
        } else if (movies.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Không tìm thấy phim trong danh mục này.",
                    color = Color.Gray,
                    fontSize = 14.sp
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentPadding = PaddingValues(bottom = 32.dp)
            ) {
                val rows = movies.chunked(3)
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

                // Load more button & indicator
                if (hasMore) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 20.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Button(
                                onClick = { loadMore() },
                                colors = ButtonDefaults.buttonColors(containerColor = NetflixCard),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                if (isLoadingMore) {
                                    CircularProgressIndicator(
                                        color = Color.White,
                                        modifier = Modifier.size(18.dp),
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Đang tải...", color = Color.White)
                                } else {
                                    Text(
                                        "Tải thêm phim (Trang ${page + 1})",
                                        color = Color.White,
                                        fontSize = 13.sp
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
