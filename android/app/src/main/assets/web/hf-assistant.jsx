// hf-assistant.jsx — Voice/AI assistant. Orb only when idle; clean bounded layout (no overflow);
// type-instead keyboard option; mic icon only (no "tap to talk" text).

(function () {
  const { useState, useRef, useEffect } = React;

  const SCRIPTS = {
    "What's hot right now?": "Brockley is your highest risk tonight — 0.78 around 19:00, mostly dwelling fires.",
    "Why Brockley?": "A recent dwelling-fire pattern plus the dry spell. Risk peaks near 19:00, so I'd pre-position.",
    "Risk in Lewisham tonight?": "Lewisham itself is medium, about 0.46. Brockley next door is the real hotspot.",
  };
  const PROMPTS = Object.keys(SCRIPTS);

  function ResultCard({ goGlobe }) {
    const route = () => window.routeTo("Brockley standby", 51.464, -0.036);
    return (
      <div className="result-card glass">
        <div className="result-map"><Map3D preset="route" /></div>
        <div style={{ padding: "12px 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><div className="title" style={{ fontSize: 19 }}>Brockley</div><div style={{ color: "var(--text-sec)", fontSize: 12.5 }}>Dwelling fire · 19:00</div></div>
            <Pill value={0.78} label="High" />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn ghost full" onClick={goGlobe}>Open in Globe</button>
            <button className="btn ember full" onClick={route}>Route here →</button>
          </div>
        </div>
      </div>
    );
  }

  function Assistant({ goGlobe }) {
    const [mode, setMode] = useState("idle"); // idle | listening | thinking | speaking
    const [turns, setTurns] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [typing, setTyping] = useState(false);
    const [text, setText] = useState("");
    const timers = useRef([]);
    const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    useEffect(() => clearAll, []);

    const active = mode !== "idle" || turns.length > 0;
    const statusTxt = mode === "listening" ? "Listening…" : mode === "thinking" ? "Thinking…" : mode === "speaking" ? "Speaking…" : "";

    const run = (q) => {
      clearAll(); setTyping(false); setText("");
      setTurns((t) => [...t, { who: "you", text: q }]);
      setMode("listening");
      timers.current.push(setTimeout(() => setMode("thinking"), 800));
      timers.current.push(setTimeout(() => {
        setMode("speaking");
        setTurns((t) => [...t, { who: "tool", text: "showed Brockley" }, { who: "ai", text: SCRIPTS[q] || SCRIPTS[PROMPTS[0]] }]);
        setShowResult(true);
      }, 1800));
      timers.current.push(setTimeout(() => setMode("idle"), 4600));
    };
    const tapMic = () => { if (mode !== "idle") { clearAll(); setMode("idle"); } else run(PROMPTS[0]); };
    const send = () => { const q = text.trim(); if (q) run(q); };

    return (
      <div className="view view-asst">
        <div className="asst-bg" />
        <div className="asst-bg-tint" />
        {/* Live ElevenLabs conversational agent (James) */}
        <elevenlabs-convai agent-id="agent_1001ktee37rcfy69khepf9j23cdf"></elevenlabs-convai>

        <div className="asst-body">
          {!active ? (
            <div className="asst-idle">
              <Orb state="idle" size={150} />
              <div className="prompts">
                {PROMPTS.map((p) => <button key={p} className="prompt-chip" onClick={() => run(p)}>{p}</button>)}
              </div>
            </div>
          ) : (
            <div className="asst-convo">
              {statusTxt ? <div className="asst-status">{statusTxt}</div> : null}
              {showResult ? <ResultCard goGlobe={goGlobe} /> : null}
              <div className="transcript">
                {turns.map((t, i) => t.who === "tool"
                  ? <div key={i} className="toolchip">{t.text}</div>
                  : <div key={i} className={"bubble " + t.who}>{t.text}</div>)}
              </div>
            </div>
          )}
        </div>

        <div className="asst-dock">
          {typing ? (
            <div className="asst-input">
              <input autoFocus value={text} placeholder="Type a question…"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
              <button className="asst-send" onClick={send} aria-label="Send">→</button>
              <button className="asst-kb2" onClick={() => { setTyping(false); setText(""); }} aria-label="Close">✕</button>
            </div>
          ) : (
            <div className="asst-controls">
              <button className="asst-kb" onClick={() => setTyping(true)} aria-label="Type">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
                  <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.6h.01M9.5 12.6h.01M13 12.6h.01M16.5 12.6h.01M8 15.6h8" strokeLinecap="round" />
                </svg>
              </button>
              <button className={"mic-btn" + (mode !== "idle" ? " live" : "")} onClick={tapMic} aria-label="Talk">
                {mode !== "idle" ? <span className="mic-stop" /> : (
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
                )}
                {mode === "listening" ? <span className="mic-wave" /> : null}
              </button>
              <span className="asst-spacer" />
            </div>
          )}
        </div>
      </div>
    );
  }
  window.Assistant = Assistant;
})();
