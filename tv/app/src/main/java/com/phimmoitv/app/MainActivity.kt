package com.phimmoitv.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.phimmoitv.app.data.AppUpdateManager
import com.phimmoitv.app.data.DomainManager
import com.phimmoitv.app.data.EpisodeSource
import com.phimmoitv.app.data.MovieItem
import com.phimmoitv.app.data.PhimMoiRepository
import com.phimmoitv.app.data.WatchHistoryManager
import com.phimmoitv.app.ui.components.NetflixSidebar
import com.phimmoitv.app.ui.components.TvNavTab
import com.phimmoitv.app.ui.detail.DetailScreen
import com.phimmoitv.app.ui.history.HistoryScreen
import com.phimmoitv.app.ui.home.HomeScreen
import com.phimmoitv.app.ui.player.PlayerScreen
import com.phimmoitv.app.ui.search.SearchScreen
import com.phimmoitv.app.ui.settings.SettingsScreen
import com.phimmoitv.app.ui.theme.NetflixBlack
import com.phimmoitv.app.ui.theme.PhimMoiTvTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import android.view.KeyEvent

import androidx.compose.ui.focus.focusProperties

sealed interface Screen {
    data class Main(val tab: TvNavTab = TvNavTab.HOME) : Screen
    data class Detail(val movie: MovieItem) : Screen
    data class Player(
        val movieSlug: String = "",
        val movieTitle: String,
        val posterUrl: String = "",
        val bannerUrl: String? = null,
        val episode: EpisodeSource,
        val allEpisodes: List<EpisodeSource>,
        val initialPositionMs: Long = 0L
    ) : Screen
}

class MainActivity : ComponentActivity() {

