# Foresight Dispatch — Android app (Person C)

Mock fire-dispatch app for a London Fire Brigade station officer. Fetches an AI
recommendation, shows the incident queue, and **Accept opens turn-by-turn routing
in Google Maps**. Three tabs: **Station** (home), **Globe** (3D risk surface),
**Assistant** (ElevenLabs voice).

Built on the backend's `/api/mobile/*` contract — see root `README.md` and
`docs/PERSON_C_android_voice.md`.

## Stack
- Kotlin + Jetpack Compose (Material 3)
- Retrofit + OkHttp + Gson (networking)
- Coil (images)
- AGP 8.13.2 · Kotlin 2.0.21 · Gradle 8.13 · compileSdk 36 · minSdk 26

## Point the app at the backend
Edit the one constant in
`app/src/main/java/com/foresight/dispatch/data/Api.kt`:

```kotlin
object Backend {
    const val BASE_URL = "http://10.0.2.2:8000/"   // emulator → host loopback
}
```

- **Emulator:** `http://10.0.2.2:8000/`
- **Real phone (same Wi-Fi as the laptop):** `http://<LAPTOP_LAN_IP>:8000/`
  Find the IP on the Mac with: `ipconfig getifaddr en0`
  And run the backend bound to all interfaces:
  `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

Cleartext HTTP is enabled (`usesCleartextTraffic="true"`) for local-network dev.

## Build & run

**Android Studio:** open the `android/` folder, let Gradle sync, pick your device, hit **Run**.

**CLI:**
```bash
cd android
./gradlew :app:assembleDebug          # build
./gradlew :app:installDebug           # install on connected device
adb shell am start -n com.foresight.dispatch/.MainActivity
```

Connect a real phone over USB with **USB debugging** enabled (`adb devices` should
list it). The brief warns emulators handle the `geo:` Maps intent inconsistently —
test routing on a real device.

## Status
- [x] 3-tab shell + bottom nav
- [x] Fetch `/api/mobile/state`, render station + recommendation + incident list
- [x] Accept → `/api/mobile/accept` → **Google Maps routing intent** (with fallbacks)
- [ ] Reskin to the "Fire Control" design (`docs/design/`)
- [ ] Globe tab (bespoke Three.js in full-bleed WebView)
- [ ] Assistant tab (ElevenLabs Conversational AI + client tools)
