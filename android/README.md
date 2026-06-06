# Foresight Dispatch — Android app (Person C)

Mock fire-dispatch app for **Foresight for Fires**. Turns the backend's model
recommendations into real dispatch actions: view the incident queue, accept a
pre-position recommendation, and **open Google Maps routing** to the standby
location. Includes scenario test buttons and a native voice assistant.

Kotlin · Jetpack Compose · Retrofit · Android Maps intent · SpeechRecognizer / TextToSpeech.

---

## What it does

1. Select a station (Lewisham / Deptford / New Cross).
2. Pull dispatch state from `GET /api/mobile/state` — available pumps, incident
   queue, and the recommended standby move (grounded in the forecast).
3. **Accept & route** → `POST /api/mobile/accept` → fires a `geo:` Maps intent
   to the destination. **Reject** dismisses the card.
4. Scenario chips ("Bonfire Night", "Two pumps committed", "High wind") →
   `POST /api/ask` → shows + speaks the assistant's answer.
5. Mic button → speech-to-text → `/api/ask` → answer read back via TTS.

## API contract consumed

Mirrors `backend/schemas.py` (frozen). Routes: `GET /api/mobile/state?station=`,
`POST /api/mobile/accept`, `POST /api/ask`. Wire models in
`app/src/main/java/com/foresight/dispatch/data/Models.kt`.

---

## Build & run

Requires Android Studio (Koala+) or the Android SDK + JDK 17.

### Backend base URL

Set in `app/build.gradle.kts` via `API_BASE_URL`:

| Target | URL |
|---|---|
| Emulator (host machine) | `http://10.0.2.2:8000/` (default) |
| Physical device on same Wi-Fi | `http://<your-laptop-LAN-IP>:8000/` |
| DGX Spark on LAN | `http://<spark-ip>:8000/` |

Cleartext HTTP is enabled (`usesCleartextTraffic="true"`) for local demo only.

### Steps

```bash
# 1. start the backend (from repo root)
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 2. open android/ in Android Studio, let Gradle sync, Run 'app'
#    or, with the SDK on PATH and a wrapper generated:
cd android
gradle wrapper          # first time only, to create ./gradlew
./gradlew installDebug  # build + install on a connected device/emulator
```

> No `gradlew` is checked in (binary wrapper jar). Run `gradle wrapper` once, or
> just open the project in Android Studio which provisions it automatically.

### Demo notes

- **Test the Maps intent on a real device** — emulators handle `geo:` URIs
  inconsistently. Google Maps must be installed (the app falls back to any
  `geo:` handler, then toasts if none).
- Grant the microphone permission on first mic tap for voice.
- Keep a backup screen recording of the accept → route flow for the stage.

---

## Structure

```
app/src/main/java/com/foresight/dispatch/
  MainActivity.kt              # wires VM, voice, mic permission, Maps intent
  data/Models.kt               # wire models (mirror backend contract)
  data/ApiService.kt           # Retrofit endpoints
  data/Network.kt              # Retrofit/OkHttp setup
  ui/DispatchViewModel.kt      # state, fetch/accept/reject/ask, scenarios
  ui/DispatchScreen.kt         # Compose UI
  voice/VoiceController.kt      # SpeechRecognizer + TextToSpeech
  voice/SimpleRecognitionListener.kt
```

## Stretch (bounty path)

Swap `VoiceController` for ElevenLabs STT/TTS and point `/api/ask` at a local
NIM/Nemotron agent (coordinate with A & B) — the `onResult`/`speak` seam stays
the same.
