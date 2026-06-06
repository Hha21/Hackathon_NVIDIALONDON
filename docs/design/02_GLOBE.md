# Page 2 — Globe (3D risk surface)

> Read `00_DESIGN_SYSTEM.md` first. This is the "wow" tab — a beautiful 3D heat-globe of London fire risk. It mirrors what HQ sees on the web dashboard, but designed to be gorgeous on a phone.

> **Implementation reality (for the dev, not the designer):** the 3D itself is rendered by a bespoke Three.js scene inside a full-bleed, chrome-less WebView — it looks 100% native. **claude.design should design the *native Compose overlay UI* that floats on top of the 3D** (header, time scrubber, legend, ward detail sheet), plus a static "hero frame" mock of how the globe itself should look. Design the chrome; we build the globe.

---

## Purpose

Let the officer see *where and when* risk concentrates across London over the next 24 hours — and scrub through time to watch it move. Tapping a hotspot shows detail and can route there.

---

## Layout

```
┌───────────────────────────────────────┐
│  LONDON · NEXT 24H            ⌕ search │  ← glass top bar
│                                       │
│                                       │
│            🌍  (the 3D globe /        │  ← full-bleed Three.js scene
│            tilted city map with       │     (WebView under native overlay)
│            glowing risk columns /     │
│            heat surface over wards)   │
│                                       │
│                                       │
│   ┌─────────────────────────────────┐ │
│   │ ▓▓▓▓▓░░░░  18:00            ▶   │ │  ← time scrubber (glass)
│   └─────────────────────────────────┘ │
│   low ▢▢▢▢▢ high   ·  legend          │  ← heat legend
└───────────────────────────────────────┘
        [ Station ] [ Globe ] [ Assistant ]
```

---

## The globe itself (hero-frame mock to design)

A dark, cinematic 3D view of London. Risk is shown as a **heat surface** over wards — glowing extruded columns or a glowing density blanket — coloured by the **risk heat ramp** (green→amber→ember→red). Subtle atmospheric glow, faint grid, slow auto-rotate. High-risk wards pulse gently. It should look like a living command-centre display.

Per ward we have: `ward_name`, `lat`, `lon`, and `hourly[]` where each entry = `{ hour, risk_score (0–1), expected_count, dominant_type }`. Source: `GET /api/forecast`.

---

## Native overlay components (what claude.design should produce)

### A. Top bar (glass)
Title `LONDON · NEXT 24H`, optional ward search/filter (⌕), maybe a district label.

### B. Time scrubber (glass, bottom) — important
A horizontal scrubber representing **hours 0–23**. Dragging it changes which hour's risk the globe shows (the heat surface animates). Shows the selected time (`18:00`, mono) and a **Play ▶** button that auto-animates through the 24h as a time-lapse. A thin sparkline of total risk-over-time behind the track is a nice touch.

### C. Heat legend
Small gradient bar: `low → high` mapped to the heat ramp, so colours are readable.

### D. Ward detail sheet (glass bottom sheet) — on tapping a hotspot
Slides up when a ward is tapped (or when the voice agent focuses one). Shows:
- `ward_name` (title) + a **RiskPill** for the current hour.
- `dominant_type` for that hour (e.g. "dwelling fire").
- `expected_count` (mono).
- A mini 24h risk curve for that ward.
- A **"Route here"** ember button → opens Google Maps to the ward (reuses the Accept→Maps flow).

---

## Interactions & motion
- Drag globe to rotate; pinch to zoom; auto-rotate when idle.
- Scrubbing time smoothly re-colours the heat surface.
- Tapping a ward → camera flies to it + detail sheet rises.
- **Voice integration:** when the Assistant calls `show_location`, this tab can be driven externally — globe flies to the ward and the sheet opens. Design the sheet so it works whether opened by tap or by voice.
- High-risk areas glow-pulse.

## States
- **Loading:** globe fades in from dark; overlay shows skeleton scrubber.
- **Offline:** globe renders from cached forecast; small "last updated" note.

## Notes for the designer
- Overlays are **glass floating over a dark 3D scene** — keep them light, edges of screen, never blocking the centre.
- Match the heat ramp exactly to the Home recommendation card so risk colour means the same thing everywhere.
- Provide: (1) a hero-frame mock of the ideal globe look, (2) the overlay component set, (3) the ward detail sheet.
