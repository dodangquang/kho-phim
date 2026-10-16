package com.phimmoitv.app

import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoitv.app.data.AppUpdateManager
import com.phimmoitv.app.data.DomainManager
import com.phimmoitv.app.data.EpisodeSource
import com.phimmoitv.app.data.MovieItem
import com.phimmoitv.app.data.PhimMoiRepository
import com.phimmoitv.app.data.UpdateInfo
import com.phimmoitv.app.data.WatchHistoryManager
import com.phimmoitv.app.ui.components.NetflixSidebar
import com.phimmoitv.app.ui.components.TvButton
import com.phimmoitv.app.ui.components.TvNavTab
import com.phimmoitv.app.ui.detail.DetailScreen
import com.phimmoitv.app.ui.history.HistoryScreen
import com.phimmoitv.app.ui.home.HomeScreen
import com.phimmoitv.app.ui.player.PlayerScreen
import com.phimmoitv.app.ui.search.SearchScreen
import com.phimmoitv.app.ui.settings.SettingsScreen
import com.phimmoitv.app.ui.theme.NetflixBlack
import com.phimmoitv.app.ui.theme.NetflixCard
import com.phimmoitv.app.ui.theme.NetflixRed
import com.phimmoitv.app.ui.theme.PhimMoiTvTheme
import com.phimmoitv.app.ui.theme.TextMuted
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
                val coroutineScope = rememberCoroutineScope()
                var contentFocusTrigger by remember { mutableLongStateOf(0L) }
                var sidebarFocusTrigger by remember { mutableLongStateOf(0L) }
                val effectiveFocusTrigger = if (rescueFocusTrigger > contentFocusTrigger) rescueFocusTrigger else contentFocusTrigger

                var updateInfo by remember { mutableStateOf<UpdateInfo?>(null) }
                var showUpdateDialog by remember { mutableStateOf(false) }
                var updateProgress by remember { mutableStateOf<Float?>(null) }
                var updateError by remember { mutableStateOf<String?>(null) }
                var isDownloaded by remember { mutableStateOf(false) }
                val updateBtnFocusRequester = remember { FocusRequester() }

                LaunchedEffect(Unit) {
                    delay(1500L)
                    try {
                        val info = appUpdateManager.checkUpdate(BuildConfig.VERSION_CODE)
                        if (info != null) {
                            updateInfo = info
                            showUpdateDialog = true
                        }
                    } catch (e: Exception) {
                        // Silently handle error on auto check
                    }
                }

                LaunchedEffect(showUpdateDialog, isDownloaded) {
                    if (showUpdateDialog && updateProgress == null) {
                        delay(200L)
                        try {
                            updateBtnFocusRequester.requestFocus()
                        } catch (_: Exception) {}
                    }
                }

                // Quản lý nút Back tập trung cho Android TV (ngăn chặn văng app khi xem phim)
                BackHandler(enabled = true) {
                    if (showUpdateDialog && updateProgress == null) {
                        showUpdateDialog = false
                        isDownloaded = false
                        updateProgress = null
                    } else if (screenStack.size > 1) {
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

                if (showUpdateDialog && updateInfo != null) {
                    val info = updateInfo!!
                    AlertDialog(
                        onDismissRequest = {
                            if (updateProgress == null) {
                                showUpdateDialog = false
                                isDownloaded = false
                                updateProgress = null
                            }
                        },
                        title = {
                            Text(
                                text = "Cập Nhật Ứng Dụng",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        },
                        text = {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = if (isDownloaded) {
                                        "Đã tải xong bản cập nhật v${info.versionName}. Bấm 'Cài đặt ngay' để tiến hành cập nhật ứng dụng."
                                    } else {
                                        "Đã có bản cập nhật mới v${info.versionName} - Bạn có muốn cập nhật ngay không?"
                                    },
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color.White
                                )
                                if (info.changelog.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = info.changelog,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = TextMuted
                                    )
                                }
                                if (updateProgress != null) {
                                    val p = updateProgress ?: 0f
                                    Spacer(modifier = Modifier.height(16.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = "Đang tải bản cập nhật...",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = Color.White
                                        )
                                        Text(
                                            text = "${(p * 100).toInt()}%",
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.Bold,
                                            color = NetflixRed
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    LinearProgressIndicator(
                                        progress = { p },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(6.dp),
                                        color = NetflixRed,
                                        trackColor = Color(0xFF333333)
                                    )
                                }
                                if (updateError != null) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = updateError ?: "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color.Red
                                    )
                                }
                            }
                        },
                        confirmButton = {
                            if (updateProgress == null) {
                                TvButton(
                                    text = if (isDownloaded) "Cài đặt ngay" else "Cập nhật ngay",
                                    isPrimary = true,
                                    focusRequester = updateBtnFocusRequester,
                                    onClick = {
                                        val act = context as? Activity ?: return@TvButton
                                        if (isDownloaded) {
                                            val launched = appUpdateManager.installApk(
                                                activity = act,
                                                apkFile = appUpdateManager.getCachedApkFile(act, info.versionCode)
                                            )
                                            if (launched) {
                                                showUpdateDialog = false
                                                isDownloaded = false
                                                updateProgress = null
                                            } else {
                                                Toast.makeText(
                                                    context,
                                                    "Vui lòng cho phép cài đặt ứng dụng từ nguồn này rồi bấm 'Cài đặt ngay'",
                                                    Toast.LENGTH_LONG
                                                ).show()
                                            }
                                        } else {
                                            coroutineScope.launch {
                                                updateProgress = 0f
                                                updateError = null
                                                appUpdateManager.downloadAndInstallApk(
                                                    activity = act,
                                                    apkUrl = info.apkUrl,
                                                    versionCode = info.versionCode,
                                                    onProgress = { p -> updateProgress = p },
                                                    onSuccess = { launched ->
                                                        updateProgress = null
                                                        if (launched) {
                                                            showUpdateDialog = false
                                                            isDownloaded = false
                                                        } else {
                                                            isDownloaded = true
                                                            Toast.makeText(
                                                                context,
                                                                "Vui lòng cho phép cài đặt ứng dụng từ nguồn này rồi bấm 'Cài đặt ngay'",
                                                                Toast.LENGTH_LONG
                                                            ).show()
                                                        }
                                                    },
                                                    onError = { err ->
                                                        updateError = err
                                                        updateProgress = null
                                                        isDownloaded = false
                                                    }
                                                )
                                            }
                                        }
                                    }
                                )
                            }
                        },
                        dismissButton = {
                            if (updateProgress == null) {
                                TvButton(
                                    text = "Để sau",
                                    onClick = {
                                        showUpdateDialog = false
                                        isDownloaded = false
                                        updateProgress = null
                                    }
                                )
                            }
                        },
                        containerColor = NetflixCard,
                        shape = RoundedCornerShape(16.dp)
                    )
                }
            }
        }
    }
}
