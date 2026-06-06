package com.foresight.dispatch

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/**
 * Opens turn-by-turn routing to a destination — the core "money shot" of the demo.
 *
 * Strategy (most reliable first):
 *  1. google.navigation: → Google Maps turn-by-turn navigation.
 *  2. the backend-supplied geo: routing_uri (or one we build from lat/lon).
 *  3. a plain https Google Maps web URL (always resolves to a browser).
 */
object MapsLauncher {

    fun route(
        context: Context,
        lat: Double,
        lon: Double,
        label: String,
        routingUri: String? = null,
    ) {
        val attempts = buildList {
            // 1. Google Maps navigation intent (turn-by-turn).
            add(Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lon")).apply {
                setPackage("com.google.android.apps.maps")
            })
            // 2. geo: URI (backend's routing_uri if present, else built locally).
            val geo = routingUri?.takeIf { it.startsWith("geo:") }
                ?: "geo:$lat,$lon?q=$lat,$lon(${Uri.encode(label)})"
            add(Intent(Intent.ACTION_VIEW, Uri.parse(geo)))
            // 3. Web fallback — guaranteed to resolve.
            add(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lon")
                )
            )
        }

        for (intent in attempts) {
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                return
            }
        }
        Toast.makeText(context, "No app available to open the map.", Toast.LENGTH_SHORT).show()
    }

    /** Route to a place by name/address (used when we have no coordinates, e.g. a ward name). */
    fun routeQuery(context: Context, query: String) {
        val q = Uri.encode(query)
        val attempts = listOf(
            Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$q")).apply {
                setPackage("com.google.android.apps.maps")
            },
            Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=$q")),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$q")),
        )
        for (intent in attempts) {
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                return
            }
        }
        Toast.makeText(context, "No app available to open the map.", Toast.LENGTH_SHORT).show()
    }
}
