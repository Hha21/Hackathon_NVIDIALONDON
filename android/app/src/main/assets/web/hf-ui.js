// hf-ui.jsx — shared hi-fi components

(function () {
  const rc = window.riskColor;
  function Pill({
    value = 0.78,
    label
  }) {
    const col = rc(value);
    return /*#__PURE__*/React.createElement("span", {
      className: "pill",
      style: {
        color: col
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, value.toFixed(2)), label ? /*#__PURE__*/React.createElement("span", {
      className: "pl"
    }, label) : null);
  }
  function Chip({
    k,
    v,
    ember
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "chip"
    }, /*#__PURE__*/React.createElement("span", {
      className: "k"
    }, k), /*#__PURE__*/React.createElement("span", {
      className: "v" + (ember ? " ember" : "")
    }, v));
  }
  function SecHead({
    children,
    link,
    onLink,
    alert
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "sec-head"
    }, /*#__PURE__*/React.createElement("div", {
      className: "label",
      style: alert ? {
        color: "var(--ember)"
      } : null
    }, alert ? /*#__PURE__*/React.createElement("span", {
      style: {
        marginRight: 7,
        fontSize: 9,
        verticalAlign: 1,
        filter: "drop-shadow(0 0 4px var(--ember))"
      }
    }, "\u25B2") : null, children), link ? /*#__PURE__*/React.createElement("button", {
      className: "link",
      onClick: onLink,
      style: {
        background: "none",
        border: 0,
        cursor: "pointer"
      }
    }, link, " ", /*#__PURE__*/React.createElement("span", null, "\u2192")) : null);
  }
  const incIcons = {
    outdoor_fire: /*#__PURE__*/React.createElement("svg", {
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
    })),
    AFA: /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      width: "18",
      height: "18",
      fill: "none",
      stroke: "#9BA1AC",
      strokeWidth: "1.6",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M6 16V11a6 6 0 0112 0v5l1.5 2H4.5L6 16Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10.5 20.5a2 2 0 003 0"
    })),
    RTC: /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      width: "18",
      height: "18",
      fill: "none",
      stroke: "#9BA1AC",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M4 14l1.5-4.5A2 2 0 017.4 8h9.2a2 2 0 011.9 1.5L20 14v4h-3v-2H7v2H4v-4Z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "7.5",
      cy: "14",
      r: "0.6"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "16.5",
      cy: "14",
      r: "0.6"
    }))
  };
  function IncidentRow({
    type = "outdoor_fire",
    label,
    location,
    status
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "irow"
    }, /*#__PURE__*/React.createElement("span", {
      className: "ico"
    }, incIcons[type] || incIcons.outdoor_fire), /*#__PURE__*/React.createElement("span", {
      className: "mid"
    }, /*#__PURE__*/React.createElement("span", {
      className: "t"
    }, label), /*#__PURE__*/React.createElement("span", {
      className: "s"
    }, location)), /*#__PURE__*/React.createElement("span", {
      className: "sdot",
      style: {
        background: status === "active" ? "var(--ember)" : "var(--text-mut)",
        boxShadow: status === "active" ? "0 0 9px var(--ember)" : "none"
      }
    }));
  }

  // cinematic station hero — real fire-engine-at-dusk render + ember overlay
  function Hero() {
    const embers = Array.from({
      length: 9
    }).map((_, i) => ({
      left: i * 91 % 360 + 8,
      delay: i * 0.8 % 6,
      dur: 7 + i % 4 * 1.5,
      size: 1.5 + i % 3
    }));
    return /*#__PURE__*/React.createElement("div", {
      className: "hero"
    }, /*#__PURE__*/React.createElement("img", {
      className: "hero-img",
      src: "assets/hero-truck.png",
      alt: "Lewisham fire station appliance at dusk"
    }), /*#__PURE__*/React.createElement("div", {
      className: "embers"
    }, embers.map((e, i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        left: e.left,
        width: e.size,
        height: e.size,
        animationDelay: e.delay + "s",
        animationDuration: e.dur + "s"
      }
    }))), /*#__PURE__*/React.createElement("div", {
      className: "hero-fade"
    }));
  }
  Object.assign(window, {
    Pill,
    Chip,
    SecHead,
    IncidentRow,
    Hero
  });
})();