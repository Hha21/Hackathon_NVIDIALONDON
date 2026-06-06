// Step 5: hour 0->23 slider + play/pause that animates the surface.
// Play advances a *continuous* fractional hour via requestAnimationFrame and
// loops; RiskMap3D interpolates risk between adjacent hours so the surface
// fades smoothly instead of snapping each hour. Parent owns `hour` (a float).
import { useEffect, useRef, useState } from "react";

type Props = {
  hour: number;
  setHour: (h: number) => void;
};

// Real-time ms spent per simulated hour at 1x. Higher = slower, smoother playback.
const MS_PER_HOUR = 1800;
// Playback speed multipliers shown in the selector (fast -> slow, menu reads top-down).
const SPEEDS = [4, 2, 1, 0.5, 0.25];

export default function TimelineScrubber({ hour, setHour }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedWrap = useRef<HTMLDivElement>(null);
  // mirror latest hour for the rAF closure
  const hourRef = useRef(hour);
  hourRef.current = hour;
  // mirror latest speed so changing it doesn't restart the rAF loop
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // close the speed menu on outside click / Escape
  useEffect(() => {
    if (!speedOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!speedWrap.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSpeedOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [speedOpen]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setHour((hourRef.current + (dt * speedRef.current) / MS_PER_HOUR) % 24);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setHour]);

  const t = ((hour % 24) + 24) % 24;
  const hh = Math.floor(t);
  const mm = Math.floor((t - hh) * 60);
  const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

  return (
    <div
      className="panel"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
      }}
    >
      <button
        className={`btn sm ${playing ? "ghost" : "accent"}`}
        onClick={() => setPlaying((p) => !p)}
        style={{ minWidth: 92 }}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <span className="label">Time</span>
      <input
        className="nt-range"
        type="range"
        min={0}
        max={23}
        step="any"
        value={t}
        onChange={(e) => {
          setPlaying(false);
          setHour(Number(e.target.value));
        }}
        style={{ flex: 1, "--fill": (t / 23) * 100 } as React.CSSProperties}
      />
      <span
        className="mono"
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 70,
          textAlign: "right",
          color: "var(--text)",
          fontWeight: 600,
          fontSize: 20,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <div ref={speedWrap} style={{ position: "relative" }}>
        <button
          className="btn sm ghost"
          onClick={() => setSpeedOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={speedOpen}
          style={{
            width: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            padding: "0 12px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ width: 44, textAlign: "left" }}>{speed}x</span>
          <span
            style={{
              fontSize: 10,
              opacity: 0.7,
              transform: speedOpen ? "rotate(180deg)" : "none",
              transition: "transform 120ms ease",
            }}
          >
            ▾
          </span>
        </button>
        {speedOpen && (
          <div
            role="menu"
            className="panel"
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              right: 0,
              padding: 4,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              width: 112,
              zIndex: 20,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            {SPEEDS.map((s) => {
              const sel = speed === s;
              return (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={sel}
                  // selected = solid black, unselected = orange — keeps the
                  // color from flipping orange->black on click (no flicker).
                  className={`btn sm ${sel ? "" : "accent"}`}
                  onClick={() => {
                    setSpeed(s);
                    setSpeedOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    width: "100%",
                    padding: "0 12px",
                    fontVariantNumeric: "tabular-nums",
                    ...(sel
                      ? {
                          background: "#0a0a0a",
                          color: "var(--text)",
                          border: "1px solid var(--line-strong)",
                        }
                      : null),
                  }}
                >
                  <span style={{ width: 44, textAlign: "left" }}>{s}x</span>
                  <span style={{ fontSize: 11, width: 12, textAlign: "right" }}>
                    {sel ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
