# Page 1 — Home / "My Station"

> Read `00_DESIGN_SYSTEM.md` first. This is the default tab. It is the emotional anchor of the app and where the core action lives: **see what's predicted → Accept → get routed.**

---

## Purpose

The officer opens the app and instantly understands: *this is my station, here's what's happening near me, and here's what the AI wants me to do about it.* The hero sells the product; the cards do the work.

---

## Layout (top → bottom, scrollable over a fixed hero)

```
┌───────────────────────────────────────┐
│                                       │
│   FULL-BLEED HERO IMAGE               │  ← AI-generated: the station at
│   (station + parked fire appliance,   │     dusk/night, cinematic, a pump
│    cinematic, slowly animated)        │     parked out front. Ember sky.
│                                       │
│   ░░ glass scrim fades to dark ░░     │
│  ┌─────────────────────────────────┐ │
│  │ STATION                         │ │  ← glass header card overlapping
│  │ Lewisham            ● ON DUTY   │ │     the hero (glassmorphism)
│  │ Lewisham, SE London             │ │
│  │ PUMPS FREE · 1   │  RISK · HIGH │ │
│  └─────────────────────────────────┘ │
│                                       │
│   ⚠ RECOMMENDATION                    │  ← the star component (see below)
│  ┌─────────────────────────────────┐ │
│  │ [ styled map preview of route ] │ │
│  │ PRE-POSITION → Brockley         │ │
│  │ "Predicted dwelling-fire risk   │ │
│  │  spike ~19:00 (risk 0.78)."     │ │
│  │  [  ACCEPT  ]      [ Decline ]  │ │
│  └─────────────────────────────────┘ │
│                                       │
│   ACTIVE NEARBY            See globe →│  ← section label + globe shortcut
│   • outdoor fire · Lewisham Central  │  ← incident list
│   • AFA · Deptford · ●active         │
│                                       │
└───────────────────────────────────────┘
        [ Station ] [ Globe ] [ Assistant ]   ← bottom nav
```

---

## Components & the real data behind them

All data comes from one backend call: `GET /api/mobile/state?station=Lewisham`.

### A. Hero (fixed background)
AI-generated cinematic image of the officer's station with a fire appliance parked outside, dusk/night, ember sky. Very subtle slow movement (parallax / light flicker / drifting embers) — premium, not distracting. A vertical gradient scrim (transparent → `bg/base`) fades the bottom so cards read clearly.

### B. Station header (GlassCard, overlaps hero)
- **`station`** — big display, e.g. "Lewisham".
- Subtitle: borough / area text ("Lewisham, SE London").
- An **ON DUTY** status dot (`accent/signal`).
- Two **StatChips**: `PUMPS FREE · {available_pumps}` and an overall `RISK · HIGH/MED/LOW` (derived from the top recommendation's risk).

### C. Recommendation card — THE hero component (GlassCard)
One per item in **`recommendations[]`** (usually show the top 1, stack the rest below). Fields: `action`, `destination`, `lat`, `lon`, `reason`.

- **Map preview** at the top of the card: a styled, **desaturated/monochrome satellite-ish map** of the destination with the **route line** drawn from "you" to the destination, framed inside the card with rounded corners. (Static map image; we apply a greyscale + ember-tinted treatment.) This is the visual centrepiece.
- **Action label**: `action` formatted big — e.g. **PRE-POSITION → Brockley** (action verbs: `pre_position`, `hold`, `dispatch`, `monitor`).
- **RiskPill** showing the predicted risk score (mono, heat-tinted, glowing).
- **Reason** (`reason`): one calm sentence, `text/secondary`.
- **Two actions, lower area:**
  - **ACCEPT** — ember PrimaryButton. On tap: confident spring + ember flash, then the card confirms ("Routing…") and **Google Maps opens** with directions. Show a brief success state first.
  - **Decline** — GhostButton. On tap: card slides away / collapses; reveal next recommendation if any.

*Design the card for an idle (pre-decision), accepted (success/“en route”), and declined (dismissed) state.*

### D. Active nearby (incident list)
Section label `ACTIVE NEARBY` + a `See globe →` text link (jumps to Globe tab). A list of **IncidentRow**s from **`ongoing_incidents[]`** — each has `type` (e.g. "outdoor_fire"), `location`, `status`. Icon by type, status dot, location in `text/secondary`. Keep it tight — this is situational awareness, secondary to the recommendation.

---

## Interactions & motion

- Pull-to-refresh re-fetches state (glass shimmer skeleton while loading).
- Recommendation card entrance: fade + rise; high-risk card has a slow ember glow pulse on its border.
- Accept: spring + flash → "Routing to Brockley" success → launches Maps.
- Tapping the map preview (before accepting) can expand it to a larger peek.
- `See globe →` and the globe nav both lead to Tab 2.

## States
- **Loading:** skeleton header + skeleton card.
- **Empty (no recommendation):** calm "No standby moves advised. Holding position." with a steady `accent/signal` tone instead of ember.
- **Offline:** small banner "Showing last known dispatch state."

## Notes for the designer
- The recommendation card must dominate the first scroll. Hero is mood; card is the job.
- Keep the heat/ember language consistent with the globe so the two tabs feel like one system.
- Numbers (pumps, risk, time) are **monospace** instrument readouts.
