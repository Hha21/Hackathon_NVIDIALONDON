// shell.jsx — full-bleed app shell (no device bezel / scaling / dev tweaks). Renders last.
(function () {
  const {
    useState
  } = React;
  function StatusBar() {
    return /*#__PURE__*/React.createElement("div", {
      className: "statusbar"
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, "18:42"), /*#__PURE__*/React.createElement("span", {
      className: "sb-icons"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "18",
      height: "12",
      viewBox: "0 0 18 12",
      fill: "currentColor"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "0",
      y: "8",
      width: "3",
      height: "4",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "5",
      y: "5",
      width: "3",
      height: "7",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "10",
      y: "2.5",
      width: "3",
      height: "9.5",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "15",
      y: "0",
      width: "3",
      height: "12",
      rx: "1",
      opacity: "0.4"
    })), /*#__PURE__*/React.createElement("svg", {
      width: "16",
      height: "12",
      viewBox: "0 0 16 12",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.4"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M1 4.2a10 10 0 0114 0"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.4 6.8a6 6 0 019.2 0"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "8",
      cy: "9.8",
      r: "1",
      fill: "currentColor",
      stroke: "none"
    })), /*#__PURE__*/React.createElement("svg", {
      width: "26",
      height: "13",
      viewBox: "0 0 26 13",
      fill: "none"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "1",
      y: "1",
      width: "21",
      height: "11",
      rx: "3",
      stroke: "currentColor",
      strokeWidth: "1.3",
      opacity: "0.5"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "15",
      height: "7",
      rx: "1.5",
      fill: "currentColor"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "23",
      y: "4",
      width: "2",
      height: "5",
      rx: "1",
      fill: "currentColor",
      opacity: "0.6"
    }))));
  }
  function Shell() {
    const [tab, setTab] = useState(0);
    // Keep all screens mounted (so MapLibre instances persist and don't re-render on
    // tab change); just toggle visibility and nudge a resize when one becomes visible.
    React.useEffect(() => {
      const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
      return () => clearTimeout(t);
    }, [tab]);
    const pane = (i, el) => /*#__PURE__*/React.createElement("div", {
      style: { position: "absolute", inset: 0, visibility: tab === i ? "visible" : "hidden", pointerEvents: tab === i ? "auto" : "none" }
    }, el);
    return /*#__PURE__*/React.createElement("div", {
      className: "screen"
    }, /*#__PURE__*/React.createElement("div", {
      className: "screen-views"
    },
      pane(0, /*#__PURE__*/React.createElement(window.Station, { goGlobe: () => setTab(1) })),
      pane(1, /*#__PURE__*/React.createElement(window.Globe, null)),
      pane(2, /*#__PURE__*/React.createElement(window.Assistant, { goGlobe: () => setTab(1) }))
    ), /*#__PURE__*/React.createElement(Nav, {
      active: tab,
      onChange: setTab
    }));
  }
  ReactDOM.createRoot(document.getElementById("hf-root")).render(/*#__PURE__*/React.createElement(Shell, null));
})();