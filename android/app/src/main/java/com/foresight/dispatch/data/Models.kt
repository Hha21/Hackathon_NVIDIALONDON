package com.foresight.dispatch.data

import com.google.gson.annotations.SerializedName

/**
 * Wire models mirroring the frozen backend contract
 * (backend/schemas.py — Mobile* and Ask* types). Field names match the JSON
 * exactly so the fake -> real data swap needs no client change.
 */

// GET /api/mobile/state ------------------------------------------------------

data class MobileState(
    val station: String,
    @SerializedName("available_pumps") val availablePumps: Int,
    @SerializedName("ongoing_incidents") val ongoingIncidents: List<MobileIncident>,
    val recommendations: List<MobileRecommendation>,
)

data class MobileIncident(
    @SerializedName("incident_id") val incidentId: String,
    val type: String,
    val location: String,
    val status: String,
)

data class MobileRecommendation(
    @SerializedName("recommendation_id") val recommendationId: String,
    val action: String,
    val destination: String,
    val lat: Double,
    val lon: Double,
    val reason: String,
)

// POST /api/mobile/accept ----------------------------------------------------

data class AcceptRequest(
    @SerializedName("recommendation_id") val recommendationId: String,
    val station: String,
    val unit: String,
    val accepted: Boolean,
)

data class AcceptResponse(
    val status: String,
    @SerializedName("routing_uri") val routingUri: String,
)

// POST /api/ask --------------------------------------------------------------

data class AskRequest(val query: String)

data class AskAction(
    val type: String,
    val target: String,
    val confidence: Double,
)

data class AskResponse(
    val answer: String,
    @SerializedName("recommended_actions") val recommendedActions: List<AskAction>,
    @SerializedName("supporting_forecast_ids") val supportingForecastIds: List<String>,
)
