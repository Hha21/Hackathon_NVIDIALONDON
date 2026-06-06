# Android handoff — Foresight Dispatch

Checkpoint state for whoever continues the Android app. Two things to finish:
**(1)** the dispatch Activity (mostly done — polish), **(2)** the **voice agent on
ElevenLabs** (seam is ready, impl is TODO).

Build is green: `cd android && ./gradlew :app:assembleDebug` produces
`app/build/outputs/apk/debug/app-debug.apk`.

---

## What works now

- **Dispatch Activity** (`MainActivity` + `ui/DispatchScreen.kt` + `ui/DispatchViewModel.kt`)
  - Station selector → `GET /api/mobile/state?station=`
  - Incident queue + recommendation card
  - **Accept** → `POST /api/mobile/accept` → fires **turn-by-turn navigation**
    (`google.navigation:`) via `Routing.launch`, with `geo:` pin + generic
    fallbacks. **Reject** dismisses.
  - Scenario chips (Bonfire Night / Two pumps / High wind) → `POST /api/ask`
  - Mic button → STT → `/api/ask` → answer shown + spoken (TTS)
  - Spark status panel
- **Backend routes it drives** (live, in `backend/routes/`): `mobile.py` (state/accept),
  `ask.py`. Run: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.
- **Voice MVP**: native `SpeechRecognizer` + `TextToSpeech` in
  `voice/VoiceController.kt`, behind the `voice/VoiceEngine` interface.

## Architecture (the seams that matter)

```
MainActivity ──uses──> VoiceEngine (interface)      <- swap impl here for ElevenLabs
     │                      └ VoiceController (native, current)
     ├──uses──> Routing.launch(RouteTarget)         <- navigation→geo→generic chain
     └──holds─> DispatchViewModel ──Retrofit──> ApiService ──> FastAPI backend
                     state: DispatchUiState (StateFlow)
```

- Networking: `data/Network.kt` (Retrofit/OkHttp). Base URL = `BuildConfig.API_BASE_URL`
  in `app/build.gradle.kts` (emulator default `http://10.0.2.2:8000/`).
- Wire models: `data/Models.kt` mirror `backend/schemas.py` (frozen contract).

---

## TODO 1 — Voice agent on ElevenLabs (the bounty path)

The whole point of the `VoiceEngine` interface: implement it once, change one line
in `MainActivity`, nothing else moves.

### Step A — make a new engine

Create `voice/ElevenLabsVoiceEngine.kt` implementing `VoiceEngine`:

```kotlin
class ElevenLabsVoiceEngine(
    private val context: Context,
    private val apiKey: String,
    private val voiceId: String,
) : VoiceEngine {
    override val isRecognitionAvailable = true
    override fun listen(onResult: (String) -> Unit, onError: (String) -> Unit) { /* STT, see below */ }
    override fun speak(text: String) { /* TTS, see below */ }
    override fun shutdown() { /* release recorder / player */ }
}
```

### Step B — wire it in

In `MainActivity.onCreate`, replace:

```kotlin
voice = VoiceController(this)
```
with:
```kotlin
voice = ElevenLabsVoiceEngine(this, BuildConfig.ELEVENLABS_API_KEY, BuildConfig.ELEVENLABS_VOICE_ID)
```

Add the keys as `buildConfigField`s in `app/build.gradle.kts` (read from
`local.properties`, do **not** commit the key).

### Step C — the two API calls (REST; no official Android SDK)

ElevenLabs is plain HTTPS — reuse OkHttp. Header `xi-api-key: <key>` on both.

- **TTS** (text → speech):
  `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
  body `{"text": "...", "model_id": "eleven_turbo_v2_5"}`, returns audio
  (mpeg). For `speak()`: write the bytes to a temp file or feed the response
  stream to `MediaPlayer`/`ExoPlayer`. Use the `/stream` variant for low latency.
- **STT** (speech → text):
  `POST https://api.elevenlabs.io/v1/speech-to-text` (model `scribe_v1`),
  multipart with the recorded audio file. For `listen()`: record mic with
  `MediaRecorder`/`AudioRecord` → POST → `onResult(transcript)`.

> Verify exact endpoint paths / model IDs against current ElevenLabs docs before
> coding — they move. The interface contract above is what the app depends on;
> match it and the rest of the app is untouched.

### Step D — keep the answer loop

`MainActivity` already: mic → `vm.ask(transcript)` → backend `/api/ask` → the
collector speaks the answer via `voice.speak(...)`. So once STT returns a
transcript and TTS plays bytes, the full loop works with no other changes.
Add `RECORD_AUDIO` is already in the manifest; add `INTERNET` is too.

### Stretch
- Persistent session log for the 1h11m bounty (log each query/answer/timestamp).
- Local NIM/Nemotron behind `/api/ask` (coordinate with A & B; backend change, not Android).

## TODO 2 — Activity polish (optional)
- Confirm navigation intent on a **real device** (emulators flaky on `geo:`/`google.navigation:`).
- Add a "routing started" toast/confirmation; show which mode fired (`Routing.launch` returns it).
- Loading/empty states are basic — improve if time.

---

## Build / run quickref

```bash
# backend (repo root)
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# android
cd android
./gradlew :app:assembleDebug      # or open in Android Studio and Run 'app'
./gradlew installDebug            # install on connected device/emulator
```

Base URL per target in `android/README.md`. `gradlew` wrapper is committed
(Gradle 8.9); `local.properties` (SDK path) is local-only and gitignored.
