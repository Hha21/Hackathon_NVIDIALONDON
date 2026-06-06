package com.foresight.dispatch.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.foresight.dispatch.data.MobileIncident
import com.foresight.dispatch.data.MobileRecommendation
import com.foresight.dispatch.data.MobileState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DispatchScreen(
    ui: DispatchUiState,
    onSelectStation: (String) -> Unit,
    onRefresh: () -> Unit,
    onAccept: (MobileRecommendation) -> Unit,
    onReject: (MobileRecommendation) -> Unit,
    onScenario: (Scenario) -> Unit,
    onMic: () -> Unit,
    onDismissAnswer: () -> Unit,
    micAvailable: Boolean,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Foresight Dispatch") },
                actions = {
                    if (micAvailable) {
                        IconButton(onClick = onMic) {
                            Icon(Icons.Filled.Mic, contentDescription = "Ask by voice")
                        }
                    }
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StationSelector(ui.station, onSelectStation)

            if (ui.loading) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.height(20.dp))
                    Spacer(Modifier.fillMaxWidth(0.05f))
                    Text("Working…", style = MaterialTheme.typography.bodyMedium)
                }
            }

            ui.error?.let { ErrorBanner(it) }

            ui.state?.let { state -> StateSection(state, ui.rejected, onAccept, onReject) }

            ScenarioRow(onScenario)

            ui.scenarioAnswer?.let { answer ->
                AnswerCard(transcript = ui.transcript, answer = answer, onDismiss = onDismissAnswer)
            }

            SparkPanel()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StationSelector(station: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text("Station", style = MaterialTheme.typography.labelMedium)
        OutlinedButton(onClick = { expanded = true }) {
            Text(station)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            STATIONS.forEach { s ->
                DropdownMenuItem(
                    text = { Text(s) },
                    onClick = {
                        expanded = false
                        onSelect(s)
                    },
                )
            }
        }
    }
}

@Composable
private fun StateSection(
    state: MobileState,
    rejected: Set<String>,
    onAccept: (MobileRecommendation) -> Unit,
    onReject: (MobileRecommendation) -> Unit,
) {
    Text(
        "${state.station} · ${state.availablePumps} pump(s) available",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
    )

    Text("Incident queue", style = MaterialTheme.typography.titleSmall)
    if (state.ongoingIncidents.isEmpty()) {
        Text("No active incidents.", style = MaterialTheme.typography.bodyMedium)
    } else {
        state.ongoingIncidents.forEach { IncidentRow(it) }
    }

    Spacer(Modifier.height(4.dp))
    Text("Recommendations", style = MaterialTheme.typography.titleSmall)
    val active = state.recommendations.filterNot { rejected.contains(it.recommendationId) }
    if (active.isEmpty()) {
        Text("No outstanding recommendations.", style = MaterialTheme.typography.bodyMedium)
    } else {
        active.forEach { rec ->
            RecommendationCard(rec, onAccept = { onAccept(rec) }, onReject = { onReject(rec) })
        }
    }
}

@Composable
private fun IncidentRow(incident: MobileIncident) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(
                incident.type.replace('_', ' ').replaceFirstChar { it.uppercase() },
                fontWeight = FontWeight.Medium,
            )
            Text(incident.location, style = MaterialTheme.typography.bodyMedium)
            AssistChip(onClick = {}, label = { Text(incident.status) })
        }
    }
}

@Composable
private fun RecommendationCard(
    rec: MobileRecommendation,
    onAccept: () -> Unit,
    onReject: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "${rec.action.replace('_', ' ').replaceFirstChar { it.uppercase() }} → ${rec.destination}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(rec.reason, style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onAccept) { Text("Accept & route") }
                TextButton(onClick = onReject) { Text("Reject") }
            }
        }
    }
}

@Composable
private fun ScenarioRow(onScenario: (Scenario) -> Unit) {
    Spacer(Modifier.height(4.dp))
    Text("Scenario tests", style = MaterialTheme.typography.titleSmall)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SCENARIOS.forEach { scenario ->
            FilterChip(
                selected = false,
                onClick = { onScenario(scenario) },
                label = { Text(scenario.label) },
            )
        }
    }
}

@Composable
private fun AnswerCard(transcript: String?, answer: String, onDismiss: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            transcript?.let {
                Text("\"$it\"", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
            }
            Text(answer, style = MaterialTheme.typography.bodyMedium)
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
        ),
    ) {
        Text(
            message,
            modifier = Modifier.padding(12.dp),
            color = MaterialTheme.colorScheme.onErrorContainer,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun SparkPanel() {
    Spacer(Modifier.height(8.dp))
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("Running locally on DGX Spark", fontWeight = FontWeight.SemiBold)
            Text("Inference: CUDA/PyTorch · Cloud calls: none", style = MaterialTheme.typography.bodySmall)
        }
    }
}
