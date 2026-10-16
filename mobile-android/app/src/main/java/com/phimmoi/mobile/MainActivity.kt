package com.phimmoi.mobile

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.phimmoi.mobile.data.*
import com.phimmoi.mobile.ui.detail.DetailScreen
import com.phimmoi.mobile.ui.history.HistoryScreen
import com.phimmoi.mobile.ui.home.HomeScreen
import com.phimmoi.mobile.ui.player.MobilePlayerScreen
import com.phimmoi.mobile.ui.search.SearchScreen
import com.phimmoi.mobile.ui.settings.SettingsScreen
import com.phimmoi.mobile.ui.theme.NetflixBlack
import com.phimmoi.mobile.ui.theme.NetflixRed
import com.phimmoi.mobile.ui.theme.PhimMoiMobileTheme
import com.phimmoi.mobile.ui.theme.TextMuted
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

enum class MobileTab(val label: String, val icon: ImageVector) {
    HOME("Trang chủ", Icons.Default.Home),
    SINGLE("Phim lẻ", Icons.Default.Movie),
    SERIES("Phim bộ", Icons.Default.Tv),
    SEARCH("Tìm kiếm", Icons.Default.Search),
    HISTORY("Lịch sử", Icons.Default.History)
}

sealed interface Screen {
    data class Main(val tab: MobileTab = MobileTab.HOME) : Screen
    data class Detail(val movie: MovieItem) : Screen
    data class Player(
        val movie: MovieItem,
        val initialEpisode: EpisodeSource,
        val allEpisodes: List<EpisodeSource> = emptyList(),
        val initialPositionMs: Long = 0L
    ) : Screen
    data object Settings : Screen
}

class MainActivity : ComponentActivity() {

    private lateinit var domainManager: DomainManager
    private lateinit var repository: PhimMoiRepository
    private lateinit var watchHistoryManager: WatchHistoryManager
    private lateinit var appUpdateManager: AppUpdateManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        domainManager = DomainManager(applicationContext)
        repository = PhimMoiRepository(domainManager)
        watchHistoryManager = WatchHistoryManager(applicationContext)
        appUpdateManager = AppUpdateManager(applicationContext)

        CoroutineScope(Dispatchers.IO).launch {
            domainManager.fetchLatestDomainFromRemote()
        }

