// hf-map.jsx — REAL maps via MapLibre GL JS (CARTO dark-matter, free, no key) + 3D buildings.
//   preset "route": tilted 3D map, real OSRM route from current GPS -> Brockley (Station/Assistant card).
//   preset "heat":  full, pannable 3D London map with ward hotspot labels (Globe).

(function () {
  const BROCKLEY = [-0.0357, 51.4646];
  const LEWISHAM = [-0.0117, 51.4626]; // fallback "you"
  const DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

  const WARDS = [
    { name: "Brockley", lon: -0.0357, lat: 51.4646, base: 0.88, type: "Dwelling fire" },
    { name: "New Cross", lon: -0.0333, lat: 51.4767, base: 0.74, type: "Outdoor fire" },
    { name: "Deptford", lon: -0.0265, lat: 51.4793, base: 0.60, type: "Automatic alarm" },
    { name: "Catford", lon: -0.0207, lat: 51.4452, base: 0.52, type: "Rubbish fire" },
    { name: "Forest Hill", lon: -0.0530, lat: 51.4393, base: 0.44, type: "Road collision" },
    { name: "Sydenham", lon: -0.0530, lat: 51.4270, base: 0.38, type: "Dwelling fire" },
  ];
  window.FD_WARDS = WARDS;

  function riskColor(v) {
    const stops = [[0, [43, 212, 125]], [0.4, [245, 197, 24]], [0.7, [255, 106, 26]], [0.9, [255, 61, 46]], [1, [255, 61, 46]]];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) if (v >= stops[i][0] && v <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    const t = (v - a[0]) / ((b[0] - a[0]) || 1);
    const c = a[1].map((ch, i) => Math.round(ch + (b[1][i] - ch) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  window.riskColor = riskColor;

  function add3DBuildings(map, minzoom, holo, hMult) {
    try {
      const sources = map.getStyle().sources;
      const vid = Object.keys(sources).find((k) => sources[k].type === "vector");
      if (!vid || map.getLayer("fd-3d")) return;
      const sym = map.getStyle().layers.find((l) => l.type === "symbol");
      // dark = the Station card "isometric blocks" look; otherwise the grey globe city
      const color = holo
        ? ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10], 0, "#15181e", 60, "#1d222a", 160, "#262c35"]
        : ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 10], 0, "#46506a", 25, "#5a6684", 80, "#7a6a9a", 180, "#9a6a72"];
      map.addLayer({
        id: "fd-3d", source: vid, "source-layer": "building", type: "fill-extrusion", minzoom: minzoom || 13,
        paint: {
          "fill-extrusion-color": color,
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, ["*", ["coalesce", ["get", "render_height"], 12], hMult || 8]],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.98,
          "fill-extrusion-vertical-gradient": true,
        },
      }, sym && sym.id);
      // Glowing amber building edges (the diorama "city-lights" look) — card only.
      if (holo) {
        map.addLayer({
          id: "fd-3d-edge", source: vid, "source-layer": "building", type: "line", minzoom: 13,
          paint: {
            "line-color": "#FFAE48",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 16, 1.3, 18, 2.2],
            "line-opacity": 0.65, "line-blur": 0.6,
          },
        }, sym && sym.id);
      }
    } catch (e) { console.log("3D buildings fail: " + e); }
  }

  // Fire hydrants placed along the real road network for the current view (so they're
  // everywhere there are streets, on actual roads). Refetched as the user pans.
  function fetchHydrants(map) {
    let b; try { b = map.getBounds(); } catch (e) { return; }
    const bbox = [b.getSouth().toFixed(4), b.getWest().toFixed(4), b.getNorth().toFixed(4), b.getEast().toFixed(4)].join(",");
    const q = '[out:json][timeout:25];way[highway~"^(residential|living_street|tertiary|tertiary_link|secondary|secondary_link|primary|unclassified|service)$"](' + bbox + ");out geom 1400;";
    fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: q })
      .then((r) => r.json())
      .then((j) => {
        // Only keep hydrants within ~1km of a likely-incident ward (vicinity of risk).
        const wards = window.FD_WARDS || [];
        const near = (lon, lat) => wards.some((w) => {
          const dx = (lon - w.lon) * Math.cos(lat * Math.PI / 180) * 111320;
          const dy = (lat - w.lat) * 110540;
          return Math.hypot(dx, dy) < 200;
        });
        const feats = [];
        (j.elements || []).forEach((w) => {
          const g = w.geometry; if (!g) return;
          for (let i = 1; i < g.length; i += 3) {
            if (near(g[i].lon, g[i].lat)) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [g[i].lon, g[i].lat] }, properties: {} });
          }
        });
        const data = { type: "FeatureCollection", features: feats.slice(0, 3000) };
        console.log("FDHYD roads pts=" + data.features.length);
        if (map.getSource("hydrants")) { map.getSource("hydrants").setData(data); return; }
        map.addSource("hydrants", { type: "geojson", data });
        map.addLayer({
          id: "hydrants", type: "circle", source: "hydrants", minzoom: 13,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.6, 16, 2.8, 18, 4],
            "circle-color": "#3FB7FF", "circle-opacity": 0.95,
            "circle-stroke-width": 0.6, "circle-stroke-color": "#dff0ff",
          },
        });
      })
      .catch((e) => console.log("FDHYD fail: " + e));
  }
  function addHydrants(map) {
    fetchHydrants(map);
    let t = null;
    map.on("moveend", () => { clearTimeout(t); t = setTimeout(() => { if (map.getZoom() >= 12.5) fetchHydrants(map); }, 700); });
  }

  function bearingTo(a, b) {
    const r = (d) => d * Math.PI / 180, d = (x) => x * 180 / Math.PI;
    const y = Math.sin(r(b[0] - a[0])) * Math.cos(r(b[1]));
    const x = Math.cos(r(a[1])) * Math.sin(r(b[1])) - Math.sin(r(a[1])) * Math.cos(r(b[1])) * Math.cos(r(b[0] - a[0]));
    return (d(Math.atan2(y, x)) + 360) % 360;
  }

  function addRoute(map, you) {
    const mgl = window.maplibregl;
    const draw = (coords) => {
      try {
        if (map.getSource("route")) {
          map.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
          return;
        }
        map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
        // solid glowing neon-blue route (outer glow -> mid -> bright core)
        map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2E9BFF", "line-width": 28, "line-opacity": 0.45, "line-blur": 12 } });
        map.addLayer({ id: "route-mid", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3FA9FF", "line-width": 13, "line-opacity": 0.9, "line-blur": 2 } });
        map.addLayer({ id: "route-core", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#DCF0FF", "line-width": 5 } });
        const youEl = document.createElement("div"); youEl.className = "you-pin";
        new mgl.Marker({ element: youEl, anchor: "center" }).setLngLat(you).addTo(map);
        const destEl = document.createElement("div"); destEl.className = "dest-pin"; destEl.innerHTML = "<span></span>";
        new mgl.Marker({ element: destEl, anchor: "bottom" }).setLngLat(BROCKLEY).addTo(map);
        // Isometric diorama focused on the start location, route heading to the destination.
        map.jumpTo({ center: you, zoom: 15.3, pitch: 58, bearing: bearingTo(you, BROCKLEY) });
        console.log("FDROUTE drawn pts=" + coords.length);
      } catch (e) { console.log("FDROUTE err " + e); }
    };
    // Draw a straight line immediately so the route always shows, then upgrade to the
    // real road geometry when OSRM responds (it can hang, so never block on it).
    draw([you, BROCKLEY]);
    fetch(`https://router.project-osrm.org/route/v1/driving/${you[0]},${you[1]};${BROCKLEY[0]},${BROCKLEY[1]}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((j) => { const c = j && j.routes && j.routes[0] && j.routes[0].geometry && j.routes[0].geometry.coordinates; if (c && c.length) draw(c); })
      .catch((e) => console.log("FDROUTE osrm fail " + e));
  }

  function getYou(cb) {
    if (!navigator.geolocation) return cb(LEWISHAM);
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; cb(LEWISHAM); } }, 4000);
    navigator.geolocation.getCurrentPosition(
      (p) => { if (done) return; done = true; clearTimeout(t); cb([p.coords.longitude, p.coords.latitude]); },
      () => { if (done) return; done = true; clearTimeout(t); cb(LEWISHAM); },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 60000 }
    );
  }

  function addHotspots(map) {
    const mgl = window.maplibregl;
    const reg = {};
    WARDS.forEach((w) => {
      const el = document.createElement("div");
      el.className = "ward-marker";
      el.innerHTML =
        '<div class="wm-card"><div class="wm-top"><span class="wm-dot"></span>' +
        '<span class="wm-name">' + w.name + '</span><span class="wm-risk"></span></div>' +
        '<div class="wm-sub">' + w.type + '</div></div><div class="wm-stem"></div>';
      new mgl.Marker({ element: el, anchor: "bottom" }).setLngLat([w.lon, w.lat]).addTo(map);
      reg[w.name] = { dot: el.querySelector(".wm-dot"), risk: el.querySelector(".wm-risk") };
    });
    const paint = (name, v) => {
      const r = reg[name]; if (!r) return; const c = riskColor(v);
      r.dot.style.background = c; r.dot.style.boxShadow = "0 0 8px " + c;
      r.risk.textContent = v.toFixed(2); r.risk.style.color = c;
    };
    WARDS.forEach((w) => paint(w.name, w.base));
    // Keep the on-map markers in sync with the time slider (so map == ranked list).
    window.__globeUpdate = (risks) => { Object.keys(risks).forEach((n) => paint(n, risks[n])); };
    window.__globeFocus = (lon, lat) => { try { map.flyTo({ center: [lon, lat], zoom: 14.5, pitch: 60, duration: 1300, essential: true }); } catch (e) {} };
  }

  function Map3D({ preset = "route", className = "", style }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const mgl = window.maplibregl;
      if (!mgl || !ref.current) return;
      const isHeat = preset === "heat";
      const map = new mgl.Map({
        container: ref.current, style: DARK,
        center: isHeat ? [-0.03, 51.462] : [-0.0117, 51.4626],
        zoom: isHeat ? 13 : 15.3,
        pitch: isHeat ? 60 : 58, bearing: isHeat ? -18 : -28,
        maxPitch: 85, interactive: isHeat, dragRotate: isHeat,
        attributionControl: false,
      });
      window.__map = map;
      map.on("error", (e) => { const msg = (e && e.error && e.error.message) || "?"; window.__mapErr = msg; try { console.log("MAPERR " + msg); } catch (_) {} });
      map.on("load", () => {
        const c = map.getCanvas(), ct = map.getContainer();
        console.log("MAPLOAD preset=" + preset + " style=" + map.isStyleLoaded() + " canvas=" + c.width + "x" + c.height + " ctr=" + ct.clientWidth + "x" + ct.clientHeight);
        add3DBuildings(map, isHeat ? 12.5 : 13, !isHeat, isHeat ? 4 : 15);   // tall skyline on the card, short on the globe (so streets/hydrants show)
        // Card: transparent sky so the blurred backdrop shows behind the buildings.
        try { if (map.getLayer("background")) map.setPaintProperty("background", "background-color", isHeat ? "#0A0B0D" : "rgba(0,0,0,0)"); } catch (e) {}
        // On the card, hide labels so it's clean blocks bleeding out of the card.
        if (!isHeat) {
          try { map.getStyle().layers.forEach((l) => { if (l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none"); }); } catch (e) {}
        }
        if (isHeat) { addHotspots(map); addHydrants(map); }   // hydrants (200m of wards) only on the globe
        else addRoute(map, LEWISHAM);   // route starts at the station
        map.resize();
      });
      const tid = setTimeout(() => { try { map.resize(); console.log("MAPRESIZE " + map.getContainer().clientWidth + "x" + map.getContainer().clientHeight); } catch (e) {} }, 600);
      return () => { clearTimeout(tid); try { map.remove(); } catch (e) {} if (isHeat) window.__globeFocus = null; };
    }, [preset]);
    return <div ref={ref} className={"mlmap " + className} style={style} />;
  }

  window.Map3D = Map3D;
})();
