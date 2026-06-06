# Foresight Dispatch — Design System (read this first)

A native **Android** app (Jetpack Compose) for a **London Fire Brigade** station officer in the field. It shows AI-predicted fire risk for the next 24 hours and tells the officer where to pre-position a spare fire appliance. Three tabs: **Home / My Station**, **Globe**, **AI / Voice**.

This file defines the shared visual language. Each page brief (`01`–`03`) builds on it. Design for a **phone, portrait, dark mode only**.

---

## 1. Concept & mood

**"Fire Control."** A cinematic, calm, command-centre aesthetic — like the cockpit of something serious and expensive. Dark, glassy, glowing embers. It should feel *operational and trustworthy*, not gamey. Think: Apple-grade polish meets emergency-services kit.

Keywords: obsidian glass · ember glow · frosted panels · quiet confidence · data-dense but breathable.

---

## 2. Colour

Dark mode only. Layered near-black base with frosted glass panels and an ember accent.

| Token | Hex | Use |
|---|---|---|
| `bg/base` | `#0A0B0D` | App background (almost black) |
| `bg/raised` | `#111317` | Cards behind glass, sheets |
| `glass/fill` | `rgba(255,255,255,0.06)` | Frosted panel fill (over blur) |
| `glass/stroke` | `rgba(255,255,255,0.12)` | 1px hairline border on glass |
| `text/primary` | `#F5F7FA` | Headlines, key values |
| `text/secondary` | `#9BA1AC` | Labels, captions |
| `text/muted` | `#5B616B` | Disabled, hints |
| `accent/ember` | `#FF6A1A` | Primary accent, CTAs, active nav |
| `accent/ember-hot` | `#FF3D2E` | High urgency, alerts |
| `accent/signal` | `#37E0C8` | Cool contrast: "safe", info, confirms |

**Risk heat ramp** (used everywhere risk is shown — globe, cards, dots):
`0.0 → #2BD47D (green)` · `0.4 → #F5C518 (amber)` · `0.7 → #FF6A1A (ember)` · `0.9+ → #FF3D2E (red)`. Interpolate smoothly.

Accents glow: ember elements get a soft outer glow (`box-shadow`-style bloom) at ~20–30% opacity. High-risk elements may **slowly pulse** the glow.

---

## 3. Typography

- **Display / headlines:** a geometric grotesk — `Space Grotesk` or `Geist`. Tight, confident.
- **Body / labels:** `Inter`.
- **Data readouts** (risk scores, coordinates, times, pump counts): a **monospace** — `Geist Mono` / `JetBrains Mono`. Numbers should feel like instrument readouts.

Scale (sp): Display 28–32 · Title 20–22 · Body 15–16 · Label 12–13 (often UPPERCASE, letter-spaced) · Mono-data 14–18.

---

## 4. Surfaces — glassmorphism

The signature look. Panels are **frosted translucent glass** floating over imagery / the dark base:

- Background blur behind the panel (frost).
- Fill `glass/fill`, 1px `glass/stroke` border.
- Corner radius **20–24dp** for cards, **28dp** for sheets.
- Soft drop shadow (large, low opacity) for lift.
- A subtle 1px top inner highlight (light catching the glass edge).

> Implementation note for the design: keep critical text on a slightly darker scrim *inside* the glass so it stays legible over bright hero imagery.

---

## 5. Navigation — bottom bar (persistent, all 3 tabs)

A floating **glass bottom nav bar** (rounded, detached from screen edges with margin, blurred). Three items:

1. **Station** (home / shield-or-truck icon)
2. **Globe** (globe icon)
3. **Assistant** (waveform / mic icon)

Active tab: ember icon + label + a soft ember glow and a small top indicator. Inactive: `text/secondary`. Tab switches use a quick cross-fade + subtle slide.

---

## 6. Motion

Purposeful and weighty, never bouncy-cartoonish.

- Card entrance: fade + 8dp rise, ~250ms, ease-out.
- Accept action: card does a confident spring + ember flash, then collapses.
- High-risk glow: slow 2–3s pulse.
- Globe: continuous slow auto-rotate; camera "flies" smoothly to a ward when focused.
- Voice orb: reactive blob that breathes when idle, ripples when listening, pulses ember when speaking.

---

## 7. Reusable components

- **GlassCard** — the base frosted panel.
- **RiskPill** — small pill showing a risk score `0.78` (mono) tinted by the heat ramp + a glowing dot.
- **IncidentRow** — icon + type + location + status dot, in a list.
- **PrimaryButton (ember)** / **GhostButton** — Accept = ember filled; Decline/secondary = ghost outline.
- **StatChip** — labelled mono value (e.g., `PUMPS FREE · 1`).
- **SectionLabel** — uppercase, letter-spaced, `text/secondary`.

---

## 8. Universal states (design every page for these)

- **Loading** — glass skeletons / shimmer, not spinners where possible.
- **Empty** — calm message + icon (e.g., "No active incidents — all clear").
- **Error / offline** — non-alarming banner: "Can't reach control. Showing last known." (the app caches last data).

---

## 9. Hard constraints

- Portrait phone, dark only.
- Must stay legible over bright hero imagery (use scrims).
- One-handed reach: primary actions sit in the lower 2/3.
- Demo runs possibly **offline** — design must look complete with cached/placeholder data (no hard dependency on a live spinner).
