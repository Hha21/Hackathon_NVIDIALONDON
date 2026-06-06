// Forecast generation panel: dispatch a GPT-2 rollout job to the DGX Spark.
//
// Every input here is something the model actually conditions on (src/dataset.py
// build_prefix): the date -> day-of-week + month, the hour, and the temp/rain/wind
// buckets. Operational what-ifs (bonfire, pumps, incidents) are NOT model inputs,
// so they live elsewhere — this panel only shapes the "possible day" the model
// generates. On completion the regenerated forecast is scp'd back and the map
// refreshes via onForecastUpdated().
import { useEffect, useRef, useState } from "react";
import {
  generateForecast,
  getGenerateJob,
  getLiveWeather,
  tempBucket,
  rainBucket,
  windBucket,
} from "../api";
import type { GenerateJob } from "../api";

type Props = {
  onForecastUpdated: () => void;
};

// Rollouts per station → total = ×102 stations. ETA from the Spark's KV-cache
// throughput (O(T)/step decode); 20/station is the infer.py default.
const RESOLUTIONS = [
  { label: "Fast", n: 10, eta: "~1 min" },
  { label: "Balanced", n: 15, eta: "~1–2 min" },
  { label: "Full", n: 20, eta: "~2 min" },
];

const field: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--text)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-sec)",
  display: "block",
  marginBottom: 5,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  fontFamily: "var(--font-mono)",
};
const bucketStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--accent)",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  letterSpacing: "0.08em",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ScenarioPanel({ onForecastUpdated }: Props) {
  const [date, setDate] = useState(today());
  const [hour, setHour] = useState(18);
  const [temp, setTemp] = useState(12); // °C
  const [wind, setWind] = useState(25); // km/h
  const [rain, setRain] = useState(0); // mm/h
  const [nRollouts, setNRollouts] = useState(10);

  const [job, setJob] = useState<GenerateJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wxNote, setWxNote] = useState<string | null>(null);
  const [wxBusy, setWxBusy] = useState(false);
  const notified = useRef<string | null>(null);

  const running = job?.status === "queued" || job?.status === "running";

  const loadLiveWeather = async () => {
    setWxBusy(true);
    setWxNote(null);
    try {
      const w = await getLiveWeather(); // Greater London centroid default
      setTemp(Math.round(w.temperature));
      setWind(Math.round(w.windKmh));
      setRain(Math.round(w.precipMm * 10) / 10);
      setWxNote(
        `live: ${w.temperature.toFixed(0)}°C · wind ${w.windKmh.toFixed(0)} km/h · rain ${w.precipMm.toFixed(1)} mm`
      );
    } catch (e) {
      setWxNote(`live weather unavailable (${e}) — using manual values`);
    } finally {
      setWxBusy(false);
    }
  };

  useEffect(() => {
    loadLiveWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the running job until it finishes; refresh the map once on completion.
  useEffect(() => {
    if (!job || (job.status !== "running" && job.status !== "queued")) return;
    const id = setInterval(async () => {
      try {
        const j = await getGenerateJob(job.job_id);
        setJob(j);
        if (j.status === "done" && notified.current !== j.job_id) {
          notified.current = j.job_id;
          onForecastUpdated();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.job_id, job?.status]);

  const generate = async () => {
    setError(null);
    try {
      const j = await generateForecast({
        date,
        hour,
        temp,
        rain,
        wind,
        n_rollouts: nRollouts,
      });
      setJob(j);
    } catch (e) {
      setError(String(e));
    }
  };

  const slider = (
    label: string,
    value: number,
    set: (n: number) => void,
    bucket: string,
    min: number,
    max: number,
    step: number,
    unit: string
  ) => (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 2,
        }}
      >
        <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
        <span style={bucketStyle}>
          {value}
          {unit} · {bucket}
        </span>
      </div>
      <input
        className="nt-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={running}
        onChange={(e) => set(Number(e.target.value))}
        style={
          {
            width: "100%",
            "--fill": ((value - min) / (max - min)) * 100,
          } as React.CSSProperties
        }
      />
    </div>
  );

  return (
    <section
      className="panel nt-scroll"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
        width: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="led" />
          <span className="kicker">Generate Forecast</span>
        </div>
        <button
          className="btn ghost sm"
          onClick={loadLiveWeather}
          disabled={wxBusy || running}
        >
          {wxBusy ? "Syncing" : "Live Weather"}
        </button>
      </div>
      {wxNote && (
        <div
          className="mono"
          style={{ fontSize: 10, color: "var(--text-mut)" }}
        >
          {wxNote}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input
            style={{ ...field, width: "100%" }}
            type="date"
            value={date}
            disabled={running}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Start Hour</label>
          <input
            style={{ ...field, width: "100%" }}
            type="number"
            min={0}
            max={23}
            value={hour}
            disabled={running}
            onChange={(e) =>
              setHour(Math.max(0, Math.min(23, Number(e.target.value))))
            }
          />
        </div>
      </div>

      {slider("Temperature", temp, setTemp, tempBucket(temp), -5, 35, 1, "°C")}
      {slider("Wind", wind, setWind, windBucket(wind), 0, 80, 1, " km/h")}
      {slider("Rain", rain, setRain, rainBucket(rain), 0, 20, 0.5, " mm/h")}

      <div>
        <label style={labelStyle}>Resolution · Rollouts/Station</label>
        <div style={{ display: "flex", gap: 6 }}>
          {RESOLUTIONS.map((r) => (
            <button
              key={r.n}
              className={`seg${nRollouts === r.n ? " on" : ""}`}
              disabled={running}
              onClick={() => setNRollouts(r.n)}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {r.label}
              </span>
              <span style={{ fontSize: 9, letterSpacing: "0.06em" }}>
                {r.n}× · {r.eta}
              </span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn accent full" onClick={generate} disabled={running}>
        {running ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Generating…
          </>
        ) : (
          "Generate Day"
        )}
      </button>

      {error && (
        <div
          className="mono"
          style={{ color: "var(--accent-hot)", fontSize: 11 }}
        >
          {error}
        </div>
      )}

      {job && (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderLeft: `2px solid ${
              job.status === "done"
                ? "var(--r-green)"
                : job.status === "error"
                ? "var(--accent-hot)"
                : "var(--accent)"
            }`,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
          }}
        >
          <div
            className="mono"
            style={{
              color: "var(--text)",
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: "0.04em",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {running && (
              <span
                className="spinner"
                aria-hidden="true"
                style={{ color: "var(--accent)", flexShrink: 0 }}
              />
            )}
            {job.message}
          </div>
          {job.status === "done" && (
            <div
              className="mono"
              style={{ color: "var(--text-sec)", marginTop: 5, fontSize: 10 }}
            >
              {job.n_rollouts}× rollouts · {job.device ?? "GPU"}
              {job.forecast_generated_at && (
                <> · {job.forecast_generated_at}</>
              )}
              <div style={{ color: "var(--r-green)", marginTop: 3 }}>
                Risk surface updated
              </div>
            </div>
          )}
          {job.status === "error" && job.error && (
            <div
              style={{
                color: "var(--text-sec)",
                marginTop: 5,
                whiteSpace: "pre-wrap",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
              }}
            >
              {job.error}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
