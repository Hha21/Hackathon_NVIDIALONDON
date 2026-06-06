package com.foresight.dispatch

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * Hosts the bundled "Fire Control" design (assets/web/) in a full-screen, chrome-less
 * WebView. Assets are served via WebViewAssetLoader over https://appassets.androidplatform.net
 * (avoids file:// subresource restrictions). A small JS bridge ("Android") wires the
 * design's Accept / "Route here" actions to the real Google Maps intent via [MapsLauncher];
 * the Assistant tab runs the ElevenLabs voice agent (needs the microphone).
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Ask for mic (voice agent) + location (route from current position) up front.
        val needed = arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.ACCESS_FINE_LOCATION)
            .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isNotEmpty()) ActivityCompat.requestPermissions(this, needed.toTypedArray(), 1)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        hideSystemBars()

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0A0B0D"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
            }
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    android.util.Log.d("WebView", "${m.message()} @${m.sourceId()}:${m.lineNumber()}")
                    return true
                }

                // Grant the page's getUserMedia (mic) request — needed by ElevenLabs.
                override fun onPermissionRequest(request: PermissionRequest) {
                    val wanted = request.resources.filter {
                        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                    }.toTypedArray()
                    request.grant(wanted)
                }

                // Grant the page's Geolocation request — needed for the route's "you" position.
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?,
                ) {
                    callback?.invoke(origin, true, false)
                }
            }
            addJavascriptInterface(WebBridge(this@MainActivity, this), "Android")
        }
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/web/app.html")
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}

/** JS-callable bridge. Methods run on a binder thread, so hop to the UI thread to launch. */
class WebBridge(private val activity: Activity, private val web: WebView) {
    private val http = okhttp3.OkHttpClient.Builder()
        .connectTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    @JavascriptInterface
    fun openMaps(lat: Double, lon: Double, label: String) {
        activity.runOnUiThread { MapsLauncher.route(activity, lat, lon, label) }
    }

    @JavascriptInterface
    fun openMapsQuery(query: String) {
        activity.runOnUiThread { MapsLauncher.routeQuery(activity, query) }
    }

    /** Open a news article URL in the browser. */
    @JavascriptInterface
    fun openUrl(url: String) {
        activity.runOnUiThread {
            try {
                activity.startActivity(
                    android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: Exception) {}
        }
    }

    /** Fetch live London fire-related news from GDELT (server-side to dodge CORS),
     *  then hand the raw JSON back to the page via window.__onNews({raw}). */
    @JavascriptInterface
    fun fetchNews() {
        Thread {
            // Google News RSS — UK-localized, London fire/accident, last 2 days (reliable, no key).
            val xml = try {
                val q = java.net.URLEncoder.encode("London (fire OR blaze OR \"fire brigade\" OR crash OR rescue OR explosion) when:2d", "UTF-8")
                val url = "https://news.google.com/rss/search?q=$q&hl=en-GB&gl=GB&ceid=GB:en"
                val req = okhttp3.Request.Builder().url(url).header("User-Agent", "Mozilla/5.0 (Linux; Android) ForesightDispatch").build()
                http.newCall(req).execute().use { it.body?.string() ?: "" }
            } catch (e: Exception) { android.util.Log.w("FDNews", "fetch failed: $e"); "" }

            val arr = org.json.JSONArray()
            try {
                val itemRe = Regex("<item>(.*?)</item>", RegexOption.DOT_MATCHES_ALL)
                val titleRe = Regex("<title>(.*?)</title>", RegexOption.DOT_MATCHES_ALL)
                val linkRe = Regex("<link>(.*?)</link>", RegexOption.DOT_MATCHES_ALL)
                val dateRe = Regex("<pubDate>(.*?)</pubDate>", RegexOption.DOT_MATCHES_ALL)
                val srcRe = Regex("<source[^>]*>(.*?)</source>", RegexOption.DOT_MATCHES_ALL)
                fun unesc(s: String) = s.replace("<![CDATA[", "").replace("]]>", "")
                    .replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"")
                    .replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").trim()
                val outF = java.text.SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", java.util.Locale.ENGLISH)
                    .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                val inF = java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", java.util.Locale.ENGLISH)
                for (m in itemRe.findAll(xml).take(12)) {
                    val b = m.groupValues[1]
                    var title = unesc(titleRe.find(b)?.groupValues?.get(1) ?: "")
                    val link = unesc(linkRe.find(b)?.groupValues?.get(1) ?: "")
                    val src = unesc(srcRe.find(b)?.groupValues?.get(1) ?: "")
                    if (src.isNotEmpty() && title.endsWith(" - $src")) title = title.removeSuffix(" - $src")
                    val seen = try { outF.format(inF.parse(dateRe.find(b)?.groupValues?.get(1) ?: "")) } catch (e: Exception) { "" }
                    if (title.isNotEmpty() && link.isNotEmpty())
                        arr.put(org.json.JSONObject().put("title", title).put("url", link).put("domain", src).put("seendate", seen))
                }
            } catch (e: Exception) { android.util.Log.w("FDNews", "parse failed: $e") }

            android.util.Log.w("FDNews", "items=${arr.length()} xmlLen=${xml.length}")
            val raw = org.json.JSONObject().put("articles", arr).toString()
            val payload = org.json.JSONObject().put("raw", raw).toString()
            activity.runOnUiThread { web.evaluateJavascript("window.__onNews && window.__onNews($payload)", null) }
        }.start()
    }
}
