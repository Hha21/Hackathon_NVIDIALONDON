// hf-station.jsx — Home / "My Station" (variation A: hero-led). Active Nearby = live London fire news.

(function () {
  const { useState, useEffect } = React;

  function RecommendationCard() {
    const [state, setState] = useState("idle"); // idle | routing | enroute | declined
    const accept = () => {
      setState("routing");
      setTimeout(() => {
        setState("enroute");
        window.routeTo("Brockley standby", 51.464, -0.036);
      }, 1300);
    };
    if (state === "declined") {
      return (
        <div className="rec-card glass rise" style={{ alignItems: "center", textAlign: "center", padding: "26px 18px" }}>
          <div className="title" style={{ fontSize: 17 }}>Recommendation dismissed</div>
          <div style={{ color: "var(--text-sec)", fontSize: 13.5, margin: "6px 0 16px" }}>Holding position at Lewisham.</div>
          <button className="btn ghost sm" onClick={() => setState("idle")}>Undo</button>
        </div>
      );
    }
    return (
      <div className={"rec-card glass rise" + (state === "idle" ? " glow" : "")}>
        <div className="recmap">
          <Map3D preset="route" />
          {state === "routing" || state === "enroute" ? (
            <div className={"rec-overlay" + (state === "enroute" ? " done" : "")}>
              {state === "routing" ? <><span className="spinner" /><span>Routing to Brockley…</span></> :
                <><span className="check">✓</span><span>En route · opening Maps</span></>}
            </div>
          ) : null}
        </div>
        <div className="rec-body">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div className="label" style={{ color: "var(--text-sec)", marginBottom: 3 }}>Pre-position</div>
              <div className="display" style={{ fontSize: 27 }}>→ Brockley</div>
            </div>
            <Pill value={0.78} label="High" />
          </div>
          <div style={{ color: "var(--text-sec)", fontSize: 13.5, lineHeight: 1.4, margin: "10px 0 4px" }}>
            Predicted dwelling-fire risk spike ~<span className="mono" style={{ color: "var(--text-pri)" }}>19:00</span>. Pre-positioning cuts response by an est. 4 min.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn ghost" style={{ flex: "0 0 auto", paddingInline: 18 }} onClick={() => setState("declined")} disabled={state !== "idle"}>Decline</button>
            <button className="btn ember full" onClick={accept} disabled={state !== "idle"}>{state === "idle" ? "Accept & route" : "Routing…"}</button>
          </div>
        </div>
      </div>
    );
  }

  const flame = (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M12 3c1 3-2 4-2 7a4 4 0 108 0c0-2-1-3-1.5-4 .2 2-1 3-1.5 2.5C13 7 14 5 12 3Z" fill="#FF6A1A" />
      <path d="M9.5 13a2.5 2.5 0 105 0c0-1-.8-1.6-1-2.2-.3.9-.8 1-1.3.8-.5-.3-.2-1.2.1-1.6-1 .5-2.3 1.7-2.8 3Z" fill="#FFC24B" />
    </svg>
  );
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

  function Station({ goGlobe }) {
    return (
      <div className="view">
        <Hero />
        <div className="scroll">
          <div style={{ height: 252 }} />
          <div className="pad">
            <div className="glass rise" style={{ padding: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>Station</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="display" style={{ fontSize: 32 }}>Lewisham</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <span className="sdot sig" /><span className="label" style={{ fontSize: 10 }}>On duty</span>
                </span>
              </div>
              <div style={{ color: "var(--text-sec)", fontSize: 13 }}>Lewisham, SE London</div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <Chip k="Pumps free" v="1" />
                <Chip k="Risk" v="HIGH" ember />
                <Chip k="Crew" v="5" />
              </div>
            </div>

            <div style={{ height: 72 }} />
            <RecommendationCard />

            <SecHead link="See globe" onLink={goGlobe}>Active nearby · live</SecHead>
            <div style={{ marginBottom: 4 }}>
              <ActiveNearby />
            </div>
          </div>
          <div className="navspace" />
        </div>
      </div>
    );
  }
  window.Station = Station;
})();
