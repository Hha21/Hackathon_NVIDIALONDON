// hf-globe.jsx — Globe (variation C): full-bleed REAL 3D map (70vh) + waveform scrubber + ranked list + ward sheet.
// Markers on the map stay in sync with the time slider; sliding focuses the hottest ward.

(function () {
  const { useState, useEffect, useRef } = React;
  const rc = window.riskColor;

  const WARDS = [
    { name: "Brockley", peak: 19, base: 0.88, type: "Dwelling fire", expected: 3 },
    { name: "New Cross", peak: 21, base: 0.74, type: "Outdoor fire", expected: 2 },
    { name: "Deptford", peak: 18, base: 0.6, type: "Automatic alarm", expected: 2 },
    { name: "Catford", peak: 23, base: 0.52, type: "Rubbish fire", expected: 1 },
    { name: "Forest Hill", peak: 17, base: 0.44, type: "Road collision", expected: 1 },
    { name: "Sydenham", peak: 20, base: 0.38, type: "Dwelling fire", expected: 1 },
  ];
  const riskAt = (w, h) => Math.min(0.97, Math.max(0.05, w.base * Math.exp(-((h - w.peak) ** 2) / 18) + 0.04));
  const fmtH = (h) => String(h).padStart(2, "0") + ":00";
  const coordsOf = (name) => (window.FD_WARDS || []).find((x) => x.name === name);

  function Scrubber({ hour, setHour, playing, setPlaying }) {
    const totals = Array.from({ length: 24 }).map((_, h) => WARDS.reduce((s, w) => s + riskAt(w, h), 0));
    const mx = Math.max(...totals);
    const spark = totals.map((t, h) => `${(h / 23) * 100},${20 - (t / mx) * 16}`).join(" ");
    const midRef = React.useRef();
    const setFromX = (clientX) => {
      const el = midRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      let f = (clientX - r.left) / r.width; f = Math.max(0, Math.min(1, f));
      setPlaying(false); setHour(Math.round(f * 23));
    };
    const onDown = (e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} setFromX(e.clientX); };
    const onMove = (e) => { if (e.buttons === 1) setFromX(e.clientX); };
    return (
      <div className="scrubber glass">
        <div className="scrub-play" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚" : "▶"}</div>
        <div className="scrub-mid" ref={midRef} onPointerDown={onDown} onPointerMove={onMove} style={{ touchAction: "none", cursor: "pointer" }}>
          <svg className="scrub-spark" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline points={spark} fill="none" stroke="var(--ember)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></svg>
          <div className="scrub-track">
            <div className="scrub-fill" style={{ width: (hour / 23) * 100 + "%" }} />
            <div className="scrub-knob" style={{ left: (hour / 23) * 100 + "%" }} />
          </div>
        </div>
        <div className="scrub-time mono">{fmtH(hour)}</div>
      </div>
    );
  }

  function WardSheet({ ward, hour, onClose }) {
    if (!ward) return null;
    const r = riskAt(ward, hour);
    const curve = Array.from({ length: 24 }).map((_, h) => `${(h / 23) * 100},${28 - riskAt(ward, h) * 26}`).join(" ");
    const route = () => window.routeByName(ward.name);
    return (
      <>
        <div className="sheet-scrim" onClick={onClose} />
        <div className="ward-sheet glass rise">
          <span className="grip" />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div><div className="display" style={{ fontSize: 26 }}>{ward.name}</div><div style={{ color: "var(--text-sec)", fontSize: 13 }}>{ward.type} · {fmtH(hour)}</div></div>
            <Pill value={r} label={r > 0.7 ? "High" : r > 0.4 ? "Med" : "Low"} />
          </div>
          <div style={{ display: "flex", gap: 10, margin: "14px 0" }}>
            <Chip k="Expected" v={ward.expected} ember />
            <Chip k="Peak" v={fmtH(ward.peak)} />
            <Chip k="Now" v={r.toFixed(2)} />
          </div>
          <div className="label" style={{ marginBottom: 6 }}>24-hour risk</div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 40, marginBottom: 14 }}>
            <polyline points={curve} fill="none" stroke={rc(r)} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            <line x1={(hour / 23) * 100} y1="0" x2={(hour / 23) * 100} y2="30" stroke="var(--glass-stroke)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <button className="btn ember full" onClick={route}>Route here →</button>
        </div>
      </>
    );
  }

  function Globe() {
    const [hour, setHour] = useState(19);
    const [playing, setPlaying] = useState(false);
    const [sel, setSel] = useState(null);
    const ref = useRef();
    useEffect(() => {
      if (!playing) return;
      ref.current = setInterval(() => setHour((h) => (h + 1) % 24), 700);
      return () => clearInterval(ref.current);
    }, [playing]);

    const ranked = [...WARDS].sort((a, b) => riskAt(b, hour) - riskAt(a, hour));

    // Keep the on-map markers + camera in sync with the selected hour.
    useEffect(() => {
      const risks = {};
      WARDS.forEach((w) => { risks[w.name] = riskAt(w, hour); });
      if (window.__globeUpdate) window.__globeUpdate(risks);
      const top = ranked[0], c = top && coordsOf(top.name);
      if (c && window.__globeFocus) window.__globeFocus(c.lon, c.lat);
    }, [hour]);

    return (
      <div className="view">
        <div className="globe-map"><Map3D preset="heat" /><div className="globe-mapfade" /></div>

        <div className="globe-sheet">
          <div className="pad" style={{ paddingTop: 14 }}>
            <Scrubber hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} />
            <div className="legend"><span className="lk">Low</span><span className="legend-bar" /><span className="lk">High</span></div>
            <div className="sec-head" style={{ marginTop: 16 }}><div className="label">Hotspots · {fmtH(hour)}</div><div className="label" style={{ color: "var(--text-mut)" }}>{ranked.length} wards</div></div>
            {ranked.map((w, i) => {
              const r = riskAt(w, hour);
              return (
                <div key={w.name} className="ward-row" onClick={() => { setSel(w); const c = coordsOf(w.name); if (c && window.__globeFocus) window.__globeFocus(c.lon, c.lat); }}>
                  <span className="mono rank" style={{ color: i === 0 ? "var(--ember)" : "var(--text-mut)" }}>{i + 1}</span>
                  <span className="mid"><span className="t">{w.name}</span><span className="s">{w.type}</span></span>
                  <Pill value={r} />
                  <span className="chev">›</span>
                </div>
              );
            })}
          </div>
          <div className="navspace" />
        </div>

        <WardSheet ward={sel} hour={hour} onClose={() => setSel(null)} />
      </div>
    );
  }
  window.Globe = Globe;
})();
