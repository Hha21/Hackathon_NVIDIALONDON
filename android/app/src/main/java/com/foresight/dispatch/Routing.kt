package com.foresight.dispatch

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.foresight.dispatch.data.RouteTarget

/**
 * Launches map routing for a [RouteTarget] through a fallback chain, so the
 * demo's "Accept → route" always fires something:
 *
 *  1. `google.navigation:q=lat,lon` in Google Maps — turn-by-turn directions
 *     (the operational money shot for a dispatcher).
 *  2. `geo:` pin (server-provided URI, else built from lat/lon) in Google Maps.
 *  3. Same `geo:` URI handed to ANY app that resolves it (e.g. a browser).
 *
 * Returns the human-readable mode used, or null if nothing could handle it.
 */
object Routing {

    private const val MAPS_PKG = "com.google.android.apps.maps"

    fun launch(context: Context, target: RouteTarget): String? {
        val geoUri = target.serverUri?.takeIf { it.isNotBlank() } ?: buildGeoUri(target)

        // 1. Turn-by-turn navigation in Google Maps.
        val navUri = "google.navigation:q=${target.lat},${target.lon}&mode=d"
        if (tryStart(context, navUri, MAPS_PKG)) return "navigation"

        // 2. Map pin in Google Maps.
        if (tryStart(context, geoUri, MAPS_PKG)) return "map pin (Google Maps)"

        // 3. Any geo: handler.
        if (tryStart(context, geoUri, null)) return "map pin"

        return null
    }

    fun buildGeoUri(target: RouteTarget): String =
        "geo:${target.lat},${target.lon}?q=${target.lat},${target.lon}(${target.label})"

    private fun tryStart(context: Context, uri: String, pkg: String?): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
            if (pkg != null) setPackage(pkg)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (intent.resolveActivity(context.packageManager) == null) return false
        return try {
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }
}
