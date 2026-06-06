// hf-assistant.jsx — the orb IS the live ElevenLabs voice agent (James).
// Tap the mic to start a real conversation; the orb reacts (listening/speaking),
// the transcript shows the real exchange. Keyboard icon to type instead.

(function () {
  const { useState, useRef, useEffect } = React;
  const AGENT_ID = "agent_1001ktee37rcfy69khepf9j23cdf";

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
    const [mode, setMode] = useState("idle"); // idle | connecting | listening | thinking | speaking
    const [turns, setTurns] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [typing, setTyping] = useState(false);
    const [text, setText] = useState("");
    const convRef = useRef(null);
    const pending = useRef(null);

    const addTurn = (who, t) => { if (t) setTurns((p) => [...p, { who, text: t }]); };
    useEffect(() => () => { try { convRef.current && convRef.current.endSession(); } catch (e) {} }, []);

    const orbState = mode === "speaking" ? "speaking" : mode === "listening" ? "listening" : mode === "thinking" || mode === "connecting" ? "thinking" : "idle";
    const caption = { idle: "Tap to talk to James", connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking" }[mode];
    const live = mode !== "idle";

    async function start(promptText) {
      if (live) return;
      pending.current = promptText || null;
      if (!window.ElevenConversation) { addTurn("ai", "Voice agent is still loading — try again in a moment."); return; }
      setMode("connecting");
      try {
        try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {}
        const conv = await window.ElevenConversation.startSession({
          agentId: AGENT_ID,
          connectionType: "webrtc",
          onConnect: () => { setMode("listening"); if (pending.current) { const q = pending.current; pending.current = null; addTurn("you", q); try { conv.sendUserMessage && conv.sendUserMessage(q); } catch (e) {} } },
          onDisconnect: () => setMode("idle"),
          onError: (e) => { console.log("EL error", e); },
          onModeChange: (m) => { const mm = (m && m.mode) || m; setMode(mm === "speaking" ? "speaking" : "listening"); },
          onMessage: (msg) => {
            const t = (msg && (msg.message || msg.text)) || "";
            const src = (msg && msg.source) || "ai";
            if (!t) return;
            addTurn(src === "user" ? "you" : "ai", t);
            if (/brockley/i.test(t)) setShowResult(true);
          },
        });
        convRef.current = conv;
      } catch (e) { console.log("EL start fail", e); setMode("idle"); addTurn("ai", "Couldn't reach the voice agent (check connection)."); }
    }
    function stop() { try { convRef.current && convRef.current.endSession(); } catch (e) {} convRef.current = null; setMode("idle"); }
    const tapMic = () => { if (live) stop(); else start(); };
    const sendText = () => {
      const q = text.trim(); if (!q) return; setText("");
      addTurn("you", q);
      if (convRef.current && convRef.current.sendUserMessage) { try { convRef.current.sendUserMessage(q); } catch (e) {} }
      else start(q);
    };

    return (
      <div className="view view-asst">
        <div className="asst-bg" />
        <div className="asst-bg-tint" />

        <div className="asst-body">
          <div className="orb-wrap" style={{ marginTop: 40 }}><Orb state={orbState} size={150} /></div>
          <div className="asst-status">{caption}</div>

          {showResult ? <ResultCard goGlobe={goGlobe} /> : null}

          {turns.length === 0 ? (
            <div className="prompts">
              <button className="prompt-chip" onClick={() => start("What's hot right now?")}>What's hot right now?</button>
              <button className="prompt-chip" onClick={() => start("Why Brockley?")}>Why Brockley?</button>
              <button className="prompt-chip" onClick={() => start("Risk in Lewisham tonight?")}>Risk in Lewisham tonight?</button>
            </div>
          ) : (
            <div className="transcript">
              {turns.map((t, i) => <div key={i} className={"bubble " + t.who}>{t.text}</div>)}
            </div>
          )}
        </div>

        <div className="asst-dock">
          {typing ? (
            <div className="asst-input">
              <input autoFocus value={text} placeholder="Type a question…"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendText(); }} />
              <button className="asst-send" onClick={sendText} aria-label="Send">→</button>
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
              <button className={"mic-btn" + (live ? " live" : "")} onClick={tapMic} aria-label="Talk">
                {live ? <span className="mic-stop" /> : (
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
