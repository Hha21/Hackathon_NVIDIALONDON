package com.foresight.dispatch.ui.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.foresight.dispatch.data.AcceptRequest
import com.foresight.dispatch.data.ApiClient
import com.foresight.dispatch.data.MobileRecommendation
import com.foresight.dispatch.data.MobileState
import kotlinx.coroutines.launch

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Error(val message: String) : HomeUiState
    data class Ready(val state: MobileState) : HomeUiState
}

/** Where the accepted route should be opened (the screen owns the Context to launch it). */
data class RouteTarget(
    val lat: Double,
    val lon: Double,
    val label: String,
    val routingUri: String?,
)

class HomeViewModel : ViewModel() {

    var station: String = "Lewisham"
        private set

    var uiState by mutableStateOf<HomeUiState>(HomeUiState.Loading)
        private set

    /** Recommendation ids the officer has accepted (for the "en route" UI state). */
    var acceptedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    /** Recommendation ids the officer has declined (dismissed from view). */
    var dismissedIds by mutableStateOf<Set<String>>(emptySet())
        private set

    fun decline(rec: MobileRecommendation) {
        dismissedIds = dismissedIds + rec.recommendationId
    }

    init {
        refresh()
    }

    fun refresh() {
        uiState = HomeUiState.Loading
        viewModelScope.launch {
            uiState = try {
                HomeUiState.Ready(ApiClient.api.getState(station))
            } catch (e: Exception) {
                HomeUiState.Error(e.message ?: "Can't reach control.")
            }
        }
    }

    /**
     * Accept a recommendation: tell the backend, then hand the route back to the
     * screen to launch Maps. Falls back to the recommendation's own coordinates if
     * the accept call fails, so the demo's routing always fires.
     */
    fun accept(rec: MobileRecommendation, onRoute: (RouteTarget) -> Unit) {
        viewModelScope.launch {
            val target = try {
                val resp = ApiClient.api.accept(
                    AcceptRequest(
                        recommendationId = rec.recommendationId,
                        station = station,
                        unit = "Pump 1",
                        accepted = true,
                    )
                )
                RouteTarget(rec.lat, rec.lon, "${rec.destination} standby", resp.routingUri)
            } catch (e: Exception) {
                RouteTarget(rec.lat, rec.lon, "${rec.destination} standby", null)
            }
            acceptedIds = acceptedIds + rec.recommendationId
            onRoute(target)
        }
    }
}
