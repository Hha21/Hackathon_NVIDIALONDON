// hf-station.jsx — Home / "My Station" (variation A: hero-led). Active Nearby = live London fire news.

(function () {
  const {
    useState,
    useEffect
  } = React;
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
      }, "Holding position at Lewisham."), /*#__PURE__*/React.createElement("button", {
        className: "btn ghost sm",
        onClick: () => setState("idle")
      }, "Undo"));
    }
    return /*#__PURE__*/React.createElement("div", {
      className: "rec-card glass rise" + (state === "idle" ? " glow" : "")
    }, /*#__PURE__*/React.createElement("div", {
      className: "recmap"
    }, /*#__PURE__*/React.createElement(Map3D, {
      preset: "route"
    }), state === "routing" || state === "enroute" ? /*#__PURE__*/React.createElement("div", {
      className: "rec-overlay" + (state === "enroute" ? " done" : "")
    }, state === "routing" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "spinner"
    }), /*#__PURE__*/React.createElement("span", null, "Routing to Brockley\u2026")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
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
    }, "\u2192 Brockley")), /*#__PURE__*/React.createElement(Pill, {
      value: 0.78,
      label: "High"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-sec)",
        fontSize: 13.5,
        lineHeight: 1.4,
        margin: "10px 0 4px"
      }
    }, "Predicted dwelling-fire risk spike ~", /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: "var(--text-pri)"
      }
    }, "19:00"), ". Pre-positioning cuts response by an est. 4 min."), /*#__PURE__*/React.createElement("div", {
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
  const flame = /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: "18",
    height: "18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3c1 3-2 4-2 7a4 4 0 108 0c0-2-1-3-1.5-4 .2 2-1 3-1.5 2.5C13 7 14 5 12 3Z",
    fill: "#FF6A1A"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.5 13a2.5 2.5 0 105 0c0-1-.8-1.6-1-2.2-.3.9-.8 1-1.3.8-.5-.3-.2-1.2.1-1.6-1 .5-2.3 1.7-2.8 3Z",
    fill: "#FFC24B"
  }));
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
  function Station({
    goGlobe
  }) {
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
    }, /*#__PURE__*/React.createElement("div", {
      className: "display",
      style: {
        fontSize: 32
      }
    }, "Lewisham"), /*#__PURE__*/React.createElement("span", {
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
    }, "Lewisham, SE London"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement(Chip, {
      k: "Pumps free",
      v: "1"
    }), /*#__PURE__*/React.createElement(Chip, {
      k: "Risk",
      v: "HIGH",
      ember: true
    }), /*#__PURE__*/React.createElement(Chip, {
      k: "Crew",
      v: "5"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 72
      }
    }), /*#__PURE__*/React.createElement(RecommendationCard, null), /*#__PURE__*/React.createElement(SecHead, {
      link: "See globe",
      onLink: goGlobe
    }, "Active nearby \xB7 live"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement(ActiveNearby, null))), /*#__PURE__*/React.createElement("div", {
      className: "navspace"
    })));
  }
  window.Station = Station;
})();