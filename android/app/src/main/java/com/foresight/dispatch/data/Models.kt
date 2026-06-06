package com.foresight.dispatch.data

import com.google.gson.annotations.SerializedName

/**
 * Wire models mirroring the backend's mobile contract (backend/schemas.py).
 * Field names use @SerializedName so the JSON stays snake_case while Kotlin
 * stays camelCase. Both fake and real backend payloads validate against these.
 */

data class MobileState(
    val station: String = "",
    @SerializedName("available_pumps") val availablePumps: Int = 0,
    @SerializedName("ongoing_incidents") val ongoingIncidents: List<MobileIncident> = emptyList(),
    val recommendations: List<MobileRecommendation> = emptyList(),
)

data class MobileIncident(
    @SerializedName("incident_id") val incidentId: String = "",
    val type: String = "",
    val location: String = "",
    val status: String = "",
)

data class MobileRecommendation(
    @SerializedName("recommendation_id") val recommendationId: String = "",
    val action: String = "",
    val destination: String = "",
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val reason: String = "",
)

data class AcceptRequest(
    @SerializedName("recommendation_id") val recommendationId: String,
    val station: String,
    val unit: String,
    val accepted: Boolean,
)

data class AcceptResponse(
    val status: String = "",
    @SerializedName("routing_uri") val routingUri: String = "",
)
