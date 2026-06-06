// Step 5: hour 0->23 slider + play/pause that animates the surface.
// Play advances a *continuous* fractional hour via requestAnimationFrame and
// loops; RiskMap3D interpolates risk between adjacent hours so the surface
// fades smoothly instead of snapping each hour. Parent owns `hour` (a float).
import { useEffect, useRef, useState } from "react";

type Props = {
  hour: number;
  setHour: (h: number) => void;
};

// Real-time ms spent per simulated hour. Higher = slower, smoother playback.
const MS_PER_HOUR = 1800;

export default function TimelineScrubber({ hour, setHour }: Props) {
  const [playing, setPlaying] = useState(false);
  // mirror latest hour for the rAF closure
  const hourRef = useRef(hour);
  hourRef.current = hour;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setHour((hourRef.current + dt / MS_PER_HOUR) % 24);
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
    </div>
  );
}
