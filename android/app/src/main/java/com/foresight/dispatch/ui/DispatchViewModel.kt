package com.foresight.dispatch.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.foresight.dispatch.data.AcceptRequest
import com.foresight.dispatch.data.AskRequest
import com.foresight.dispatch.data.MobileRecommendation
import com.foresight.dispatch.data.MobileState
import com.foresight.dispatch.data.Network
import com.foresight.dispatch.data.RouteTarget
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

val STATIONS = listOf("Lewisham", "Deptford", "New Cross")

/** Canned scenario probes — drive /api/ask so the demo shows reasoning. */
data class Scenario(val label: String, val query: String)

val SCENARIOS = listOf(
    Scenario("Bonfire Night", "It's Bonfire Night in Lewisham, where should I pre-position the standby pump?"),
    Scenario("Two pumps committed", "Two pumps are committed in Lewisham, where should the standby go?"),
    Scenario("High wind", "High wind is forecast over Lewisham tonight, where is outdoor fire risk highest?"),
)

data class DispatchUiState(
    val station: String = STATIONS.first(),
    val loading: Boolean = false,
    val state: MobileState? = null,
    val rejected: Set<String> = emptySet(),
    val scenarioAnswer: String? = null,
    val transcript: String? = null,
    val error: String? = null,
    /** Set after a successful accept; the Activity consumes it to fire the routing intent. */
    val pendingRoute: RouteTarget? = null,
)

class DispatchViewModel : ViewModel() {
    private val _ui = MutableStateFlow(DispatchUiState())
    val ui: StateFlow<DispatchUiState> = _ui.asStateFlow()

    init {
        refresh()
    }

    fun selectStation(station: String) {
        _ui.update { it.copy(station = station) }
        refresh()
    }

    fun refresh() {
        val station = _ui.value.station
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val state = Network.api.getState(station)
                _ui.update { it.copy(loading = false, state = state, rejected = emptySet()) }
            } catch (e: Exception) {
                _ui.update { it.copy(loading = false, error = "Could not reach backend: ${e.message}") }
            }
        }
    }

    fun reject(rec: MobileRecommendation) {
        _ui.update { it.copy(rejected = it.rejected + rec.recommendationId) }
    }

    fun accept(rec: MobileRecommendation, unit: String = "Pump 1") {
        val station = _ui.value.station
        _ui.update { it.copy(error = null) }
        viewModelScope.launch {
            try {
                val resp = Network.api.accept(
                    AcceptRequest(
                        recommendationId = rec.recommendationId,
                        station = station,
                        unit = unit,
                        accepted = true,
                    )
                )
                // Use the recommendation's coords for turn-by-turn; keep the
                // server's geo: URI as a fallback target.
                val target = RouteTarget(
                    lat = rec.lat,
                    lon = rec.lon,
                    label = rec.destination,
                    serverUri = resp.routingUri.ifBlank { null },
                )
                _ui.update { it.copy(pendingRoute = target) }
            } catch (e: Exception) {
                // Still let the user route even if the POST fails — build locally.
                val target = RouteTarget(rec.lat, rec.lon, rec.destination)
                _ui.update {
                    it.copy(
                        pendingRoute = target,
                        error = "Accept POST failed (${e.message}); routing locally.",
                    )
                }
            }
        }
    }

    fun consumeRoute() {
        _ui.update { it.copy(pendingRoute = null) }
    }

    fun runScenario(scenario: Scenario) {
        ask(scenario.query)
    }

    /** Shared by scenario buttons and the voice interface. */
    fun ask(query: String) {
        _ui.update { it.copy(loading = true, error = null, transcript = query) }
        viewModelScope.launch {
            try {
                val resp = Network.api.ask(AskRequest(query))
                _ui.update { it.copy(loading = false, scenarioAnswer = resp.answer) }
            } catch (e: Exception) {
                _ui.update { it.copy(loading = false, error = "Ask failed: ${e.message}") }
            }
        }
    }

    fun clearScenarioAnswer() {
        _ui.update { it.copy(scenarioAnswer = null, transcript = null) }
    }
}
