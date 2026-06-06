# Person C — Android + Dispatch / Voice Lead

**Mission:** make the system feel *operational*. You build the Android mock-dispatch app that turns model recommendations into real dispatch actions (accept → open Maps routing), plus the optional voice interface. You build against Person B's **fake backend from Hour 2** — never wait for the real model.

> See the root [`README.md`](../README.md) for shared data contracts and the full execution timeline.

---

## What you own

- Android mobile app (Kotlin + Jetpack Compose).
- Mock dispatch workflow: incident queue, recommendation card, accept/reject.
- Android Maps intent routing.
- Scenario-test UI (buttons that trigger demo scenarios).
- Optional voice interface (speech-to-text → `/api/ask` → text-to-speech).
- Optional ElevenLabs / Nemotron bounty path.

## What you do NOT own

- Model training (Person A). Three.js visualisation (Person B). You consume B's routes; B builds them, you drive them.

---

## Deliverables

```text
android/app/src/main/...     (the app)
android/README.md            (build + run instructions)
```

(Person B owns `backend/routes/mobile.py` and `backend/routes/agent.py` — you specify what they must return; B implements.)

**Your one hard promise:** the app fetches a recommendation, displays the incident queue, accept/reject works, and **Accept opens a Maps routing intent**.

---

## Android MVP flow

A fire-station user can:

1. Select station / district.
2. View the current mock incident queue.
3. View the recommended standby / pre-position action.
4. Accept or reject the recommendation.
5. **Open routing to the destination via Android intent.**
6. Send a status update back to the backend.

---

## API contract (you specify, B implements)

### 1. Get dispatch state
```http
GET /api/mobile/state?station=Lewisham
```
```json
{
  "station": "Lewisham",
  "available_pumps": 1,
  "ongoing_incidents": [
    { "incident_id": "mock_001", "type": "outdoor_fire", "location": "Lewisham Central", "status": "active" }
  ],
  "recommendations": [
    {
      "recommendation_id": "rec_001",
      "action": "pre_position",
      "destination": "Brockley",
      "lat": 51.464, "lon": -0.036,
      "reason": "Predicted risk spike between 19:00 and 21:00."
    }
  ]
}
```

### 2. Accept recommendation
```http
POST /api/mobile/accept
```
Request:
```json
{ "recommendation_id": "rec_001", "station": "Lewisham", "unit": "Pump 1", "accepted": true }
```
Response:
```json
{ "status": "accepted", "routing_uri": "geo:51.464,-0.036?q=51.464,-0.036(Brockley standby position)" }
```

---

## Android intent routing (the money shot)

```kotlin
val uri = Uri.parse("geo:$lat,$lon?q=$lat,$lon($label)")
val intent = Intent(Intent.ACTION_VIEW, uri)
intent.setPackage("com.google.android.apps.maps")
startActivity(intent)
```

The backend already returns a `routing_uri` on accept — you can use that directly or rebuild it client-side from `lat`/`lon`. Either works; pick one and make it reliable for the demo.

---

## Voice interface

### MVP (native Android, no external deps)
- Speech-to-text via Android `SpeechRecognizer`.
- POST transcribed text to `/api/ask`.
- Display the `answer`.
- Read it back with Android `TextToSpeech`.

### Bounty version (stretch)
- **ElevenLabs** voice for input/output.
- Local **Nemotron / NIM / NeMo** agent for reasoning behind `/api/ask` (coordinate with A & B).
- Persistent session log for the 1h11m bounty.

---

## Build order

| Phase | Hours | Your tasks |
|---|---|---|
| 1 | 0–2 | Confirm `/api/mobile/state` + `/api/mobile/accept` shapes with B. Scaffold Compose app + Retrofit/Ktor client. |
| 2 | 2–8 | Against B's fake backend: fetch recommendation → display incident queue → accept/reject button → **open Maps intent**. |
| 3 | 8–14 | Connect to real `/api/mobile/state`. Add scenario buttons: "Bonfire Night", "Two pumps committed", "High wind". |
| 4 | 14–18 | Add voice MVP (STT → `/api/ask` → TTS). If realistic, start the ElevenLabs/Nemotron bounty path and session logging. |
| 5–6 | 18–24 | Polish demo path; make sure routing intent fires cleanly on the demo device; backup screen recording. |

---

## Tech stack

```text
Kotlin
Jetpack Compose
Retrofit or Ktor client
Android Maps intent (geo: URI)
Android SpeechRecognizer   (voice in)
Android TextToSpeech       (voice out)
```

---

## Coordination checklist

- [ ] Hour 2: lock `/api/mobile/state` + `/api/mobile/accept` shapes with B; B stubs them with fake data.
- [ ] Build the whole app against fake backend — do not wait for A's model.
- [ ] Use the same `ward`/`station` names B and A use so demo data lines up.
- [ ] Test the Maps intent on the actual demo device early — emulators handle `geo:` inconsistently.
- [ ] Have a backup screen recording in case live routing fails on stage.
