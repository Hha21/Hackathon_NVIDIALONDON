// Step 5: hour 0->23 slider + play/pause that animates the surface.
// Play steps the hour on an interval and loops; updates app `hour` so RiskMap3D
// re-heights. Pure controlled component — parent owns `hour`.
import { useEffect, useRef, useState } from "react";

type Props = {
  hour: number;
  setHour: (h: number) => void;
};

const STEP_MS = 600;

export default function TimelineScrubber({ hour, setHour }: Props) {
  const [playing, setPlaying] = useState(false);
  // mirror latest hour for the interval closure
  const hourRef = useRef(hour);
  hourRef.current = hour;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setHour((hourRef.current + 1) % 24);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, setHour]);

  const label = `${String(hour).padStart(2, "0")}:00`;

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
        step={1}
        value={hour}
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
