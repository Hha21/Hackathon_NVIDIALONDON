// hf-station.jsx — Home / "My Station" (variation A: hero-led).
//   Station header + recommendation come from GET /api/mobile/state (native bridge).
//   Accept posts to /api/mobile/accept then opens Google Maps to the routing target.
//   If the backend is unreachable, it falls back to demo data and toasts the user.
//   Active Nearby = live London fire news (Google News RSS via the bridge).

(function () {
  const {
    useState,
    useEffect
  } = React;

  // Demo fallback — keeps the app fully demoable with the server down.
  const DEMO = {
    live: false,
    station: "Lewisham",
    pumps: 1,
    crew: 5,
    rec: {
      id: "rec_001",
      destination: "Brockley",
      lat: 51.464,
      lon: -0.036,
      score: 0.78,
      reason: null
    }
  };
  const riskLabel = v => v > 0.7 ? "High" : v > 0.4 ? "Med" : "Low";
  const riskWord = v => v > 0.7 ? "HIGH" : v > 0.4 ? "MED" : "LOW";
  function RecommendationCard({
    info
  }) {
    const [state, setState] = useState("idle"); // idle | routing | enroute | declined
    const rec = info.rec;
    const accept = async () => {
      setState("routing");
      let lat = rec.lat,
        lon = rec.lon;
      const label = rec.destination + " standby";
      if (info.live) {
        try {
          const res = await window.acceptRecommendation(rec.id, info.station, "P1");
          if (res.ok && res.data && res.data.routing_uri) {
            const mm = /geo:(-?[0-9.]+),(-?[0-9.]+)/.exec(res.data.routing_uri);
            if (mm) {
              lat = parseFloat(mm[1]);
              lon = parseFloat(mm[2]);
            }
          } else {
            window.toast("Accept not confirmed by server — routing anyway");
          }
        } catch (e) {
          window.toast("Accept not confirmed by server — routing anyway");
        }
        setState("enroute");
        window.routeTo(label, lat, lon);
      } else {
        // offline demo: brief simulated routing beat, then open Maps
        setTimeout(() => {
          setState("enroute");
          window.routeTo(label, lat, lon);
        }, 1300);
      }
    };
    if (state === "declined") {
      return /*#__PURE__*/React.createElement("div", {
        className: "rec-card glass rise",
        style: {
          alignItems: "center",
          textAlign: "center",
          padding: "26px 18px"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "title",
        style: {
          fontSize: 17
        }
      }, "Recommendation dismissed"), /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--text-sec)",
          fontSize: 13.5,
          margin: "6px 0 16px"
        }
      }, "Holding position at ", info.station, "."), /*#__PURE__*/React.createElement("button", {
        className: "btn ghost sm",
        onClick: () => setState("idle")
      }, "Undo"));
    }
    return /*#__PURE__*/React.createElement("div", {
      className: "rec-card glass rise" + (state === "idle" ? " glow" : "")
    }, /*#__PURE__*/React.createElement("div", {
      className: "recmap"
    }, /*#__PURE__*/React.createElement(Map3D, {
      preset: "route",
      dest: [rec.lon, rec.lat],
      key: rec.destination
    }), state === "routing" || state === "enroute" ? /*#__PURE__*/React.createElement("div", {
      className: "rec-overlay" + (state === "enroute" ? " done" : "")
    }, state === "routing" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "spinner"
    }), /*#__PURE__*/React.createElement("span", null, "Routing to ", rec.destination, "\u2026")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "check"
    }, "\u2713"), /*#__PURE__*/React.createElement("span", null, "En route \xB7 opening Maps"))) : null), /*#__PURE__*/React.createElement("div", {
      className: "rec-body"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "label",
      style: {
        color: "var(--text-sec)",
        marginBottom: 3
      }
    }, "Pre-position"), /*#__PURE__*/React.createElement("div", {
      className: "display",
      style: {
        fontSize: 27
      }
    }, "\u2192 ", rec.destination)), /*#__PURE__*/React.createElement(Pill, {
      value: rec.score,
      label: riskLabel(rec.score)
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-sec)",
        fontSize: 13.5,
        lineHeight: 1.4,
        margin: "10px 0 4px"
      }
    }, info.live && rec.reason ? rec.reason : /*#__PURE__*/React.createElement(React.Fragment, null, "Predicted dwelling-fire risk spike ~", /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: "var(--text-pri)"
      }
    }, "19:00"), ". Pre-positioning cuts response by an est. 4 min.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost",
      style: {
        flex: "0 0 auto",
        paddingInline: 18
      },
      onClick: () => setState("declined"),
      disabled: state !== "idle"
    }, "Decline"), /*#__PURE__*/React.createElement("button", {
      className: "btn ember full",
      onClick: accept,
      disabled: state !== "idle"
    }, state === "idle" ? "Accept & route" : "Routing…"))));
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
      window.loadNews().then(arts => {
        if (alive) setItems((arts || []).slice(0, 6));
      });
      return () => {
        alive = false;
      };
    }, []);
    if (items === null) return /*#__PURE__*/React.createElement("div", {
      className: "news-empty"
    }, "Loading live London fire reports\u2026");
    if (!items.length) return /*#__PURE__*/React.createElement("div", {
      className: "news-empty"
    }, "No live reports right now.");
    return /*#__PURE__*/React.createElement("div", null, items.map((a, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "irow news-row",
      onClick: () => window.openArticle(a.url)
    }, /*#__PURE__*/React.createElement("span", {
      className: "news-tick"
    }), /*#__PURE__*/React.createElement("span", {
      className: "mid"
    }, /*#__PURE__*/React.createElement("span", {
      className: "t news-title"
    }, a.title), /*#__PURE__*/React.createElement("span", {
      className: "s news-src"
    }, a.domain, a.seendate ? " · " + ago(a.seendate) : "")), /*#__PURE__*/React.createElement("span", {
      className: "news-chev"
    }, "\u203A"))));
  }
  const STATIONS = ["Lewisham", "New Cross", "Deptford", "Greenwich", "Peckham", "Forest Hill", "Old Kent Road"];
  function Station({
    goGlobe
  }) {
    const [station, setStation] = useState("Lewisham");
    const [picking, setPicking] = useState(false);
    const [info, setInfo] = useState(DEMO);
    useEffect(() => {
      let alive = true;
      window.loadState(station).then(({
        ok,
        data
      }) => {
        if (!alive) return;
        const recs = data && data.recommendations;
        if (ok && recs && recs.length) {
          const r = recs[0];
          const m = /risk\s+([0-9.]+)/i.exec(r.reason || "");
          setInfo({
            live: true,
            station: data.station || station,
            pumps: typeof data.available_pumps === "number" ? data.available_pumps : 1,
            crew: 5,
            // not in the mobile contract; kept static
            rec: {
              id: r.recommendation_id,
              destination: r.destination,
              lat: r.lat,
              lon: r.lon,
              reason: r.reason,
              score: m ? parseFloat(m[1]) : 0.78
            }
          });
        } else {
          setInfo({
            ...DEMO,
            station
          }); // keep the chosen station label even offline
          window.toast("Live data unavailable — showing demo data");
        }
      });
      return () => {
        alive = false;
      };
    }, [station]);
    return /*#__PURE__*/React.createElement("div", {
      className: "view"
    }, /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement("div", {
      className: "scroll"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 252
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "pad"
    }, /*#__PURE__*/React.createElement("div", {
      className: "glass rise",
      style: {
        padding: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "label",
      style: {
        marginBottom: 8
      }
    }, "Station"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "station-pick",
      onClick: () => setPicking(true)
    }, /*#__PURE__*/React.createElement("span", {
      className: "display",
      style: {
        fontSize: 32
      }
    }, info.station), /*#__PURE__*/React.createElement("svg", {
      className: "station-chev",
      viewBox: "0 0 24 24",
      width: "20",
      height: "20",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M6 9l6 6 6-6"
    }))), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "sdot sig"
    }), /*#__PURE__*/React.createElement("span", {
      className: "label",
      style: {
        fontSize: 10
      }
    }, "On duty"))), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-sec)",
        fontSize: 13
      }
    }, "SE London"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement(Chip, {
      k: "Pumps free",
      v: String(info.pumps)
    }), /*#__PURE__*/React.createElement(Chip, {
      k: "Risk",
      v: riskWord(info.rec.score),
      ember: true
    }), /*#__PURE__*/React.createElement(Chip, {
      k: "Crew",
      v: String(info.crew)
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 72
      }
    }), /*#__PURE__*/React.createElement(RecommendationCard, {
      info: info,
      key: info.station + (info.live ? "-live" : "-demo")
    }), /*#__PURE__*/React.createElement(SecHead, {
      link: "See globe",
      onLink: goGlobe
    }, "Active nearby \xB7 live"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement(ActiveNearby, null))), /*#__PURE__*/React.createElement("div", {
      className: "navspace"
    })), picking ? /*#__PURE__*/React.createElement("div", {
      className: "station-scrim",
      onClick: () => setPicking(false)
    }, /*#__PURE__*/React.createElement("div", {
      className: "station-sheet glass",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("div", {
      className: "label",
      style: {
        marginBottom: 10
      }
    }, "Select station"), STATIONS.map(s => /*#__PURE__*/React.createElement("button", {
      key: s,
      className: "station-opt" + (s === info.station ? " on" : ""),
      onClick: () => {
        setStation(s);
        setPicking(false);
      }
    }, /*#__PURE__*/React.createElement("span", null, s), s === info.station ? /*#__PURE__*/React.createElement("span", {
      className: "station-tick"
    }, "\u2713") : null)))) : null);
  }
  window.Station = Station;
})();