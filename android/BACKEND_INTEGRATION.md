# Foresight Dispatch — Android ↔ Backend Integration

How the Android app is built, what each feature does, and exactly what it expects
from the backend. This is the contract between the app (Person C) and the API
(Person B). If the API matches the shapes below, the app "just works."

---

## Architecture in one paragraph

The Android app is a **native Kotlin shell hosting a full-screen WebView**
(`MainActivity.kt`). The entire UI is a self-contained web bundle in
`app/src/main/assets/web/app.html` (React + MapLibre, all inlined). Native
capabilities the web layer can't reach — HTTP without mixed-content/CORS pain,
Google Maps intents, the browser, native toasts — are exposed through a small
JavaScript bridge object called `window.Android` (implemented by `WebBridge` in
`MainActivity.kt`). So: **UI is web, network + OS actions are native.**

```
React UI (assets/web/*.jsx)
   │  window.Android.*  (JS bridge)
   ▼
WebBridge (MainActivity.kt, OkHttp)
   │  HTTP
   ▼
Backend  (FastAPI)  GET /api/mobile/state   POST /api/mobile/accept
```

---

## Backend host configuration

The bridge tries a list of base URLs **in order** and uses the first that
responds (so a single APK works on the emulator and on a real phone):

`MainActivity.kt → WebBridge.baseUrls`
```kotlin
private val baseUrls = listOf(
    "http://10.0.2.2:8000/",       // Android emulator → host machine loopback
    "http://192.168.1.113:8000/",  // real phone → laptop LAN IP (change per network)
)
```

- **Emulator:** `10.0.2.2` is the emulator's alias for the host machine. Run the
  backend on the laptop with `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.
- **Real phone:** must be on the **same Wi-Fi** as the laptop; set the second
  entry to the laptop's LAN IP (`ipconfig getifaddr en0` on macOS).
- Cleartext HTTP is allowed via `android:usesCleartextTraffic="true"` in the
  manifest (the backend is plain `http`, not `https`).
- API calls use a short-timeout client (4 s connect / 6 s read) so a dead host
  fails fast and the app falls back to demo data quickly.

---

## Endpoints consumed

### 1. `GET /api/mobile/state?station=Lewisham`

Drives the **Home / Station** tab: the station header and the recommendation card.

**Expected response** (matches `backend/schemas.py` / `data/Models.kt`):
```json
{
  "station": "Lewisham",
  "available_pumps": 1,
  "ongoing_incidents": [
    { "incident_id": "inc_001", "type": "road_traffic_collision",
      "location": "Forest Hill", "status": "active" }
  ],
  "recommendations": [
    { "recommendation_id": "rec_E05009322", "action": "pre_position",
      "destination": "Brockley", "lat": 51.464, "lon": -0.036,
      "reason": "Predicted false alarm risk spike around 06:00 (risk 0.39)." }
  ]
}
```

What the app reads from it:
| UI element | Field |
|---|---|
| Station name | `station` |
| "Pumps free" chip | `available_pumps` |
| Recommendation title `→ {dest}` | `recommendations[0].destination` |
| Route map destination | `recommendations[0].lat`, `.lon` |
| Reason sentence | `recommendations[0].reason` |
| Risk pill + "Risk" chip | parsed from `reason` via `risk (\d.\d+)` → falls back to 0.78 |

> The risk **score** is currently scraped from the `reason` string. If you want it
> exact, add a numeric `risk_score` field to `MobileRecommendation` and we'll read
> it directly. `action` and `ongoing_incidents` are received but not yet rendered
> (incidents shown on Home come from live news — see below).

### 2. `POST /api/mobile/accept`

Fires when the officer taps **Accept & route** on the recommendation card.

**Request body** (`data/Models.kt → AcceptRequest`):
```json
{ "recommendation_id": "rec_E05009322", "station": "Lewisham",
  "unit": "P1", "accepted": true }
```

**Expected response** (`AcceptResponse`):
```json
{ "status": "accepted", "routing_uri": "geo:51.464,-0.036?q=51.464,-0.036(Brockley standby position)" }
```

The app parses the `geo:lat,lon` out of `routing_uri` and opens **Google Maps
turn-by-turn navigation** to that point. If `routing_uri` is missing/unparseable
it falls back to the recommendation's own `lat`/`lon`.

---

## Graceful fallback (the important bit)

Every backend call is **non-blocking and fail-safe**:

- `GET /state` fails or times out → the Station card shows **demo data**
  (Lewisham, Brockley, risk 0.78) **and a native toast appears: "Live data
  unavailable — showing demo data."**
- `POST /accept` fails → the app still opens Maps to the recommendation coords
  and toasts "Accept not confirmed by server — routing anyway."

So the app is **always demoable**, with or without a server, and it's always
obvious to the user which mode they're in.

---

## Feature-by-feature

| Feature | Tab | Data source | Backend? |
|---|---|---|---|
| Station header + recommendation | Home | `GET /api/mobile/state` | **Yes** |
| Accept → Google Maps routing | Home | `POST /api/mobile/accept` | **Yes** |
| Active Nearby (incident feed) | Home | Google News RSS (London fire/crash) via `WebBridge.fetchNews()` | No (live external) |
| 3D ward risk globe + time scrubber | Globe | **Client-side** ward list + simulated hourly curve | No — see below |
| Voice assistant (orb) | Assistant | **ElevenLabs** real-time agent (`agent_1001ktee37rcfy69khepf9j23cdf`) | No (ElevenLabs) |
| Location card on agent reply | Assistant | Detects a ward name in the agent's reply, shows its map card | No |

### Not yet backend-wired (by design / scope)
- **Globe forecast:** the globe uses a hardcoded ward list (`WARDS` in
  `hf-map.jsx`) with a client-side hourly risk simulation. The mobile contract
  (`/state`) only returns the single top recommendation, not the full per-ward,
  per-hour forecast. To make the globe live, expose the forecast (e.g.
  `GET /api/forecast` returning `wards[].hourly[]`) and we'll consume it the same
  way as `/state`.
- **Crew count:** shown as a static `5` (not part of the mobile contract). Add to
  `MobileState` if it should be live.

---

## The JS bridge surface (`window.Android`)

Implemented in `MainActivity.kt → WebBridge`, wrapped with Promises in
`assets/web/bridge.js`:

| JS call | Native method | Purpose |
|---|---|---|
| `window.loadState(station)` → `{ok,data}` | `fetchState` | GET /state |
| `window.acceptRecommendation(recId,station,unit)` → `{ok,data}` | `acceptRec` | POST /accept |
| `window.loadNews()` → `[{title,url,domain,seendate}]` | `fetchNews` | Google News RSS |
| `window.routeTo(label,lat,lon)` | `openMaps` | Google Maps directions |
| `window.routeByName(name)` | `openMapsQuery` | Maps directions by place name |
| `window.openArticle(url)` | `openUrl` | Open a news link |
| `window.toast(msg)` | `toast` | Native toast (fallback notices) |

---

## Running it end-to-end

```bash
# 1. Backend (from repo root)
uvicorn backend.main:app --host 0.0.0.0 --port 8000
#    (serves real data if outputs/forecast_24h.json exists, else a static mock)

# 2. App on the emulator
./android/gradlew -p android :app:installDebug
#    Home tab → card reflects /state; Accept → Maps via /accept.
#    Kill the backend → relaunch → demo data + "Live data unavailable" toast.
```

Rebuilding the web bundle after editing `assets/web/*.jsx` or `*.css`:
`bash /tmp/fdbuild/build_html.sh` (transpiles JSX and reassembles `app.html`).
