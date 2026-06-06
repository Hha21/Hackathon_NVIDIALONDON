// Dispatch Agent console — ElevenLabs Conversational AI voice control.
//   Lives in the right rail. The agent (cloud STT+TTS; brain = Nemotron on DGX
//   Spark via Custom LLM in Phase 2) decides which client tool to call. The tools
//   run HERE in the browser and drive the map camera + border glow (Jarvis style).
//
//   Public agent: connect with just the agent id (enable_auth=false), no signed
//   URL. Param keys are camelCase (the ElevenLabs CLI camelCases them on push):
//   focus_ward{wardName}, highlight_risk{minRisk}, reset_view{}.
import { useCallback, useMemo, useRef, useState } from "react";
import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import type { ForecastHourly, WardForecast } from "../api";

export type VoiceAgentProps = {
  // Full forecast (hourly per ward) so Group A tools can read the numbers.
  wards: WardForecast[];
  // Hour currently on the timeline scrubber — all reads are "at this hour".
  hour: number;
  onFocus: (wardId: string) => void;
  onReset: () => void;
  onHighlight: (minRisk: number) => void;
  // rank_hotspots / compare_split ring an explicit set of wards on the map.
  onHighlightWards: (ids: string[]) => void;
  // Group E (map control): move the scrubber + set the incident filter by voice.
  onScrubTime: (hour: number) => void;
  onFilterIncident: (type: string) => void;
};

// Incident filter values the dropdown accepts (mirror of App's INCIDENT_FILTER).
// Spoken phrases fuzzy-map onto these; anything else falls back to "all".
const INCIDENT_TYPES = [
  "all",
  "dwelling_fire",
  "outdoor_fire",
  "false_alarm",
  "special_service",
] as const;

// Resolve a spoken incident phrase ("dwelling fires", "false alarms", "clear")
// to a valid filter value. Substring match both directions; "all"/"clear" reset.
const matchIncident = (raw: string): string => {
  const q = (raw ?? "").toLowerCase().replace(/[_\s]+/g, " ").trim();
  if (!q || /\b(all|clear|reset|everything|any)\b/.test(q)) return "all";
  const norm = (t: string) => t.replace(/_/g, " ");
  return (
    INCIDENT_TYPES.find((t) => norm(t) === q) ??
    INCIDENT_TYPES.find((t) => t !== "all" && (q.includes(norm(t)) || norm(t).includes(q))) ??
    // single-word hints: "dwelling", "outdoor", "alarm", "special"/"service"
    INCIDENT_TYPES.find((t) => t !== "all" && norm(t).split(" ").some((w) => q.includes(w))) ??
    "all"
  );
};

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined;

type LogEntry = { kind: "you" | "agent" | "action"; text: string };

