package com.foresight.dispatch.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.foresight.dispatch.MapsLauncher
import com.foresight.dispatch.data.MobileIncident
import com.foresight.dispatch.data.MobileRecommendation
import com.foresight.dispatch.data.MobileState

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    vm: HomeViewModel = viewModel(),
) {
    when (val state = vm.uiState) {
        is HomeUiState.Loading -> CenterBox(modifier) { CircularProgressIndicator() }
        is HomeUiState.Error -> CenterBox(modifier) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Can't reach control", style = MaterialTheme.typography.titleMedium)
                Text(state.message, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
                Button(onClick = vm::refresh) { Text("Retry") }
            }
        }
        is HomeUiState.Ready -> Ready(modifier, state.state, vm)
    }
}

@Composable
private fun Ready(modifier: Modifier, s: MobileState, vm: HomeViewModel) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StationHeader(s)
        SectionLabel("RECOMMENDATION")
        val visible = s.recommendations.filter { it.recommendationId !in vm.dismissedIds }
        if (visible.isEmpty()) {
            Text("No standby moves advised. Holding position.")
        } else {
            visible.forEach { rec ->
                RecommendationCard(rec, accepted = rec.recommendationId in vm.acceptedIds, vm = vm)
            }
        }
        SectionLabel("ACTIVE NEARBY")
        if (s.ongoingIncidents.isEmpty()) {
            Text("No active incidents — all clear.")
        } else {
            s.ongoingIncidents.forEach { IncidentRow(it) }
        }
    }
}

@Composable
private fun StationHeader(s: MobileState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("STATION", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(s.station, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                "PUMPS FREE · ${s.availablePumps}",
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RecommendationCard(
    rec: MobileRecommendation,
    accepted: Boolean,
    vm: HomeViewModel,
) {
    val context = LocalContext.current
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "${rec.action.uppercase().replace('_', ' ')} → ${rec.destination}",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(rec.reason, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "${rec.lat}, ${rec.lon}",
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            if (accepted) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("✓ En route to ${rec.destination}", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.fillMaxWidth(0.05f))
                    OutlinedButton(onClick = {
                        MapsLauncher.route(context, rec.lat, rec.lon, rec.destination)
                    }) { Text("Reopen map") }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = {
                            vm.accept(rec) { t ->
                                MapsLauncher.route(context, t.lat, t.lon, t.label, t.routingUri)
                            }
                        }
                    ) { Text("ACCEPT") }
                    OutlinedButton(onClick = { vm.decline(rec) }) {
                        Text("Decline")
                    }
                }
            }
        }
    }
}

@Composable
private fun IncidentRow(i: MobileIncident) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(i.type.replace('_', ' '), fontWeight = FontWeight.SemiBold)
            Text(
                "${i.location} · ${i.status}",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun CenterBox(modifier: Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
