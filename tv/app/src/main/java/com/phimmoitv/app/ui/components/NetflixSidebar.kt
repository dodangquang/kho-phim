package com.phimmoitv.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.phimmoitv.app.R
import com.phimmoitv.app.ui.theme.NetflixBlack
import com.phimmoitv.app.ui.theme.NetflixRed
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite

import android.view.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type

@Composable
fun NetflixSidebar(
    selectedTab: TvNavTab,
    onTabSelected: (TvNavTab) -> Unit,
    onNavigateRight: (() -> Unit)? = null,
    focusTrigger: Long = 0L,
    modifier: Modifier = Modifier
) {
    var isSidebarFocused by remember { mutableStateOf(false) }
    val isExpanded = isSidebarFocused
    val selectedTabFocusRequester = remember { FocusRequester() }

    LaunchedEffect(focusTrigger) {
        if (focusTrigger > 0L) {
            kotlinx.coroutines.delay(60)
            try {
                selectedTabFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    val sidebarWidth by animateDpAsState(
        targetValue = if (isSidebarFocused) 220.dp else 64.dp,
        animationSpec = tween(durationMillis = 200),
        label = "SidebarWidth"
    )

    Box(
        modifier = modifier
            .width(sidebarWidth)
            .fillMaxHeight()
            .zIndex(100f)
            .onFocusChanged { focusState ->
                isSidebarFocused = focusState.hasFocus
            }
            .background(
                Brush.horizontalGradient(
                    colors = if (isSidebarFocused) {
                        listOf(Color(0xFF0F0F0F), Color(0xFF0F0F0F).copy(alpha = 0.95f), Color.Transparent)
                    } else {
                        listOf(Color(0xFF0F0F0F).copy(alpha = 0.85f), Color.Transparent)
                    }
                )
            )
            .padding(vertical = 24.dp, horizontal = 8.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxHeight(),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.Start
        ) {
            // Top Logo
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(start = 6.dp, bottom = 24.dp)
                    .height(36.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_logo),
                    contentDescription = "Logo",
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(6.dp))
                )
                if (isExpanded) {
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "KHO PHIM",
                        color = NetflixRed,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp
                    )
                }
            }

            // Main Nav Items
            Column(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.weight(1f)
            ) {
                TvNavTab.values().forEach { tab ->
                    val isSelected = tab == selectedTab
                    NetflixNavItem(
                        tab = tab,
                        isSelected = isSelected,
                        isExpanded = isExpanded,
                        focusRequester = if (isSelected) selectedTabFocusRequester else null,
                        onNavigateRight = onNavigateRight,
                        onSelect = {
                            onTabSelected(tab)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun NetflixNavItem(
    tab: TvNavTab,
    isSelected: Boolean,
    isExpanded: Boolean,
    focusRequester: FocusRequester? = null,
    onNavigateRight: (() -> Unit)? = null,
    onSelect: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val bgColor = when {
        isFocused -> Color.White
        isSelected -> NetflixRed.copy(alpha = 0.25f)
        else -> Color.Transparent
    }

    val contentColor = when {
        isFocused -> Color.Black
        isSelected -> NetflixRed
        else -> TextMuted
    }

    Row(
        modifier = Modifier
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .onKeyEvent {
                if (it.type == KeyEventType.KeyDown) {
                    when (it.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            // Cạnh trái: giữ focus ở sidebar, không nhảy ra ngoài
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            onNavigateRight?.invoke()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_CENTER,
                        KeyEvent.KEYCODE_ENTER,
                        KeyEvent.KEYCODE_NUMPAD_ENTER,
                        KeyEvent.KEYCODE_BUTTON_A -> {
                            onSelect()
                            onNavigateRight?.invoke()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onSelect() }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = tab.icon,
            contentDescription = tab.label,
            tint = contentColor,
            modifier = Modifier.size(22.dp)
        )

        if (isExpanded) {
            Spacer(modifier = Modifier.width(14.dp))
            Text(
                text = tab.label,
                color = contentColor,
                fontSize = 14.sp,
                fontWeight = if (isSelected || isFocused) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}