    private lateinit var domainManager: DomainManager
    private lateinit var repository: PhimMoiRepository
    private lateinit var watchHistoryManager: WatchHistoryManager
    private lateinit var appUpdateManager: AppUpdateManager
    private var rescueFocusTrigger by mutableLongStateOf(0L)

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val handled = super.dispatchKeyEvent(event)
        if (!handled && event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT,
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                    rescueFocusTrigger = System.currentTimeMillis()
                    return true
                }
            }
        }
        return handled
    }

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
            PhimMoiTvTheme {
                val screenStack = remember { mutableStateListOf<Screen>(Screen.Main(TvNavTab.HOME)) }
                val currentScreen = screenStack.lastOrNull() ?: Screen.Main(TvNavTab.HOME)
                var lastBackPressedTime by remember { mutableStateOf(0L) }
                val context = LocalContext.current
                var contentFocusTrigger by remember { mutableLongStateOf(0L) }
                var sidebarFocusTrigger by remember { mutableLongStateOf(0L) }
                val effectiveFocusTrigger = if (rescueFocusTrigger > contentFocusTrigger) rescueFocusTrigger else contentFocusTrigger

                // Quản lý nút Back tập trung cho Android TV (ngăn chặn văng app khi xem phim)
                BackHandler(enabled = true) {
                    if (screenStack.size > 1) {
                        screenStack.removeAt(screenStack.lastIndex)
                    } else {
                        val root = screenStack.firstOrNull()
                        if (root is Screen.Main && root.tab != TvNavTab.HOME) {
                            screenStack.clear()
                            screenStack.add(Screen.Main(TvNavTab.HOME))
                        } else {
                            // Đang ở Trang chủ - Bấm 2 lần trong 2 giây để thoát app
                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastBackPressedTime < 2000L) {
                                (context as? ComponentActivity)?.finish()
                            } else {
                                lastBackPressedTime = currentTime
                                Toast.makeText(
                                    context,
                                    "Bấm Quay lại lần nữa để thoát ứng dụng",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(NetflixBlack)
                ) {
                    val isMainActive = currentScreen is Screen.Main
                    val activeTab = when (val s = currentScreen) {
                        is Screen.Main -> s.tab
                        else -> (screenStack.firstOrNull { it is Screen.Main } as? Screen.Main)?.tab ?: TvNavTab.HOME
                    }

                    // Luôn giữ Screen.Main tồn tại để lưu trạng thái cuộn và dữ liệu phim
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .focusProperties {
                                canFocus = isMainActive
                            }
                    ) {
                        Row(modifier = Modifier.fillMaxSize()) {
                            // 1. NETFLIX COLLAPSIBLE SIDEBAR
                            NetflixSidebar(
                                selectedTab = activeTab,
                                onTabSelected = { newTab ->
                                    screenStack.clear()
                                    screenStack.add(Screen.Main(newTab))
                                    contentFocusTrigger = System.currentTimeMillis()
                                },
                                onNavigateRight = {
                                    contentFocusTrigger = System.currentTimeMillis()
                                },
                                focusTrigger = sidebarFocusTrigger
                            )

                            // 2. NỘI DUNG CHÍNH (KHÔNG DÙNG THANH TOP BAR CỒNG KỀNH)
                            Box(modifier = Modifier.weight(1f).fillMaxSize()) {
                                val isHomeTab = activeTab in listOf(TvNavTab.HOME, TvNavTab.SINGLE, TvNavTab.SERIES, TvNavTab.THEATER)

                                // Luôn giữ HomeScreen tồn tại để lưu trữ toàn bộ dữ liệu phim và vị trí cuộn của từng tab
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .focusProperties {
                                            canFocus = isHomeTab && isMainActive
                                        }
                                ) {
                                    HomeScreen(
                                        currentTab = if (isHomeTab) activeTab else TvNavTab.HOME,
                                        isActive = isHomeTab && isMainActive,
                                        focusTrigger = effectiveFocusTrigger,
                                        repository = repository,
                                        watchHistoryManager = watchHistoryManager,
                                        onNavigateLeft = {
                                            sidebarFocusTrigger = System.currentTimeMillis()
                                        },
                                        onMovieClick = { movie ->
                                            screenStack.add(Screen.Detail(movie))
                                        },
                                        onContinueWatchingClick = { item ->
                                            screenStack.add(
                                                Screen.Player(
                                                    movieSlug = item.movieSlug,
                                                    movieTitle = item.movieTitle,
                                                    posterUrl = item.posterUrl,
                                                    bannerUrl = item.bannerUrl,
                                                    episode = EpisodeSource(
                                                        id = item.episodeSlug,
                                                        serverName = item.serverName,
                                                        episodeName = item.episodeName,
                                                        episodeSlug = item.episodeSlug,
                                                        streamUrl = item.streamUrl
                                                    ),
                                                    allEpisodes = emptyList(),
                                                    initialPositionMs = item.positionMs
                                                )
                                            )
                                        },
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }

                                when (activeTab) {
                                    TvNavTab.HISTORY -> {
                                        HistoryScreen(
                                            watchHistoryManager = watchHistoryManager,
                                            onMovieClick = { movie ->
                                                screenStack.add(Screen.Detail(movie))
                                            },
                                            onNavigateLeft = {
                                                sidebarFocusTrigger = System.currentTimeMillis()
                                            },
                                            onExploreClick = {
                                                screenStack.clear()
                                                screenStack.add(Screen.Main(TvNavTab.HOME))
                                                contentFocusTrigger = System.currentTimeMillis()
                                            },
                                            focusTrigger = effectiveFocusTrigger,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }

                                    TvNavTab.SEARCH -> {
                                        SearchScreen(
                                            repository = repository,
                                            onMovieClick = { movie ->
                                                screenStack.add(Screen.Detail(movie))
                                            },
                                            onNavigateLeft = {
                                                sidebarFocusTrigger = System.currentTimeMillis()
                                            },
                                            focusTrigger = effectiveFocusTrigger,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }

                                    TvNavTab.SETTINGS -> {
                                        SettingsScreen(
                                            domainManager = domainManager,
                                            appUpdateManager = appUpdateManager,
                                            onNavigateLeft = {
                                                sidebarFocusTrigger = System.currentTimeMillis()
                                            },
                                            focusTrigger = effectiveFocusTrigger,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }

                                    else -> {}
                                }
                            }
                        }
                    }

                    // Detail Screen hiển thị đè lên trên khi xem chi tiết
                    val detailScreen = currentScreen as? Screen.Detail
                    if (detailScreen != null) {
                        DetailScreen(
                            movie = detailScreen.movie,
                            repository = repository,
                            watchHistoryManager = watchHistoryManager,
                            focusTrigger = effectiveFocusTrigger,
                            onPlayEpisode = { ep, allEps, initPos ->
                                screenStack.add(
                                    Screen.Player(
                                        movieSlug = detailScreen.movie.slug,
                                        movieTitle = detailScreen.movie.title,
                                        posterUrl = detailScreen.movie.posterUrl,
                                        bannerUrl = detailScreen.movie.bannerUrl,
                                        episode = ep,
                                        allEpisodes = allEps,
                                        initialPositionMs = initPos
                                    )
                                )
                            },
                            onBackPress = {
                                if (screenStack.size > 1) {
                                    screenStack.removeAt(screenStack.lastIndex)
                                } else {
                                    screenStack.clear()
                                    screenStack.add(Screen.Main())
                                }
                            }
                        )
                    }

                    // Player Screen hiển thị toàn màn hình trên cùng khi đang phát phim
                    val playerScreen = currentScreen as? Screen.Player
                    if (playerScreen != null) {
                        PlayerScreen(
                            movieSlug = playerScreen.movieSlug,
                            movieTitle = playerScreen.movieTitle,
                            posterUrl = playerScreen.posterUrl,
                            bannerUrl = playerScreen.bannerUrl,
                            initialEpisode = playerScreen.episode,
                            allEpisodes = playerScreen.allEpisodes,
                            watchHistoryManager = watchHistoryManager,
                            initialPositionMs = playerScreen.initialPositionMs,
                            onBackPress = {
                                if (screenStack.size > 1) {
                                    screenStack.removeAt(screenStack.lastIndex)
                                } else {
                                    screenStack.clear()
                                    screenStack.add(Screen.Main())
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}