        setContent {
            PhimMoiMobileTheme {
                val screenStack = remember { mutableStateListOf<Screen>(Screen.Main(MobileTab.HOME)) }
                val currentScreen = screenStack.lastOrNull() ?: Screen.Main(MobileTab.HOME)
                var lastBackPressedTime by remember { mutableStateOf(0L) }
                val context = LocalContext.current

                BackHandler(enabled = true) {
                    if (screenStack.size > 1) {
                        screenStack.removeAt(screenStack.lastIndex)
                    } else {
                        val root = screenStack.firstOrNull()
                        if (root is Screen.Main && root.tab != MobileTab.HOME) {
                            screenStack.clear()
                            screenStack.add(Screen.Main(MobileTab.HOME))
                        } else {
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastBackPressedTime < 2000L) {
                                (context as? ComponentActivity)?.finish()
                            } else {
                                lastBackPressedTime = currentTime
                                Toast.makeText(context, "Bấm lần nữa để thoát", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                }

                val isMainScreen = currentScreen is Screen.Main
                val isPlayerScreen = currentScreen is Screen.Player
                val activeTab = when (val s = currentScreen) {
                    is Screen.Main -> s.tab
                    else -> (screenStack.firstOrNull { it is Screen.Main } as? Screen.Main)?.tab ?: MobileTab.HOME
                }

                Scaffold(
                    contentWindowInsets = if (isPlayerScreen) WindowInsets(0, 0, 0, 0) else ScaffoldDefaults.contentWindowInsets,
                    bottomBar = {
                        if (isMainScreen) {
                            NavigationBar(
                                containerColor = Color(0xFF141414),
                                contentColor = Color.White
                            ) {
                                MobileTab.entries.forEach { tab ->
                                    NavigationBarItem(
                                        selected = activeTab == tab,
                                        onClick = {
                                            screenStack.clear()
                                            screenStack.add(Screen.Main(tab))
                                        },
                                        icon = {
                                            Icon(
                                                imageVector = tab.icon,
                                                contentDescription = tab.label
                                            )
                                        },
                                        label = {
                                            Text(
                                                text = tab.label,
                                                style = MaterialTheme.typography.labelSmall
                                            )
                                        },
                                        colors = NavigationBarItemDefaults.colors(
                                            selectedIconColor = NetflixRed,
                                            selectedTextColor = NetflixRed,
                                            unselectedIconColor = TextMuted,
                                            unselectedTextColor = TextMuted,
                                            indicatorColor = NetflixRed.copy(alpha = 0.15f)
                                        )
                                    )
                                }
                            }
                        }
                    }
                ) { paddingValues ->
                    val contentPadding = if (isPlayerScreen) PaddingValues(0.dp) else paddingValues
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(NetflixBlack)
                            .padding(contentPadding)
                    ) {
                        // Main screen content
                        if (isMainScreen) {
                            when (activeTab) {
                                MobileTab.HOME, MobileTab.SINGLE, MobileTab.SERIES -> {
                                    HomeScreen(
                                        currentTab = activeTab,
                                        repository = repository,
                                        watchHistoryManager = watchHistoryManager,
                                        onMovieClick = { movie ->
                                            screenStack.add(Screen.Detail(movie))
                                        },
                                        onContinueWatchingClick = { item ->
                                            screenStack.add(
                                                Screen.Detail(
                                                    MovieItem(
                                                        title = item.movieTitle,
                                                        slug = item.movieSlug,
                                                        posterUrl = item.posterUrl,
                                                        bannerUrl = item.bannerUrl
                                                    )
                                                )
                                            )
                                        },
                                        onSettingsClick = {
                                            screenStack.add(Screen.Settings)
                                        }
                                    )
                                }
                                MobileTab.SEARCH -> {
                                    SearchScreen(
                                        repository = repository,
                                        onMovieClick = { movie ->
                                            screenStack.add(Screen.Detail(movie))
                                        }
                                    )
                                }
                                MobileTab.HISTORY -> {
                                    HistoryScreen(
                                        watchHistoryManager = watchHistoryManager,
                                        onMovieClick = { movie ->
                                            screenStack.add(Screen.Detail(movie))
                                        },
                                        onExploreClick = {
                                            screenStack.clear()
                                            screenStack.add(Screen.Main(MobileTab.HOME))
                                        }
                                    )
                                }
                            }
                        }

                        // Detail screen overlay
                        val detailScreen = currentScreen as? Screen.Detail
                        if (detailScreen != null) {
                            DetailScreen(
                                movie = detailScreen.movie,
                                repository = repository,
                                watchHistoryManager = watchHistoryManager,
                                onPlayEpisode = { ep, allEps, startPos ->
                                    screenStack.add(
                                        Screen.Player(
                                            movie = detailScreen.movie,
                                            initialEpisode = ep,
                                            allEpisodes = allEps,
                                            initialPositionMs = startPos
                                        )
                                    )
                                },
                                onBackPress = {
                                    if (screenStack.size > 1) {
                                        screenStack.removeAt(screenStack.lastIndex)
                                    }
                                }
                            )
                        }

                        // Player screen overlay
                        val playerScreen = currentScreen as? Screen.Player
                        if (playerScreen != null) {
                            MobilePlayerScreen(
                                movieSlug = playerScreen.movie.slug,
                                movieTitle = playerScreen.movie.title,
                                posterUrl = playerScreen.movie.posterUrl,
                                bannerUrl = playerScreen.movie.bannerUrl,
                                initialEpisode = playerScreen.initialEpisode,
                                allEpisodes = playerScreen.allEpisodes,
                                watchHistoryManager = watchHistoryManager,
                                initialPositionMs = playerScreen.initialPositionMs,
                                onBackPress = {
                                    if (screenStack.size > 1) {
                                        screenStack.removeAt(screenStack.lastIndex)
                                    }
                                }
                            )
                        }

                        // Settings screen overlay
                        if (currentScreen is Screen.Settings) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(NetflixBlack)
                            ) {
                                Column(modifier = Modifier.fillMaxSize()) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        IconButton(
                                            onClick = {
                                                if (screenStack.size > 1) {
                                                    screenStack.removeAt(screenStack.lastIndex)
                                                }
                                            }
                                        ) {
                                            Icon(
                                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                                contentDescription = "Back",
                                                tint = Color.White
                                            )
                                        }
                                        Text(
                                            text = "Cài Đặt",
                                            color = Color.White,
                                            style = MaterialTheme.typography.titleMedium
                                        )
                                    }
                                    SettingsScreen(
                                        domainManager = domainManager,
                                        appUpdateManager = appUpdateManager
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
