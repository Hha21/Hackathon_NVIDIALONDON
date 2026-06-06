// hf-station.jsx — Home / "My Station" (variation A: hero-led).
//   Station header + recommendation come from GET /api/mobile/state (native bridge).
//   Accept posts to /api/mobile/accept then opens Google Maps to the routing target.
//   If the backend is unreachable, it falls back to demo data and toasts the user.
//   Active Nearby = live London fire news (Google News RSS via the bridge).

(function () {
  const { useState, useEffect } = React;

  // Demo fallback — keeps the app fully demoable with the server down.
  const DEMO = {
    live: false,
    station: "Lewisham",
    pumps: 1,
    crew: 5,
    rec: { id: "rec_001", destination: "Brockley", lat: 51.464, lon: -0.036, score: 0.78, reason: null },
  };

  const riskLabel = (v) => (v > 0.7 ? "High" : v > 0.4 ? "Med" : "Low");
  const riskWord = (v) => (v > 0.7 ? "HIGH" : v > 0.4 ? "MED" : "LOW");

  function RecommendationCard({ info }) {
    const [state, setState] = useState("idle"); // idle | routing | enroute | declined
    const rec = info.rec;

    const accept = async () => {
      setState("routing");
      let lat = rec.lat, lon = rec.lon;
      const label = rec.destination + " standby";
      if (info.live) {
        try {
          const res = await window.acceptRecommendation(rec.id, info.station, "P1");
          if (res.ok && res.data && res.data.routing_uri) {
            const mm = /geo:(-?[0-9.]+),(-?[0-9.]+)/.exec(res.data.routing_uri);
            if (mm) { lat = parseFloat(mm[1]); lon = parseFloat(mm[2]); }
          } else {
            window.toast("Accept not confirmed by server — routing anyway");
          }
        } catch (e) { window.toast("Accept not confirmed by server — routing anyway"); }
        setState("enroute");
        window.routeTo(label, lat, lon);
      } else {
        // offline demo: brief simulated routing beat, then open Maps
        setTimeout(() => { setState("enroute"); window.routeTo(label, lat, lon); }, 1300);
      }
    };

    if (state === "declined") {
      return (
        <div className="rec-card glass rise" style={{ alignItems: "center", textAlign: "center", padding: "26px 18px" }}>
          <div className="title" style={{ fontSize: 17 }}>Recommendation dismissed</div>
          <div style={{ color: "var(--text-sec)", fontSize: 13.5, margin: "6px 0 16px" }}>Holding position at {info.station}.</div>
          <button className="btn ghost sm" onClick={() => setState("idle")}>Undo</button>
        </div>
      );
    }
    return (
      <div className={"rec-card glass rise" + (state === "idle" ? " glow" : "")}>
        <div className="recmap">
          <Map3D preset="route" dest={[rec.lon, rec.lat]} key={rec.destination} />
          {state === "routing" || state === "enroute" ? (
            <div className={"rec-overlay" + (state === "enroute" ? " done" : "")}>
              {state === "routing" ? <><span className="spinner" /><span>Routing to {rec.destination}…</span></> :
                <><span className="check">✓</span><span>En route · opening Maps</span></>}
            </div>
          ) : null}
        </div>
        <div className="rec-body">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div className="label" style={{ color: "var(--text-sec)", marginBottom: 3 }}>Pre-position</div>
              <div className="display" style={{ fontSize: 27 }}>→ {rec.destination}</div>
            </div>
            <Pill value={rec.score} label={riskLabel(rec.score)} />
          </div>
          <div style={{ color: "var(--text-sec)", fontSize: 13.5, lineHeight: 1.4, margin: "10px 0 4px" }}>
            {info.live && rec.reason ? rec.reason : (
              <>Predicted dwelling-fire risk spike ~<span className="mono" style={{ color: "var(--text-pri)" }}>19:00</span>. Pre-positioning cuts response by an est. 4 min.</>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn ghost" style={{ flex: "0 0 auto", paddingInline: 18 }} onClick={() => setState("declined")} disabled={state !== "idle"}>Decline</button>
            <button className="btn ember full" onClick={accept} disabled={state !== "idle"}>{state === "idle" ? "Accept & route" : "Routing…"}</button>
          </div>
        </div>
      </div>
    );
  }

  function ago(sd) {
    if (!sd || sd.length < 13) return "";
    const t = Date.UTC(+sd.slice(0, 4), +sd.slice(4, 6) - 1, +sd.slice(6, 8), +sd.slice(9, 11), +sd.slice(11, 13));
    const d = (Date.now() - t) / 60000;
    if (d < 60) return Math.max(1, Math.round(d)) + "m ago";
    if (d < 1440) return Math.round(d / 60) + "h ago";
    return Math.round(d / 1440) + "d ago";
  }

  function ActiveNearby() {
    const [items, setItems] = useState(null);
    useEffect(() => {
      let alive = true;
      window.loadNews().then((arts) => { if (alive) setItems((arts || []).slice(0, 6)); });
      return () => { alive = false; };
    }, []);
    if (items === null) return <div className="news-empty">Loading live London fire reports…</div>;
    if (!items.length) return <div className="news-empty">No live reports right now.</div>;
    return (
      <div>
        {items.map((a, i) => (
          <div key={i} className="irow news-row" onClick={() => window.openArticle(a.url)}>
            <span className="news-tick" />
            <span className="mid"><span className="t news-title">{a.title}</span><span className="s news-src">{a.domain}{a.seendate ? " · " + ago(a.seendate) : ""}</span></span>
            <span className="news-chev">›</span>
          </div>
        ))}
      </div>
    );
  }

  const STATIONS = ["Lewisham", "New Cross", "Deptford", "Greenwich", "Peckham", "Forest Hill", "Old Kent Road"];

  function Station({ goGlobe }) {
    const [station, setStation] = useState("Lewisham");
    const [picking, setPicking] = useState(false);
    const [info, setInfo] = useState(DEMO);

    useEffect(() => {
      let alive = true;
      window.loadState(station).then(({ ok, data }) => {
        if (!alive) return;
        const recs = data && data.recommendations;
        if (ok && recs && recs.length) {
          const r = recs[0];
          const m = /risk\s+([0-9.]+)/i.exec(r.reason || "");
          setInfo({
            live: true,
            station: data.station || station,
            pumps: typeof data.available_pumps === "number" ? data.available_pumps : 1,
            crew: 5, // not in the mobile contract; kept static
            rec: {
              id: r.recommendation_id,
              destination: r.destination,
              lat: r.lat, lon: r.lon,
              reason: r.reason,
              score: m ? parseFloat(m[1]) : 0.78,
            },
          });
        } else {
          setInfo({ ...DEMO, station }); // keep the chosen station label even offline
          window.toast("Live data unavailable — showing demo data");
        }
      });
      return () => { alive = false; };
    }, [station]);

    return (
      <div className="view">
        <Hero />
        <div className="scroll">
          <div style={{ height: 252 }} />
          <div className="pad">
            <div className="glass rise" style={{ padding: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>Station</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button className="station-pick" onClick={() => setPicking(true)}>
                  <span className="display" style={{ fontSize: 32 }}>{info.station}</span>
                  <svg className="station-chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span className="sdot sig" /><span className="label" style={{ fontSize: 10 }}>On duty</span>
                </span>
              </div>
              <div style={{ color: "var(--text-sec)", fontSize: 13 }}>SE London</div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <Chip k="Pumps free" v={String(info.pumps)} />
                <Chip k="Risk" v={riskWord(info.rec.score)} ember />
                <Chip k="Crew" v={String(info.crew)} />
              </div>
            </div>

            <div style={{ height: 72 }} />
            <RecommendationCard info={info} key={info.station + (info.live ? "-live" : "-demo")} />

            <SecHead link="See globe" onLink={goGlobe}>Active nearby · live</SecHead>
            <div style={{ marginBottom: 4 }}>
              <ActiveNearby />
            </div>
          </div>
          <div className="navspace" />
        </div>

        {picking ? (
          <div className="station-scrim" onClick={() => setPicking(false)}>
            <div className="station-sheet glass" onClick={(e) => e.stopPropagation()}>
              <div className="label" style={{ marginBottom: 10 }}>Select station</div>
              {STATIONS.map((s) => (
                <button key={s} className={"station-opt" + (s === info.station ? " on" : "")}
                  onClick={() => { setStation(s); setPicking(false); }}>
                  <span>{s}</span>
                  {s === info.station ? <span className="station-tick">✓</span> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  window.Station = Station;
})();
