// Dispatch Agent console — ElevenLabs Conversational AI voice control.
//   Lives in the right rail. The agent (cloud STT+TTS; brain = Nemotron on DGX
//   Spark via Custom LLM in Phase 2) decides which client tool to call. The tools
//   run HERE in the browser and drive the map camera + border glow (Jarvis style).
//
//   Public agent: connect with just the agent id (enable_auth=false), no signed
//   URL. Param keys are camelCase (the ElevenLabs CLI camelCases them on push):
//   focus_ward{wardName}, highlight_risk{minRisk}, reset_view{}.
import { useCallback, useRef, useState } from "react";
import { useConversation, useConversationClientTool } from "@elevenlabs/react";

type WardLite = { ward_id: string; ward_name: string };

export type VoiceAgentProps = {
  wards: WardLite[];
  onFocus: (wardId: string) => void;
  onReset: () => void;
  onHighlight: (minRisk: number) => void;
};

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined;

type LogEntry = { kind: "you" | "agent" | "action"; text: string };

export default function VoiceAgent({ wards, onFocus, onReset, onHighlight }: VoiceAgentProps) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const push = useCallback((e: LogEntry) => {
    setLog((l) => [...l.slice(-40), e]);
    // scroll to newest on next paint
    requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  // exact -> substring -> reverse-substring match on the spoken ward name
  const matchWard = useCallback(
    (name: string): WardLite | undefined => {
      const q = (name ?? "").toLowerCase().trim();
      if (!q) return undefined;
      return (
        wards.find((w) => w.ward_name.toLowerCase() === q) ??
        wards.find((w) => w.ward_name.toLowerCase().includes(q)) ??
        wards.find((w) => q.includes(w.ward_name.toLowerCase()))
      );
    },
    [wards]
  );

  // --- client tools (handlers always see latest closure via the hook's ref) ---
  useConversationClientTool("focus_ward", (p: { wardName?: string }) => {
    const w = matchWard(p?.wardName ?? "");
    if (!w) {
      push({ kind: "action", text: `no match for "${p?.wardName}"` });
      return `No ward matching "${p?.wardName}".`;
    }
    onFocus(w.ward_id);
    push({ kind: "action", text: `focus → ${w.ward_name}` });
    return `Focused on ${w.ward_name}.`;
  });

  useConversationClientTool("reset_view", () => {
    onReset();
    push({ kind: "action", text: "reset → overview" });
    return "Overview restored.";
  });

  useConversationClientTool("highlight_risk", (p: { minRisk?: number }) => {
    const t = typeof p?.minRisk === "number" ? p.minRisk : 0.6;
    onHighlight(t);
    push({ kind: "action", text: `highlight ≥ ${t.toFixed(2)}` });
    return `Highlighting wards at risk ${t.toFixed(2)} and above.`;
  });

  const conversation = useConversation({
    onConnect: () => push({ kind: "agent", text: "— connected —" }),
    onDisconnect: () => push({ kind: "agent", text: "— ended —" }),
    onError: (e: unknown) => push({ kind: "agent", text: `error: ${String(e)}` }),
    // EL sends { message, source: 'user' | 'ai' }; guard the shape defensively.
    onMessage: (m: any) => {
      const text = typeof m === "string" ? m : m?.message;
      if (!text) return;
      const src = m?.source === "user" ? "you" : "agent";
      push({ kind: src, text });
    },
  });

  const status = conversation.status;
  const live = status === "connected";
  const connecting = status === "connecting";
  const speaking = conversation.isSpeaking;

  const start = useCallback(async () => {
    if (!AGENT_ID) {
      push({ kind: "agent", text: "Missing VITE_ELEVENLABS_AGENT_ID in frontend/.env" });
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      push({ kind: "agent", text: "Microphone permission denied." });
      return;
    }
    conversation.startSession({ agentId: AGENT_ID, connectionType: "webrtc" });
  }, [conversation, push]);

  const statusText = connecting
    ? "connecting…"
    : live
    ? speaking
      ? "speaking"
      : "listening"
    : "offline";

  return (
    <section
      className="panel nt-scroll"
      style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: 16, gap: 12 }}
    >
      {/* header + live status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="led" style={{ background: live ? "#27e0ff" : undefined }} />
          <span className="kicker">Dispatch Agent · Voice</span>
        </div>
        <span
          className="pill"
          style={{
            color: live ? "#27e0ff" : "var(--text-mut)",
            borderColor: live ? "#27e0ff" : undefined,
          }}
        >
          {statusText}
        </span>
      </div>

      {/* connect / disconnect */}
      <button
        onClick={() => (live || connecting ? conversation.endSession() : start())}
        style={{
          background: live ? "#27e0ff" : "transparent",
          color: live ? "#04121a" : "#27e0ff",
          border: "1px solid #27e0ff",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.02em",
          boxShadow: speaking ? "0 0 22px #27e0ff" : "none",
          animation: speaking ? "pulse 1.1s ease-in-out infinite" : "none",
          transition: "background 0.2s, box-shadow 0.2s",
        }}
      >
        {connecting ? "connecting…" : live ? "■ End session" : "Talk to map"}
      </button>

      <div className="label" style={{ color: "var(--text-mut)", lineHeight: 1.5 }}>
        Try: “show me West End” · “highlight high-risk areas” · “reset”
      </div>

      {/* activity log */}
      <div
        className="nt-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 13,
          paddingRight: 4,
        }}
      >
        {log.length === 0 && (
          <div className="label" style={{ color: "var(--text-mut)", margin: "auto" }}>
            transcript & actions appear here
          </div>
        )}
        {log.map((e, i) => (
          <div
            key={i}
            style={{
              alignSelf: e.kind === "you" ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: "6px 10px",
              borderRadius: 8,
              background:
                e.kind === "action"
                  ? "rgba(39,224,255,0.12)"
                  : e.kind === "you"
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(255,255,255,0.03)",
              border: e.kind === "action" ? "1px solid rgba(39,224,255,0.4)" : "1px solid var(--line)",
              color: e.kind === "action" ? "#27e0ff" : "var(--text)",
              fontFamily: e.kind === "action" ? "var(--font-mono, monospace)" : "inherit",
            }}
          >
            {e.kind === "action" ? `▸ ${e.text}` : e.text}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </section>
  );
}
