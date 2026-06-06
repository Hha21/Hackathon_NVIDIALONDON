// Typed API client mirroring the shared data contracts (README).
// Base URL from VITE_API_URL, defaults to local backend.

// Empty base => same-origin relative calls, handled by the Vite dev proxy
// (see vite.config.ts). Override with VITE_API_URL for a non-proxied build.
const BASE = import.meta.env.VITE_API_URL ?? "";

// ---- Contract types (mirror backend/schemas.py) ----
export type ForecastHourly = {
  hour: number;
  risk_score: number;
  expected_count: number;
  dominant_type: string;
};

export type WardForecast = {
  ward_id: string;
  ward_name: string;
  geometry_id: string;
  lat: number;
  lon: number;
  hourly: ForecastHourly[];
};

export type ForecastResponse = {
  district: string;
  generated_at: string;
  horizon_hours: number;
  wards: WardForecast[];
};

export type Recommendation = {
  recommendation_id?: string;
  action: string;
  priority: number;
  from_station?: string;
  to_ward?: string;
  destination_lat?: number;
  destination_lon?: number;
  resource?: string;
  reason: string;
  confidence?: number;
};

export type ForecastDelta = {
  ward_id: string;
  baseline_risk: number;
  scenario_risk: number;
  delta: number;
};

export type ScenarioResponse = {
  scenario_id: string;
  summary: string;
  recommendations: Recommendation[];
  forecast_delta: ForecastDelta[];
};

export type Scenario = {
  district: string;
  time: string;
  weather: { rain?: string; wind?: string; temperature?: number };
  events?: string[];
  pump_availability: Record<string, number>;
  ongoing_incidents: { ward: string; type: string; pumps_committed: number }[];
};

export type AskResponse = {
  answer: string;
  recommended_actions: { type: string; target: string; confidence: number }[];
  supporting_forecast_ids: string[];
};

export type Health = {
  status: string;
  model_loaded: boolean;
  forecast_available: boolean;
  device: string;
};

// ---- Calls ----
export async function getHealth(): Promise<Health> {
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}

export async function getForecast(
  district = "Greater London",
  incidentType = "all"
): Promise<ForecastResponse> {
  const r = await fetch(
    `${BASE}/api/forecast?district=${encodeURIComponent(district)}&incident_type=${encodeURIComponent(incidentType)}`
  );
  if (!r.ok) throw new Error(`forecast ${r.status}`);
  return r.json();
}

export async function postScenario(s: Scenario): Promise<ScenarioResponse> {
  const r = await fetch(`${BASE}/api/scenario`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!r.ok) throw new Error(`scenario ${r.status}`);
  return r.json();
}

// ---- Live weather (Open-Meteo, keyless) ----
// Pulls current conditions for a lat/lon (default Lewisham centroid) and maps
// them onto the scenario's coarse wind/rain buckets + temperature.
export type LiveWeather = {
  wind: "none" | "moderate" | "high";
  rain: "none" | "low" | "heavy";
  temperature: number;
  windKmh: number;
  precipMm: number;
};

export async function getLiveWeather(
  lat = 51.45,
  lon = -0.02
): Promise<LiveWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,wind_speed_10m`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  const j = await r.json();
  const c = j.current ?? {};
  const windKmh = Number(c.wind_speed_10m ?? 0);
  const precipMm = Number(c.precipitation ?? 0);
  const temperature = Number(c.temperature_2m ?? 0);
  const wind = windKmh >= 30 ? "high" : windKmh >= 12 ? "moderate" : "none";
  const rain = precipMm >= 2.5 ? "heavy" : precipMm > 0 ? "low" : "none";
  return { wind, rain, temperature, windKmh, precipMm };
}

// ---- Spark forecast generation ----
// Only the fields the GPT-2 model conditions on (see backend/schemas.py
// GenerateRequest / src/dataset.py build_prefix).
export type GenerateRequest = {
  date?: string | null; // YYYY-MM-DD
  hour: number; // 0-23
  temp?: number; // °C
  rain?: number; // mm/h
  wind?: number; // km/h
  n_rollouts: number; // per station
};

export type GenerateJob = {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  message: string;
  started_at?: string | null;
  finished_at?: string | null;
  device?: string | null;
  forecast_generated_at?: string | null;
  n_rollouts?: number | null;
  error?: string | null;
};

export async function generateForecast(req: GenerateRequest): Promise<GenerateJob> {
  const r = await fetch(`${BASE}/api/forecast/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (r.status === 409) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.detail?.message ?? "A Spark job is already running.");
  }
  if (!r.ok) throw new Error(`generate ${r.status}`);
  return r.json();
}

export async function getGenerateJob(jobId: string): Promise<GenerateJob> {
  const r = await fetch(`${BASE}/api/forecast/generate/${jobId}`);
  if (!r.ok) throw new Error(`generate job ${r.status}`);
  return r.json();
}

// Mirror the model's discrete buckets (src/dataset.py _temp/_rain/_wind_token)
// so the UI shows exactly which token a slider value maps to.
export function tempBucket(t: number): string {
  if (t <= 0) return "FREEZING";
  if (t <= 8) return "COLD";
  if (t <= 15) return "MILD";
  if (t <= 20) return "WARM";
  return "HOT";
}
export function rainBucket(r: number): string {
  if (r <= 0) return "NONE";
  if (r <= 1) return "LIGHT";
  if (r <= 4) return "MODERATE";
  return "HEAVY";
}
export function windBucket(w: number): string {
  if (w < 10) return "CALM";
  if (w < 25) return "BREEZY";
  if (w < 40) return "STRONG";
  return "STORM";
}

export async function postAsk(query: string): Promise<AskResponse> {
  const r = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`ask ${r.status}`);
  return r.json();
}
