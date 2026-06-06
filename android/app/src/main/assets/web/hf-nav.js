// hf-nav.jsx — bottom glass nav, icons only. Assistant = firefly.

(function () {
  function IconStation() {
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinejoin: "round",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "2.5",
      y: "8.5",
      width: "11.5",
      height: "7",
      rx: "1.2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 10.5h3.6l2.9 3v2H14z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5.5 8.5V6.5h5.5v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "6.7",
      cy: "17",
      r: "1.7",
      fill: "currentColor",
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "17.3",
      cy: "17",
      r: "1.7",
      fill: "currentColor",
      stroke: "none"
    }));
  }
  function IconGlobe() {
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinejoin: "round",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M12 3 21 8 12 13 3 8Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.4 12 12 16.6 20.6 12"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.4 15.8 12 20.4 20.6 15.8",
      opacity: "0.55"
    }));
  }
  function IconFirefly() {
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("g", {
      transform: "rotate(22 12 12)"
    }, /*#__PURE__*/React.createElement("ellipse", {
      cx: "8.4",
      cy: "9.5",
      rx: "2.6",
      ry: "4",
      opacity: "0.55",
      transform: "rotate(-28 8.4 9.5)"
    }), /*#__PURE__*/React.createElement("ellipse", {
      cx: "15.6",
      cy: "9.5",
      rx: "2.6",
      ry: "4",
      opacity: "0.55",
      transform: "rotate(28 15.6 9.5)"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10.7 4.4C9.8 2.9 8.6 2.4 7.6 2.6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13.3 4.4C14.2 2.9 15.4 2.4 16.4 2.6"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "5.6",
      r: "1.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 7.1c-2 0-2.4 2.1-2.4 4.4 0 2.6 1 4.6 2.4 4.6s2.4-2 2.4-4.6c0-2.3-.4-4.4-2.4-4.4Z"
    }), /*#__PURE__*/React.createElement("circle", {
      className: "ff-glow",
      cx: "12",
      cy: "17.6",
      r: "2.4",
      fill: "#FF6A1A",
      stroke: "none"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "17.6",
      r: "1",
      fill: "#FFE2C2",
      stroke: "none"
    })));
  }
  const ITEMS = [IconStation, IconGlobe, IconFirefly];
  function Nav({
    active,
    onChange
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "nav glass"
    }, ITEMS.map((Ico, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "nav-item" + (i === active ? " on" : ""),
      onClick: () => onChange(i),
      role: "button",
      "aria-label": ["Station", "Globe", "Assistant"][i]
    }, /*#__PURE__*/React.createElement("span", {
      className: "ind"
    }), /*#__PURE__*/React.createElement(Ico, null))));
  }
  window.Nav = Nav;
})();