package com.phimmoitv.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phimmoitv.app.R
import com.phimmoitv.app.ui.theme.DarkSurface
import com.phimmoitv.app.ui.theme.OrangePrimary
import com.phimmoitv.app.ui.theme.TextMuted
import com.phimmoitv.app.ui.theme.TextWhite

enum class TvNavTab(val label: String, val icon: ImageVector) {
    HOME("Trang Chủ", Icons.Default.Home),
    HISTORY("Đã Xem", Icons.Default.History),
    SINGLE("Phim Lẻ", Icons.Default.Movie),
    SERIES("Phim Bộ", Icons.Default.Tv),
    THEATER("Chiếu Rạp", Icons.Default.Theaters),
    SEARCH("Tìm Kiếm", Icons.Default.Search),
    SETTINGS("Cài Đặt", Icons.Default.Settings)
}

@Composable
fun TvNavBar(
    selectedTab: TvNavTab,
    onTabSelected: (TvNavTab) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(DarkSurface)
            .padding(horizontal = 24.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // App Brand: Logo + Kho Phim
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(end = 24.dp)
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_logo),
                contentDescription = "Kho Phim Logo",
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(6.dp))
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "Kho Phim",
                color = OrangePrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = " TV",
                color = TextWhite,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // Nav tabs
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            TvNavTab.values().forEach { tab ->
                val isSelected = tab == selectedTab
                TvNavItem(
                    tab = tab,
                    isSelected = isSelected,
                    onSelect = { onTabSelected(tab) }
                )
            }
        }
    }
}

@Composable
private fun TvNavItem(
    tab: TvNavTab,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.08f else 1.0f,
        label = "NavItemScale"
    )

    val bgColor = when {
        isFocused -> OrangePrimary
        isSelected -> OrangePrimary.copy(alpha = 0.2f)
        else -> Color.Transparent
    }

    val contentColor = when {
        isFocused -> Color.White
        isSelected -> OrangePrimary
        else -> TextMuted
    }

    Row(
        modifier = Modifier
            .scale(scale)
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .border(
                border = if (isFocused) BorderStroke(2.dp, Color.White) else BorderStroke(0.dp, Color.Transparent),
                shape = RoundedCornerShape(6.dp)
            )
            .clickable(interactionSource = interactionSource, indication = null) { onSelect() }
            .focusable(interactionSource = interactionSource)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = tab.icon,
            contentDescription = tab.label,
            tint = contentColor,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = tab.label,
            color = contentColor,
            fontSize = 13.sp,
            fontWeight = if (isSelected || isFocused) FontWeight.Bold else FontWeight.Normal
        )
    }
}
