// hf-orb.jsx — organic ember voice orb with states: idle / listening / thinking / speaking

(function () {
  function Orb({
    state = "idle",
    size = 220
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "orb orb-" + state,
      style: {
        width: size,
        height: size
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "orb-halo"
    }), /*#__PURE__*/React.createElement("span", {
      className: "orb-ripple"
    }), /*#__PURE__*/React.createElement("span", {
      className: "orb-ripple r2"
    }), /*#__PURE__*/React.createElement("svg", {
      className: "orb-blob",
      viewBox: "0 0 200 200"
    }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("radialGradient", {
      id: "orbFill",
      cx: "42%",
      cy: "38%",
      r: "62%"
    }, /*#__PURE__*/React.createElement("stop", {
      offset: "0%",
      stopColor: "#FFD9B0"
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "32%",
      stopColor: "#FF8A3D"
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "70%",
      stopColor: "#FF6A1A"
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "100%",
      stopColor: "#B83806"
    })), /*#__PURE__*/React.createElement("radialGradient", {
      id: "orbFillCool",
      cx: "42%",
      cy: "38%",
      r: "62%"
    }, /*#__PURE__*/React.createElement("stop", {
      offset: "0%",
      stopColor: "#CFFDF5"
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "40%",
      stopColor: "#37E0C8"
    }), /*#__PURE__*/React.createElement("stop", {
      offset: "100%",
      stopColor: "#0E8C7B"
    })), /*#__PURE__*/React.createElement("filter", {
      id: "orbWobble"
    }, /*#__PURE__*/React.createElement("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.012",
      numOctaves: "2",
      seed: "3",
      result: "n"
    }, /*#__PURE__*/React.createElement("animate", {
      attributeName: "baseFrequency",
      dur: "14s",
      values: "0.010;0.018;0.010",
      repeatCount: "indefinite"
    })), /*#__PURE__*/React.createElement("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "n",
      scale: "14",
      xChannelSelector: "R",
      yChannelSelector: "G"
    }))), /*#__PURE__*/React.createElement("g", {
      filter: "url(#orbWobble)"
    }, /*#__PURE__*/React.createElement("circle", {
      className: "orb-body",
      cx: "100",
      cy: "100",
      r: "66"
    })), /*#__PURE__*/React.createElement("circle", {
      className: "orb-spec",
      cx: "80",
      cy: "76",
      r: "20"
    })), /*#__PURE__*/React.createElement("span", {
      className: "orb-core"
    }));
  }
  window.Orb = Orb;
})();