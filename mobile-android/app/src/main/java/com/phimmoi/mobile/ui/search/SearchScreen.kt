package com.phimmoi.mobile.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoi.mobile.data.MovieItem
import com.phimmoi.mobile.data.PhimMoiRepository
import com.phimmoi.mobile.ui.components.MobileMovieCard
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixCard
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.TextMuted
import com.phimmoi.mobile.ui.theme.TextWhite
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(
    repository: PhimMoiRepository,
    onMovieClick: (MovieItem) -> Unit
) {
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchJob by remember { mutableStateOf<Job?>(null) }

    val trendingTags = listOf(
        "Thuyết Minh", "Lồng Tiếng", "Chiếu Rạp", "Anime",
        "Hành Động", "Việt Nam", "Hàn Quốc", "Kinh Dị", "Tình Cảm", "Viễn Tưởng"
    )

    fun performSearch(text: String) {
        val q = text.trim()
        if (q.isEmpty()) {
            results = emptyList()
            isSearching = false
            return
        }
        searchJob?.cancel()
        searchJob = scope.launch {
            isSearching = true
            try {
                results = repository.search(q)
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isSearching = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
            .padding(horizontal = 16.dp)
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        // Search Input Bar
        OutlinedTextField(
            value = query,
            onValueChange = { newVal ->
                query = newVal
                searchJob?.cancel()
                searchJob = scope.launch {
                    delay(400) // Debounce 400ms
                    performSearch(newVal)
                }
            },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Tìm kiếm phim, diễn viên, anime...", color = TextMuted, fontSize = 14.sp) },
            leadingIcon = {
                Icon(imageVector = Icons.Default.Search, contentDescription = "Search", tint = TextMuted)
            },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = {
                        query = ""
                        results = emptyList()
                    }) {
                        Icon(imageVector = Icons.Default.Clear, contentDescription = "Clear", tint = TextMuted)
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = NetflixCard,
                unfocusedContainerColor = NetflixCard,
                focusedBorderColor = NetflixRed,
                unfocusedBorderColor = Color.Transparent,
                focusedTextColor = TextWhite,
                unfocusedTextColor = TextWhite,
                cursorColor = NetflixRed
            ),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                keyboardController?.hide()
                performSearch(query)
            })
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Trending / Category Tags
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 4.dp)
        ) {
            items(trendingTags) { tag ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(NetflixCard)
                        .clickable {
                            query = tag
                            keyboardController?.hide()
                            performSearch(tag)
                        }
                        .padding(horizontal = 14.dp, vertical = 6.dp)
                ) {
                    Text(text = tag, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Results Section
        if (isSearching) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = NetflixRed, strokeWidth = 3.dp)
            }
        } else if (results.isEmpty() && query.isNotBlank()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Không tìm thấy kết quả cho \"$query\"",
                        color = TextMuted,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Thử tìm kiếm với từ khóa khác hoặc bấm gợi ý trên",
                        color = TextMuted.copy(alpha = 0.7f),
                        fontSize = 12.sp
                    )
                }
            }
        } else {
            val rows = results.chunked(3)
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                if (results.isNotEmpty()) {
                    item {
                        Text(
                            text = "Kết Quả Tìm Kiếm (${results.size} phim)",
                            color = TextWhite,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                }

                items(rows) { rowMovies ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 5.dp),
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
            }
        }
    }
}
