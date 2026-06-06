package com.foresight.dispatch.data

/**
 * A resolved destination to route to. [serverUri] is the `geo:` URI the backend
 * returned on accept (if any); [lat]/[lon]/[label] let us build a turn-by-turn
 * navigation intent client-side. See [com.foresight.dispatch.Routing].
 */
data class RouteTarget(
    val lat: Double,
    val lon: Double,
    val label: String,
    val serverUri: String? = null,
)
