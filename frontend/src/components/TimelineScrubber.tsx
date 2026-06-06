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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 10,
      }}
    >
      <button
        onClick={() => setPlaying((p) => !p)}
        style={{
          background: "#238636",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "6px 12px",
          cursor: "pointer",
          fontWeight: 600,
          minWidth: 64,
        }}
      >
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <input
        type="range"
        min={0}
        max={23}
        step="any"
        value={t}
        onChange={(e) => {
          setPlaying(false);
          setHour(Number(e.target.value));
        }}
        style={{ flex: 1 }}
      />
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 56,
          textAlign: "right",
          color: "#e6edf3",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}
