// hf-assistant.jsx — Voice/AI assistant. Orb only when idle; clean bounded layout (no overflow);
// type-instead keyboard option; mic icon only (no "tap to talk" text).

(function () {
  const {
    useState,
    useRef,
    useEffect
  } = React;
  const SCRIPTS = {
    "What's hot right now?": "Brockley is your highest risk tonight — 0.78 around 19:00, mostly dwelling fires.",
    "Why Brockley?": "A recent dwelling-fire pattern plus the dry spell. Risk peaks near 19:00, so I'd pre-position.",
    "Risk in Lewisham tonight?": "Lewisham itself is medium, about 0.46. Brockley next door is the real hotspot."
  };
  const PROMPTS = Object.keys(SCRIPTS);
  function ResultCard({
    goGlobe
  }) {
    const route = () => window.routeTo("Brockley standby", 51.464, -0.036);
    return /*#__PURE__*/React.createElement("div", {
      className: "result-card glass"
    }, /*#__PURE__*/React.createElement("div", {
      className: "result-map"
    }, /*#__PURE__*/React.createElement(Map3D, {
      preset: "route"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 16px 16px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "title",
      style: {
        fontSize: 19
      }
    }, "Brockley"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-sec)",
        fontSize: 12.5
      }
    }, "Dwelling fire \xB7 19:00")), /*#__PURE__*/React.createElement(Pill, {
      value: 0.78,
      label: "High"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn ghost full",
      onClick: goGlobe
    }, "Open in Globe"), /*#__PURE__*/React.createElement("button", {
      className: "btn ember full",
      onClick: route
    }, "Route here \u2192"))));
  }
  function Assistant({
    goGlobe
  }) {
    const [mode, setMode] = useState("idle"); // idle | listening | thinking | speaking
    const [turns, setTurns] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [typing, setTyping] = useState(false);
    const [text, setText] = useState("");
    const timers = useRef([]);
    const clearAll = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    useEffect(() => clearAll, []);
    const active = mode !== "idle" || turns.length > 0;
    const statusTxt = mode === "listening" ? "Listening…" : mode === "thinking" ? "Thinking…" : mode === "speaking" ? "Speaking…" : "";
    const run = q => {
      clearAll();
      setTyping(false);
      setText("");
      setTurns(t => [...t, {
        who: "you",
        text: q
      }]);
      setMode("listening");
      timers.current.push(setTimeout(() => setMode("thinking"), 800));
      timers.current.push(setTimeout(() => {
        setMode("speaking");
        setTurns(t => [...t, {
          who: "tool",
          text: "showed Brockley"
        }, {
          who: "ai",
          text: SCRIPTS[q] || SCRIPTS[PROMPTS[0]]
        }]);
        setShowResult(true);
      }, 1800));
      timers.current.push(setTimeout(() => setMode("idle"), 4600));
    };
    const tapMic = () => {
      if (mode !== "idle") {
        clearAll();
        setMode("idle");
      } else run(PROMPTS[0]);
    };
    const send = () => {
      const q = text.trim();
      if (q) run(q);
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "view view-asst"
    }, /*#__PURE__*/React.createElement("div", {
      className: "asst-bg"
    }), /*#__PURE__*/React.createElement("div", {
      className: "asst-bg-tint"
    }), /*#__PURE__*/React.createElement("elevenlabs-convai", {
      "agent-id": "agent_1001ktee37rcfy69khepf9j23cdf"
    }), /*#__PURE__*/React.createElement("div", {
      className: "asst-body"
    }, !active ? /*#__PURE__*/React.createElement("div", {
      className: "asst-idle"
    }, /*#__PURE__*/React.createElement(Orb, {
      state: "idle",
      size: 150
    }), /*#__PURE__*/React.createElement("div", {
      className: "prompts"
    }, PROMPTS.map(p => /*#__PURE__*/React.createElement("button", {
      key: p,
      className: "prompt-chip",
      onClick: () => run(p)
    }, p)))) : /*#__PURE__*/React.createElement("div", {
      className: "asst-convo"
    }, statusTxt ? /*#__PURE__*/React.createElement("div", {
      className: "asst-status"
    }, statusTxt) : null, showResult ? /*#__PURE__*/React.createElement(ResultCard, {
      goGlobe: goGlobe
    }) : null, /*#__PURE__*/React.createElement("div", {
      className: "transcript"
    }, turns.map((t, i) => t.who === "tool" ? /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "toolchip"
    }, t.text) : /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "bubble " + t.who
    }, t.text))))), /*#__PURE__*/React.createElement("div", {
      className: "asst-dock"
    }, typing ? /*#__PURE__*/React.createElement("div", {
      className: "asst-input"
    }, /*#__PURE__*/React.createElement("input", {
      autoFocus: true,
      value: text,
      placeholder: "Type a question\u2026",
      onChange: e => setText(e.target.value),
      onKeyDown: e => {
        if (e.key === "Enter") send();
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "asst-send",
      onClick: send,
      "aria-label": "Send"
    }, "\u2192"), /*#__PURE__*/React.createElement("button", {
      className: "asst-kb2",
      onClick: () => {
        setTyping(false);
        setText("");
      },
      "aria-label": "Close"
    }, "\u2715")) : /*#__PURE__*/React.createElement("div", {
      className: "asst-controls"
    }, /*#__PURE__*/React.createElement("button", {
      className: "asst-kb",
      onClick: () => setTyping(true),
      "aria-label": "Type"
    }, /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      width: "22",
      height: "22",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "2.5",
      y: "6",
      width: "19",
      height: "12",
      rx: "2.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.6h.01M9.5 12.6h.01M13 12.6h.01M16.5 12.6h.01M8 15.6h8",
      strokeLinecap: "round"
    }))), /*#__PURE__*/React.createElement("button", {
      className: "mic-btn" + (mode !== "idle" ? " live" : ""),
      onClick: tapMic,
      "aria-label": "Talk"
    }, mode !== "idle" ? /*#__PURE__*/React.createElement("span", {
      className: "mic-stop"
    }) : /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 24 24",
      width: "30",
      height: "30",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "9",
      y: "3",
      width: "6",
      height: "11",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 11a7 7 0 0014 0M12 18v3"
    })), mode === "listening" ? /*#__PURE__*/React.createElement("span", {
      className: "mic-wave"
    }) : null), /*#__PURE__*/React.createElement("span", {
      className: "asst-spacer"
    }))));
  }
  window.Assistant = Assistant;
})();