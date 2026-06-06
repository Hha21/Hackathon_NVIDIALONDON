// Step 5: scenario inputs -> POST /api/scenario -> recommendation card + delta.
// Inputs: district, weather (rain/wind/temperature), events (Bonfire Night),
// pump availability per station, ongoing incidents. Demo defaults preload the
// Lewisham "Bonfire Night + pump shortage + high wind" scenario.
import { useEffect, useState } from "react";
import { getLiveWeather, postScenario } from "../api";
import type { Scenario, ScenarioResponse } from "../api";

const STATIONS = ["Lewisham", "Deptford", "New Cross", "Forest Hill", "Lee Green"];
const WARDS = [
  "Lewisham Central",
  "Brockley",
  "Blackheath",
  "Deptford",
  "Evelyn",
  "Ladywell",
  "Rushey Green",
  "Telegraph Hill",
  "Forest Hill",
  "Sydenham",
  "Perry Vale",
  "Catford South",
];
const INCIDENT_TYPES = [
  "dwelling_fire",
  "outdoor_fire",
  "false_alarm",
  "special_service",
];

type Props = {
  result: ScenarioResponse | null;
  onResult: (r: ScenarioResponse | null) => void;
};

const field: React.CSSProperties = {
  background: "#0d1117",
  color: "#e6edf3",
  border: "1px solid #30363d",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 13,
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#8b949e",
  display: "block",
  marginBottom: 3,
};

export default function ScenarioPanel({ result, onResult }: Props) {
  const [time, setTime] = useState("20:00");
  const [wind, setWind] = useState("high");
  const [rain, setRain] = useState("none");
  const [temperature, setTemperature] = useState(12);
  const [bonfire, setBonfire] = useState(true);
  // Demo default: Lewisham station has 0 spare pumps (shortage).
  const [pumps, setPumps] = useState<Record<string, number>>({
    Lewisham: 0,
    Deptford: 2,
    "New Cross": 1,
    "Forest Hill": 2,
    "Lee Green": 1,
  });
  const [incidents, setIncidents] = useState<
    { ward: string; type: string; pumps_committed: number }[]
  >([{ ward: "Deptford", type: "dwelling_fire", pumps_committed: 2 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wxNote, setWxNote] = useState<string | null>(null);
  const [wxBusy, setWxBusy] = useState(false);

  const loadLiveWeather = async () => {
    setWxBusy(true);
    setWxNote(null);
    try {
      const w = await getLiveWeather(); // Lewisham centroid
      setWind(w.wind);
      setRain(w.rain);
      setTemperature(Math.round(w.temperature));
      setWxNote(
        `live: ${w.temperature.toFixed(0)}°C · wind ${w.windKmh.toFixed(0)} km/h · rain ${w.precipMm.toFixed(1)} mm`
      );
    } catch (e) {
      setWxNote(`live weather unavailable (${e}) — using manual values`);
    } finally {
      setWxBusy(false);
    }
  };

  // Pull real conditions for Lewisham on mount.
  useEffect(() => {
    loadLiveWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const scenario: Scenario = {
      district: "Lewisham",
      time,
      weather: { wind, rain, temperature },
      events: bonfire ? ["bonfire_night"] : [],
      pump_availability: pumps,
      ongoing_incidents: incidents,
    };
    try {
      const r = await postScenario(scenario);
      onResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
        flex: 1,
        width: "100%",
        minHeight: 0,
      }}
    >
      <h3 style={{ margin: 0, color: "#e6edf3" }}>Scenario</h3>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={loadLiveWeather}
          disabled={wxBusy}
          style={{ ...field, cursor: wxBusy ? "default" : "pointer", flex: 1 }}
        >
          {wxBusy ? "Fetching…" : "↻ Use live weather (Lewisham)"}
        </button>
      </div>
      {wxNote && <div style={{ fontSize: 11, color: "#8b949e" }}>{wxNote}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={labelStyle}>Time</label>
          <input style={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Temp (°C)</label>
          <input
            style={field}
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </div>
        <div>
          <label style={labelStyle}>Wind</label>
          <select style={field} value={wind} onChange={(e) => setWind(e.target.value)}>
            <option value="none">none</option>
            <option value="moderate">moderate</option>
            <option value="high">high</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Rain</label>
          <select style={field} value={rain} onChange={(e) => setRain(e.target.value)}>
            <option value="none">none</option>
            <option value="low">low</option>
            <option value="heavy">heavy</option>
          </select>
        </div>
      </div>

      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={bonfire}
          onChange={(e) => setBonfire(e.target.checked)}
        />
        Bonfire Night
      </label>

      <div>
        <label style={labelStyle}>Pump availability (spare per station)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {STATIONS.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#8b949e", flex: 1 }}>{s}</span>
              <input
                style={{ ...field, width: 48 }}
                type="number"
                min={0}
                value={pumps[s] ?? 0}
                onChange={(e) =>
                  setPumps({ ...pumps, [s]: Number(e.target.value) })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Ongoing incidents</label>
        {incidents.map((inc, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <select
              style={{ ...field, flex: 1 }}
              value={inc.ward}
              onChange={(e) => {
                const next = [...incidents];
                next[i] = { ...inc, ward: e.target.value };
                setIncidents(next);
              }}
            >
              {WARDS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <select
              style={{ ...field, flex: 1 }}
              value={inc.type}
              onChange={(e) => {
                const next = [...incidents];
                next[i] = { ...inc, type: e.target.value };
                setIncidents(next);
              }}
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <input
              style={{ ...field, width: 44 }}
              type="number"
              min={0}
              value={inc.pumps_committed}
              onChange={(e) => {
                const next = [...incidents];
                next[i] = { ...inc, pumps_committed: Number(e.target.value) };
                setIncidents(next);
              }}
            />
            <button
              style={{ ...field, cursor: "pointer", color: "#f85149" }}
              onClick={() => setIncidents(incidents.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          style={{ ...field, cursor: "pointer", width: "100%" }}
          onClick={() =>
            setIncidents([
              ...incidents,
              { ward: WARDS[0], type: INCIDENT_TYPES[0], pumps_committed: 1 },
            ])
          }
        >
          + add incident
        </button>
      </div>

      <button
        onClick={submit}
        disabled={busy}
        style={{
          background: busy ? "#30363d" : "#1f6feb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "9px 12px",
          cursor: busy ? "default" : "pointer",
          fontWeight: 600,
        }}
      >
        {busy ? "Running…" : "Run scenario"}
      </button>
      {result && (
        <button
          onClick={() => onResult(null)}
          style={{ ...field, cursor: "pointer" }}
        >
          Reset to baseline
        </button>
      )}

      {error && <div style={{ color: "#f85149", fontSize: 12 }}>{error}</div>}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "#e6edf3", fontSize: 13 }}>{result.summary}</div>
          {result.recommendations.map((r) => (
            <div
              key={r.recommendation_id ?? r.to_ward}
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                borderLeft: `3px solid ${
                  r.action === "pre_position" ? "#238636" : "#d29922"
                }`,
                borderRadius: 6,
                padding: "8px 10px",
              }}
            >
              <div style={{ color: "#e6edf3", fontWeight: 600, fontSize: 13 }}>
                #{r.priority}{" "}
                {r.action === "pre_position"
                  ? `Move standby pump: ${r.from_station} → ${r.to_ward}`
                  : `${r.action}: ${r.to_ward}`}
              </div>
              <div style={{ color: "#8b949e", fontSize: 12, marginTop: 3 }}>
                {r.reason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