// --- speech formatters (pure) ---
const fmtType = (t: string) => (t ?? "").replace(/_/g, " ").trim() || "mixed";
const pct = (r: number) => `${Math.round((r ?? 0) * 100)}%`;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export default function VoiceAgent({
  wards,
  hour,
  onFocus,
  onReset,
  onHighlight,
  onHighlightWards,
  onScrubTime,
  onFilterIncident,
}: VoiceAgentProps) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const push = useCallback((e: LogEntry) => {
    setLog((l) => [...l.slice(-40), e]);
    // scroll to newest on next paint
    requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  // exact -> substring -> reverse-substring match on the spoken ward name
  const matchWard = useCallback(
    (name: string): WardForecast | undefined => {
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

  // hourly entry for a ward at the scrubber hour (falls back to first slot)
  const hourlyAt = useCallback(
    (w: WardForecast): ForecastHourly =>
      w.hourly.find((h) => h.hour === hour) ?? w.hourly[0],
    [hour]
  );

  // all wards sorted by risk at the current hour (recomputed when hour changes)
  const ranked = useMemo(
    () =>
      [...wards].sort(
        (a, b) => (hourlyAt(b)?.risk_score ?? 0) - (hourlyAt(a)?.risk_score ?? 0)
      ),
    [wards, hourlyAt]
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

  // --- Group A: ward intelligence (read in-memory forecast, speak numbers) ---
  useConversationClientTool("get_ward_info", (p: { wardName?: string }) => {
    const w = matchWard(p?.wardName ?? "");
    if (!w) {
      push({ kind: "action", text: `no match for "${p?.wardName}"` });
      return `No ward matching "${p?.wardName}".`;
    }
    const he = hourlyAt(w);
    const rank = ranked.findIndex((x) => x.ward_id === w.ward_id) + 1;
    push({ kind: "action", text: `info → ${w.ward_name}` });
    return `${w.ward_name} at ${hh(hour)}: risk ${pct(he.risk_score)}, about ${Math.round(
      he.expected_count
    )} expected, mostly ${fmtType(he.dominant_type)}. Ranked ${ordinal(rank)} of ${
      wards.length
    } this hour.`;
  });

  useConversationClientTool("compare_wards", (p: { wardA?: string; wardB?: string }) => {
    const a = matchWard(p?.wardA ?? "");
    const b = matchWard(p?.wardB ?? "");
    if (!a || !b) {
      const miss = !a ? p?.wardA : p?.wardB;
      push({ kind: "action", text: `no match for "${miss}"` });
      return `No ward matching "${miss}".`;
    }
    const ha = hourlyAt(a);
    const hb = hourlyAt(b);
    const higher = ha.risk_score >= hb.risk_score ? a : b;
    push({ kind: "action", text: `compare → ${a.ward_name} vs ${b.ward_name}` });
    return `${higher.ward_name} is higher risk. ${a.ward_name} ${pct(ha.risk_score)} (${Math.round(
      ha.expected_count
    )} expected, ${fmtType(ha.dominant_type)}); ${b.ward_name} ${pct(hb.risk_score)} (${Math.round(
      hb.expected_count
    )} expected, ${fmtType(hb.dominant_type)}).`;
  });

  useConversationClientTool("rank_hotspots", (p: { n?: number }) => {
    const n = Math.max(1, Math.min(20, Math.round(typeof p?.n === "number" ? p.n : 5)));
    // dedupe duplicate ward_ids before ringing (see expansion plan §7)
    const seen = new Set<string>();
    const top: WardForecast[] = [];
    for (const w of ranked) {
      if (seen.has(w.ward_id)) continue;
      seen.add(w.ward_id);
      top.push(w);
      if (top.length >= n) break;
    }
    onHighlightWards(top.map((w) => w.ward_id));
    push({ kind: "action", text: `top ${top.length} hotspots ringed` });
    const list = top
      .map((w, i) => `${i + 1}. ${w.ward_name} ${pct(hourlyAt(w).risk_score)}`)
      .join("; ");
    return `Top ${top.length} hotspots at ${hh(hour)}: ${list}.`;
  });

  useConversationClientTool("ward_trend", (p: { wardName?: string }) => {
    const w = matchWard(p?.wardName ?? "");
    if (!w) {
      push({ kind: "action", text: `no match for "${p?.wardName}"` });
      return `No ward matching "${p?.wardName}".`;
    }
    const now = hourlyAt(w);
    const peak = w.hourly.reduce((m, e) => (e.risk_score > m.risk_score ? e : m), w.hourly[0]);
    const trough = w.hourly.reduce((m, e) => (e.risk_score < m.risk_score ? e : m), w.hourly[0]);
    push({ kind: "action", text: `trend → ${w.ward_name}` });
    return `${w.ward_name}: now ${pct(now.risk_score)} at ${hh(hour)}. Peaks ${pct(
      peak.risk_score
    )} around ${hh(peak.hour)}, lowest ${pct(trough.risk_score)} at ${hh(trough.hour)}.`;
  });

  // --- Group E: map control by voice (push UI state; fire-and-forget) ---
  useConversationClientTool("scrub_time", (p: { hour?: number }) => {
    const raw = typeof p?.hour === "number" ? p.hour : NaN;
    if (!Number.isFinite(raw)) {
      push({ kind: "action", text: `bad hour "${p?.hour}"` });
      return `I need an hour between 0 and 23.`;
    }
    const h = Math.max(0, Math.min(23, Math.round(raw)));
    onScrubTime(h);
    push({ kind: "action", text: `scrub → ${hh(h)}` });
    return `Showing ${hh(h)}.`;
  });

  useConversationClientTool("filter_incident", (p: { type?: string }) => {
    const t = matchIncident(p?.type ?? "");
    onFilterIncident(t);
    push({ kind: "action", text: t === "all" ? "filter → all" : `filter → ${fmtType(t)}` });
    return t === "all" ? `Showing all incident types.` : `Filtering to ${fmtType(t)}.`;
  });

  useConversationClientTool("compare_split", (p: { wardA?: string; wardB?: string }) => {
    const a = matchWard(p?.wardA ?? "");
    const b = matchWard(p?.wardB ?? "");
    if (!a || !b) {
      const miss = !a ? p?.wardA : p?.wardB;
      push({ kind: "action", text: `no match for "${miss}"` });
      return `No ward matching "${miss}".`;
    }
    // dedupe in case both names resolve to the same ward_id (see plan §7)
    const ids = a.ward_id === b.ward_id ? [a.ward_id] : [a.ward_id, b.ward_id];
    onHighlightWards(ids);
    push({ kind: "action", text: `split → ${a.ward_name} + ${b.ward_name}` });
    return `Ringing ${a.ward_name} and ${b.ward_name}.`;
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
