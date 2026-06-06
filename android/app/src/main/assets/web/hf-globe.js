// hf-globe.jsx — Globe (variation C): full-bleed REAL 3D map (70vh) + waveform scrubber + ranked list + ward sheet.
// Markers on the map stay in sync with the time slider; sliding focuses the hottest ward.

(function () {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const rc = window.riskColor;
  const WARDS = [{
    name: "Brockley",
    peak: 19,
    base: 0.88,
    type: "Dwelling fire",
    expected: 3
  }, {
    name: "New Cross",
    peak: 21,
    base: 0.74,
    type: "Outdoor fire",
    expected: 2
  }, {
    name: "Deptford",
    peak: 18,
    base: 0.6,
    type: "Automatic alarm",
    expected: 2
  }, {
    name: "Catford",
    peak: 23,
    base: 0.52,
    type: "Rubbish fire",
    expected: 1
  }, {
    name: "Forest Hill",
    peak: 17,
    base: 0.44,
    type: "Road collision",
    expected: 1
  }, {
    name: "Sydenham",
    peak: 20,
    base: 0.38,
    type: "Dwelling fire",
    expected: 1
  }];
  const riskAt = (w, h) => Math.min(0.97, Math.max(0.05, w.base * Math.exp(-((h - w.peak) ** 2) / 18) + 0.04));
  const fmtH = h => String(h).padStart(2, "0") + ":00";
  const coordsOf = name => (window.FD_WARDS || []).find(x => x.name === name);
  function Scrubber({
    hour,
    setHour,
    playing,
    setPlaying
  }) {
    const totals = Array.from({
      length: 24
    }).map((_, h) => WARDS.reduce((s, w) => s + riskAt(w, h), 0));
    const mx = Math.max(...totals);
    const spark = totals.map((t, h) => `${h / 23 * 100},${20 - t / mx * 16}`).join(" ");
    const midRef = React.useRef();
    const setFromX = clientX => {
      const el = midRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let f = (clientX - r.left) / r.width;
      f = Math.max(0, Math.min(1, f));
      setPlaying(false);
      setHour(Math.round(f * 23));
    };
    const onDown = e => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
      setFromX(e.clientX);
    };
    const onMove = e => {
      if (e.buttons === 1) setFromX(e.clientX);
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "scrubber glass"
    }, /*#__PURE__*/React.createElement("div", {
      className: "scrub-play",
      onClick: () => setPlaying(p => !p)
    }, playing ? "❚❚" : "▶"), /*#__PURE__*/React.createElement("div", {
      className: "scrub-mid",
      ref: midRef,
      onPointerDown: onDown,
      onPointerMove: onMove,
      style: {
        touchAction: "none",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      className: "scrub-spark",
      viewBox: "0 0 100 20",
      preserveAspectRatio: "none"
    }, /*#__PURE__*/React.createElement("polyline", {
      points: spark,
      fill: "none",
      stroke: "var(--ember)",
      strokeWidth: "1.2",
      vectorEffect: "non-scaling-stroke"
    })), /*#__PURE__*/React.createElement("div", {
      className: "scrub-track"
    }, /*#__PURE__*/React.createElement("div", {
      className: "scrub-fill",
      style: {
        width: hour / 23 * 100 + "%"
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "scrub-knob",
      style: {
        left: hour / 23 * 100 + "%"
      }
    }))), /*#__PURE__*/React.createElement("div", {
      className: "scrub-time mono"
    }, fmtH(hour)));
  }
  function WardSheet({
    ward,
    hour,
    onClose
  }) {
    if (!ward) return null;
    const r = riskAt(ward, hour);
    const curve = Array.from({
      length: 24
    }).map((_, h) => `${h / 23 * 100},${28 - riskAt(ward, h) * 26}`).join(" ");
    const route = () => window.routeByName(ward.name);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "sheet-scrim",
      onClick: onClose
    }), /*#__PURE__*/React.createElement("div", {
      className: "ward-sheet glass rise"
    }, /*#__PURE__*/React.createElement("span", {
      className: "grip"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "display",
      style: {
        fontSize: 26
      }
    }, ward.name), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-sec)",
        fontSize: 13
      }
    }, ward.type, " \xB7 ", fmtH(hour))), /*#__PURE__*/React.createElement(Pill, {
      value: r,
      label: r > 0.7 ? "High" : r > 0.4 ? "Med" : "Low"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        margin: "14px 0"
      }
    }, /*#__PURE__*/React.createElement(Chip, {
      k: "Expected",
      v: ward.expected,
      ember: true
    }), /*#__PURE__*/React.createElement(Chip, {
      k: "Peak",
      v: fmtH(ward.peak)
    }), /*#__PURE__*/React.createElement(Chip, {
      k: "Now",
      v: r.toFixed(2)
    })), /*#__PURE__*/React.createElement("div", {
      className: "label",
      style: {
        marginBottom: 6
      }
    }, "24-hour risk"), /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 100 30",
      preserveAspectRatio: "none",
      style: {
        width: "100%",
        height: 40,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("polyline", {
      points: curve,
      fill: "none",
      stroke: rc(r),
      strokeWidth: "1.6",
      vectorEffect: "non-scaling-stroke"
    }), /*#__PURE__*/React.createElement("line", {
      x1: hour / 23 * 100,
      y1: "0",
      x2: hour / 23 * 100,
      y2: "30",
      stroke: "var(--glass-stroke)",
      strokeWidth: "1",
      vectorEffect: "non-scaling-stroke"
    })), /*#__PURE__*/React.createElement("button", {
      className: "btn ember full",
      onClick: route
    }, "Route here \u2192")));
  }
  function Globe() {
    const [hour, setHour] = useState(19);
    const [playing, setPlaying] = useState(false);
    const [sel, setSel] = useState(null);
    const ref = useRef();
    useEffect(() => {
      if (!playing) return;
      ref.current = setInterval(() => setHour(h => (h + 1) % 24), 700);
      return () => clearInterval(ref.current);
    }, [playing]);
    const ranked = [...WARDS].sort((a, b) => riskAt(b, hour) - riskAt(a, hour));

    // Keep the on-map markers + camera in sync with the selected hour.
    useEffect(() => {
      const risks = {};
      WARDS.forEach(w => {
        risks[w.name] = riskAt(w, hour);
      });
      if (window.__globeUpdate) window.__globeUpdate(risks);
      const top = ranked[0],
        c = top && coordsOf(top.name);
      if (c && window.__globeFocus) window.__globeFocus(c.lon, c.lat);
    }, [hour]);
    return /*#__PURE__*/React.createElement("div", {
      className: "view"
    }, /*#__PURE__*/React.createElement("div", {
      className: "globe-map"
    }, /*#__PURE__*/React.createElement(Map3D, {
      preset: "heat"
    }), /*#__PURE__*/React.createElement("div", {
      className: "globe-mapfade"
    })), /*#__PURE__*/React.createElement("div", {
      className: "globe-sheet"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pad",
      style: {
        paddingTop: 14
      }
    }, /*#__PURE__*/React.createElement(Scrubber, {
      hour: hour,
      setHour: setHour,
      playing: playing,
      setPlaying: setPlaying
    }), /*#__PURE__*/React.createElement("div", {
      className: "legend"
    }, /*#__PURE__*/React.createElement("span", {
      className: "lk"
    }, "Low"), /*#__PURE__*/React.createElement("span", {
      className: "legend-bar"
    }), /*#__PURE__*/React.createElement("span", {
      className: "lk"
    }, "High")), /*#__PURE__*/React.createElement("div", {
      className: "sec-head",
      style: {
        marginTop: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "label"
    }, "Hotspots \xB7 ", fmtH(hour)), /*#__PURE__*/React.createElement("div", {
      className: "label",
      style: {
        color: "var(--text-mut)"
      }
    }, ranked.length, " wards")), ranked.map((w, i) => {
      const r = riskAt(w, hour);
      return /*#__PURE__*/React.createElement("div", {
        key: w.name,
        className: "ward-row",
        onClick: () => {
          setSel(w);
          const c = coordsOf(w.name);
          if (c && window.__globeFocus) window.__globeFocus(c.lon, c.lat);
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "mono rank",
        style: {
          color: i === 0 ? "var(--ember)" : "var(--text-mut)"
        }
      }, i + 1), /*#__PURE__*/React.createElement("span", {
        className: "mid"
      }, /*#__PURE__*/React.createElement("span", {
        className: "t"
      }, w.name), /*#__PURE__*/React.createElement("span", {
        className: "s"
      }, w.type)), /*#__PURE__*/React.createElement(Pill, {
        value: r
      }), /*#__PURE__*/React.createElement("span", {
        className: "chev"
      }, "\u203A"));
    })), /*#__PURE__*/React.createElement("div", {
      className: "navspace"
    })), /*#__PURE__*/React.createElement(WardSheet, {
      ward: sel,
      hour: hour,
      onClose: () => setSel(null)
    }));
  }
  window.Globe = Globe;
})();