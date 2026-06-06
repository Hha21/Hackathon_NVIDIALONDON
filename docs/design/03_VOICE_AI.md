# Page 3 — AI / Voice Assistant

> Read `00_DESIGN_SYSTEM.md` first. A hands-free, real-time voice agent (ElevenLabs). The officer talks to it; it answers in a calm fire-control voice **and drives the map** — whatever it talks about lights up.

---

## Purpose

Eyes-on-the-road, hands-free situational awareness. The officer says *"what's hot right now?"* or *"why Brockley?"* and the assistant replies by voice while the relevant location appears visually. It feels like talking to a real control-room operator.

---

## Layout

```
┌───────────────────────────────────────┐
│  ASSISTANT                   ⋯ history │  ← glass top bar
│                                       │
│                                       │
│              ╭─────────╮              │
│             (  VOICE    )             │  ← big reactive orb / blob,
│              ╲  ORB    ╱               │     centre stage, ember-lit
│               ╰───────╯               │
│                                       │
│        "Listening…"                   │  ← live status / partial transcript
│                                       │
│   ┌─────────────────────────────────┐ │
│   │ ░ result card (optional) ░       │ │  ← when agent references a place:
│   │ [styled map of Brockley]        │ │     a glass card with the static
│   │ Brockley · risk 0.78 · 19:00    │ │     map + risk appears here
│   └─────────────────────────────────┘ │
│                                       │
│   ▌ "what's hot right now?"   (you)   │  ← scrolling transcript above
│   ▌ "Brockley is the highest…" (AI)   │
│                                       │
│            ◉  tap to talk             │  ← big mic control (lower third)
└───────────────────────────────────────┘
        [ Station ] [ Globe ] [ Assistant ]
```

---

## Components

### A. Voice orb (centrepiece)
A large, organic, ember-lit blob/sphere that reacts to state:
- **Idle:** slow breathing glow.
- **Listening:** rippling / reacting to the user's voice amplitude (`accent/signal` edge).
- **Thinking:** swirling, dim.
- **Speaking:** pulses ember in time with the agent's voice.

This is the emotional core of the tab — make it mesmerising. (It maps to the SDK's `onModeChange` = "listening" / "speaking".)

### B. Status / live caption
Under the orb: current state ("Listening…", "Thinking…", "Speaking") and the live partial transcript of what the user is saying.

### C. Result card (appears on demand)
When the agent calls its `show_location` tool, a **GlassCard** appears here showing the **styled map** of that ward + a **RiskPill** + key facts (`dominant_type`, hour, `expected_count`). A **"Open in Globe"** / **"Route here"** action. This is the visual proof of what the voice is saying. (May also/instead drive the Globe tab.)

### D. Transcript
A scrolling chat-style transcript of the conversation (user turns + agent turns), styled minimally — user turns right/ember-tinted, agent turns left/neutral. Tool calls can show as subtle system chips ("📍 showed Brockley").

### E. Mic control (lower third, one-handed)
Big, obvious **tap-to-talk** / **end** control. Mute toggle. The agent is full-duplex (barge-in supported), so the primary control is start/stop session, with a clear "live" indicator while connected.

---

## Interactions & motion
- Tap to start → mic permission (first time) → orb wakes, session connects.
- Real-time, interruptible conversation (the user can talk over the agent).
- When the agent references a place → result card animates in + (optionally) Globe tab updates.
- End session → orb returns to idle.

## States
- **Permission needed:** friendly prompt to allow the microphone.
- **Connecting:** orb spins up, "Connecting to control…".
- **Offline / no internet:** clear message — voice needs a connection. Offer a "play sample" fallback (pre-recorded demo clip). *(Voice is the one feature that requires internet.)*
- **Idle/empty:** suggested prompts as tappable chips — "What's hot right now?", "Why Brockley?", "Risk in Lewisham tonight?".

## Notes for the designer
- The orb should feel alive and premium — this is the demo's "magic" moment.
- Keep transcript secondary to the orb + result card; it's a log, not the focus.
- Suggested-prompt chips help judges know what to say — design 3–4.
- Match map/risk styling to Home & Globe so it's one coherent system.
