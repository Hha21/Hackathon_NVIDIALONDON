package com.foresight.dispatch.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.foresight.dispatch.ui.home.HomeScreen

private enum class Tab(val label: String, val icon: ImageVector) {
    Station("Station", Icons.Filled.LocalFireDepartment),
    Globe("Globe", Icons.Filled.Public),
    Assistant("Assistant", Icons.Filled.GraphicEq),
}

@Composable
fun MainScreen() {
    var selected by remember { mutableStateOf(Tab.Station) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selected == tab,
                        onClick = { selected = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        }
    ) { inner ->
        when (selected) {
            Tab.Station -> HomeScreen(modifier = Modifier.padding(inner))
            Tab.Globe -> Placeholder("Globe", "3D risk surface — design incoming.", Modifier.padding(inner))
            Tab.Assistant -> Placeholder("Assistant", "ElevenLabs voice agent — wiring next.", Modifier.padding(inner))
        }
    }
}

@Composable
private fun Placeholder(title: String, subtitle: String, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title)
        Text(subtitle)
    }
}
