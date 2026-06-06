// Step 4c/5: dashboard composition.
//   RiskMap3D (headline 3D surface) + TimelineScrubber + incident filter +
//   ScenarioPanel. Fetches the baseline forecast on load / on filter change;
//   when a scenario is run its scenario_risk overlays the surface. If the
//   backend is unreachable it falls back to a bundled forecast so the surface
//   always renders (offline demo safety).
import { useEffect, useMemo, useState } from "react";
import { getForecast, getHealth } from "./api";
import type { ForecastResponse, Health, ScenarioResponse } from "./api";
import RiskMap3D from "./components/RiskMap3D";
import TimelineScrubber from "./components/TimelineScrubber";
import ScenarioPanel from "./components/ScenarioPanel";
import fallbackForecast from "./fallback_forecast.json";

// Matches the dominant_type values emitted by Person A's model forecast.
const INCIDENT_FILTER = [
  "all",
  "dwelling_fire",
  "outdoor_fire",
  "false_alarm",
  "special_service",
];

export default function App() {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [hour, setHour] = useState(20);
  const [incidentType, setIncidentType] = useState("all");
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  // Spark inference status (device + model_loaded) for the NVIDIA panel.
  useEffect(() => {
    let alive = true;
    getHealth()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getForecast("Greater London", incidentType)
      .then((f) => {
        if (!alive) return;
        setForecast(f);
        setOffline(false);
      })
      .catch(() => {
        if (!alive) return;
        // backend down -> render the bundled snapshot so the demo never blanks
        setForecast(fallbackForecast as ForecastResponse);
        setOffline(true);
      });
    return () => {
      alive = false;
    };
  }, [incidentType]);

  // ward_id -> scenario_risk overlay for the 3D surface, when a scenario is active.
  const riskOverride = useMemo(() => {
    if (!scenario) return undefined;
    const m: Record<string, number> = {};
    for (const d of scenario.forecast_delta) m[d.ward_id] = d.scenario_risk;
    return m;
  }, [scenario]);

  const chip: React.CSSProperties = {
    fontSize: 11,
    borderRadius: 6,
    padding: "3px 8px",
    border: "1px solid",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 380px",
        gridTemplateRows: "auto 1fr auto",
        gridTemplateAreas: `"header header" "map panel" "footer panel"`,
        height: "100vh",
        width: "100vw",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <header
        style={{
          gridArea: "header",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid #30363d",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          🔥 Foresight for Fires{" "}
          <span style={{ color: "#8b949e", fontWeight: 400, fontSize: 15 }}>
            — {forecast?.district ?? "Greater London"} risk surface
          </span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {health?.model_loaded && (
            <span
              style={{ ...chip, color: "#58a6ff", borderColor: "#58a6ff" }}
              title={`device: ${health.device}`}
            >
              ⚡ Spark inference · {health.device}
            </span>
          )}
          {offline && (
            <span style={{ ...chip, color: "#d29922", borderColor: "#d29922" }}>
              offline · bundled data
            </span>
          )}
          {scenario && (
            <span style={{ ...chip, color: "#3fb950", borderColor: "#3fb950" }}>
              scenario overlay active
            </span>
          )}
          <span style={{ fontSize: 12, color: "#8b949e" }}>Incident type</span>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            style={{
              background: "#0d1117",
              color: "#e6edf3",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
            }}
          >
            {INCIDENT_FILTER.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* 3D surface */}
      <main style={{ gridArea: "map", position: "relative", minHeight: 0, minWidth: 0 }}>
        {forecast ? (
          <RiskMap3D wards={forecast.wards} hour={hour} riskOverride={riskOverride} />
        ) : (
          <div style={{ padding: 24, color: "#8b949e" }}>Loading forecast…</div>
        )}
        <Legend />
      </main>

      {/* scenario panel */}
      <aside
        style={{
          gridArea: "panel",
          borderLeft: "1px solid #30363d",
          minHeight: 0,
          display: "flex",
          padding: 14,
        }}
      >
        <ScenarioPanel result={scenario} onResult={setScenario} />
      </aside>

      {/* scrubber */}
      <footer style={{ gridArea: "footer", padding: "10px 18px", borderTop: "1px solid #30363d" }}>
        <TimelineScrubber hour={hour} setHour={setHour} />
      </footer>
    </div>
  );
}

function Legend() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 14,
        left: 14,
        background: "rgba(13,17,23,0.85)",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 11,
        color: "#8b949e",
      }}
    >
      <div style={{ marginBottom: 5, color: "#e6edf3" }}>Predicted risk</div>
      <div
        style={{
          width: 150,
          height: 8,
          borderRadius: 4,
          background: "linear-gradient(90deg, rgb(40,110,220), rgb(240,220,40), rgb(220,40,40))",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span>low</span>
        <span>high</span>
      </div>
    </div>
  );
}
