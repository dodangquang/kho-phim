package com.phimmoi.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val NetflixRed = Color(0xFFE50914)
val NetflixBlack = Color(0xFF141414)
val NetflixDark = Color(0xFF0F0F0F)
val NetflixCard = Color(0xFF1F1F1F)
val NetflixCardHover = Color(0xFF2A2A2A)
val TextWhite = Color(0xFFFFFFFF)
val TextMuted = Color(0xFFA3A3A3)

val OrangePrimary = NetflixRed
val DarkBackground = NetflixBlack
val DarkSurface = NetflixDark
val DarkCard = NetflixCard

private val DarkColorScheme = darkColorScheme(
    primary = NetflixRed,
    background = NetflixBlack,
    surface = NetflixDark,
    onPrimary = Color.White,
    onBackground = TextWhite,
    onSurface = TextWhite
)

@Composable
fun PhimMoiMobileTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
