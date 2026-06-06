// Step 4c/5: dashboard composition.
//   RiskMap3D (headline 3D surface) + TimelineScrubber + incident filter +
//   ScenarioPanel. Fetches the baseline forecast on load / on filter change;
//   when a scenario is run its scenario_risk overlays the surface. If the
//   backend is unreachable it falls back to a bundled forecast so the surface
//   always renders (offline demo safety).
import { useCallback, useEffect, useState } from "react";
import { getForecast, getHealth } from "./api";
import type { ForecastResponse, Health } from "./api";
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
  const [offline, setOffline] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  // Bumped after a Spark regen to force a forecast + health refetch.
  const [refreshKey, setRefreshKey] = useState(0);

  // Spark inference status (device + model_loaded) for the NVIDIA panel.
  useEffect(() => {
    let alive = true;
    getHealth()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth(null));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

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
  }, [incidentType, refreshKey]);

  // The scenario panel calls this once a Spark regen lands the new forecast JSON.
  const onForecastUpdated = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 400px",
        gridTemplateRows: "auto 1fr auto",
        gridTemplateAreas: `"header header" "map panel" "footer panel"`,
        height: "100vh",
        width: "100vw",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-body)",
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
          padding: "14px 20px",
          borderBottom: "1px solid var(--line)",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="led" />
          <h1
            className="dot"
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Foresight
          </h1>
          <span className="kicker" style={{ color: "var(--text-sec)" }}>
            {forecast?.district ?? "Greater London"} / Risk Surface
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {health?.model_loaded && (
            <span className="pill live" title={`device: ${health.device}`}>
              <span className="led" />
              Spark · {health.device}
            </span>
          )}
          {offline && (
            <span className="pill">offline · bundled</span>
          )}
          <span className="label">Incident</span>
          <select
            className="field"
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
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
          <RiskMap3D wards={forecast.wards} hour={hour} />
        ) : (
          <div style={{ padding: 24, color: "var(--text-sec)" }} className="label">
            Loading forecast…
          </div>
        )}
        <Legend />
      </main>

      {/* right rail — top half: scenario, bottom half: agent */}
      <aside
        style={{
          gridArea: "panel",
          borderLeft: "1px solid var(--line)",
          minHeight: 0,
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 14,
          padding: 14,
        }}
      >
        <ScenarioPanel onForecastUpdated={onForecastUpdated} />
        <AgentPanel />
      </aside>

      {/* scrubber */}
      <footer style={{ gridArea: "footer", padding: "12px 20px", borderTop: "1px solid var(--line)" }}>
        <TimelineScrubber hour={hour} setHour={setHour} />
      </footer>
    </div>
  );
}

// Reserved space for the dispatch agent — wired up separately.
function AgentPanel() {
  return (
    <section
      className="panel nt-scroll"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="led" />
        <span className="kicker">Dispatch Agent</span>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-mut)",
          textAlign: "center",
        }}
        className="label"
      >
        Agent console — coming soon
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        padding: "12px 14px",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="label" style={{ marginBottom: 8 }}>
        Predicted Risk
      </div>
      <div
        style={{
          width: 160,
          height: 6,
          borderRadius: 3,
          background:
            "linear-gradient(90deg, rgb(40,110,220), rgb(240,220,40), rgb(220,40,40))",
        }}
      />
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 5,
          fontSize: 10,
          color: "var(--text-mut)",
        }}
      >
        <span>LOW</span>
        <span>HIGH</span>
      </div>
    </div>
  );
}
