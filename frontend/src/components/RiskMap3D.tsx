// Step 4 (enhanced): Three.js London risk map (react-three-fiber).
//   - ground = a real OpenStreetMap basemap of Lewisham (bundled PNG, built by
//     backend/build_map_tile.py — offline once generated). Recognisable streets,
//     the Thames, Greenwich, Catford, Forest Hill.
//   - each ward = a glowing risk *column* placed at its true (lat, lon),
//     projected onto the SAME bounds the basemap spans, so columns sit over the
//     right streets. height = risk(hour) * MAX_HEIGHT, colour low->high gradient.
//   - hover tooltip: ward name, risk, expected_count, dominant_type.
//   - `riskOverride` (scenario scenario_risk by ward_id) replaces baseline risk.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  Text,
  Billboard,
  Environment,
  Lightformer,
  ContactShadows,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { WardForecast } from "../api";
import bounds from "../basemap_bounds.json";

const MAX_HEIGHT = 9; // risk columns tower over the flat map
const COL_R = 0.55;
// Fixed scene scale: metres -> units. The basemap plane is sized in real metres
// (so Greater London is a big plane you can zoom out to), while the focus area
// (Lewisham wards + buildings) keeps a constant, readable size.
const UNITS_PER_M = 0.005; // ~6 km -> 30 units
const LABEL_TOP_N = 12; // only the N highest-risk wards get a standing label
const BLDG_EXAG = 5; // height exaggeration so real buildings read as a skyline
const BLDG_MIN_W = 0.07; // min footprint in scene units (avoid needle-thin spikes)
const BLDG_MAX_H_M = 42; // clamp outlier heights (kills the random black needles)
const PED_MARGIN = 60; // pedestal overhang beyond the map on every side (units)

// blue (low) -> yellow (mid) -> red (high)
function riskColor(r: number): string {
  const t = Math.max(0, Math.min(1, r));
  let rr: number, gg: number, bb: number;
  if (t < 0.5) {
    const k = t / 0.5;
    rr = Math.round(40 + k * (240 - 40));
    gg = Math.round(110 + k * (220 - 110));
    bb = Math.round(220 + k * (40 - 220));
  } else {
    const k = (t - 0.5) / 0.5;
    rr = Math.round(240 + k * (220 - 240));
    gg = Math.round(220 + k * (40 - 220));
    bb = 40;
  }
  return `rgb(${rr},${gg},${bb})`;
}

// Plane sized to real metres (no distortion) at a fixed metres->units scale.
function planeSize() {
  const latC = (bounds.north + bounds.south) / 2;
  const mLat = 111_130;
  const mLon = 111_320 * Math.cos((latC * Math.PI) / 180);
  const worldW = (bounds.east - bounds.west) * mLon;
  const worldH = (bounds.north - bounds.south) * mLat;
  return { W: worldW * UNITS_PER_M, H: worldH * UNITS_PER_M, s: UNITS_PER_M };
}

// Project (lat, lon) onto the plane so it lines up with the basemap texture.
// Plane rotated [-PI/2]: image top row (north) maps to world -Z, west to -X.
// So: west=-X, east=+X, north=-Z, south=+Z.
function project(lat: number, lon: number, W: number, H: number) {
  const u = (lon - bounds.west) / (bounds.east - bounds.west);
  const vN = (bounds.north - lat) / (bounds.north - bounds.south);
  return { x: (u - 0.5) * W, z: (vN - 0.5) * H };
}

// Pedestal: a slab + framing lip beneath the basemap so the city sits on a
// physical model block instead of a floating sheet.
// ONE pedestal, ONE colour. A single deep block whose top sits just below the
// map plane, extended well past the city silhouette so tilting never reveals the
// void.
const PED_TONE = "#222c42";

function Pedestal({ W, H }: { W: number; H: number }) {
  const DEPTH = 8; // deep enough to read as a solid model block on tilt
  const SW = W + PED_MARGIN * 2;
  const SH = H + PED_MARGIN * 2;
  const TOP = -0.08; // single top face, just below the map plane (y=0)
  return (
    <mesh position={[0, TOP - DEPTH / 2, 0]} receiveShadow>
      <boxGeometry args={[SW, DEPTH, SH]} />
      <meshStandardMaterial color={PED_TONE} roughness={0.62} metalness={0.3} />
    </mesh>
  );
}

function Basemap({ W, H }: { W: number; H: number }) {
  const tex = useLoader(THREE.TextureLoader, "/basemap.png");
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[W, H]} />
      {/* basemap.png is clipped to the London silhouette (transparent corners).
          alphaTest hides them; DoubleSide so it shows from below on tilt. */}
      <meshBasicMaterial
        map={tex}
        toneMapped={false}
        // color > 1 multiplies the texture (HDR) — lifts the muddy basemap
        // without rebuilding the PNG. Basic material ignores lights, so this is
        // the only ground-brightness lever short of regenerating the asset.
        color={new THREE.Color(1.55, 1.55, 1.6)}
        transparent
        alphaTest={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Procedural facade textures: a concrete wall with a window grid (few lit), plus
// an emissive map so only the lit windows glow softly. Shared by all instances.
function makeFacade() {
  const TW = 128;
  const TH = 256; // taller -> more window rows, less vertical stretch
  const cols = 6;
  const rows = 16;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = TW;
    c.height = TH;
    return [c, c.getContext("2d")!] as const;
  };
  const [cMap, x] = mk();
  const [cEm, xe] = mk();
  let seed = 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // concrete base with subtle vertical streaking
  x.fillStyle = "#4a505d";
  x.fillRect(0, 0, TW, TH);
  for (let i = 0; i < 60; i++) {
    const c = 64 + Math.floor(rnd() * 24);
    x.fillStyle = `rgba(${c},${c + 4},${c + 12},0.08)`;
    x.fillRect(rnd() * TW, 0, 1 + rnd() * 2, TH);
  }
  xe.fillStyle = "#000";
  xe.fillRect(0, 0, TW, TH);

  const pad = 3;
  const gx = 5; // mullion gap
  const gy = 6;
  const cw = (TW - pad * 2 - gx * (cols - 1)) / cols;
  const ch = (TH - pad * 2 - gy * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const px = pad + col * (cw + gx);
      const py = pad + r * (ch + gy);
      const lit = rnd() < 0.16;
      if (lit) {
        const w = 200 + Math.floor(rnd() * 55);
        x.fillStyle = `rgb(${w},${w - 20},${Math.floor(w * 0.62)})`; // warm glass
        x.fillRect(px, py, cw, ch);
        xe.fillStyle = `rgb(${w},${Math.floor(w * 0.82)},${Math.floor(w * 0.5)})`;
        xe.fillRect(px, py, cw, ch);
      } else {
        const d = 28 + Math.floor(rnd() * 14); // dark glass, slight variation
        x.fillStyle = `rgb(${d},${d + 6},${d + 16})`;
        x.fillRect(px, py, cw, ch);
      }
    }
  }

  const map = new THREE.CanvasTexture(cMap);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(cEm);
  return { map, emissiveMap };
}

// Real OSM building footprints, extruded as one InstancedMesh (one draw call).
// Loaded at runtime from /buildings.json (static, offline-safe).
// Records are [lat, lon, w_m, d_m, h_m] (+ optional fill flag).
type BData = number[][];

function Buildings({ W, H, s }: { W: number; H: number; s: number }) {
  const [data, setData] = useState<BData | null>(null);
  const ref = useRef<THREE.InstancedMesh>(null);
  const facade = useMemo(makeFacade, []);

  useEffect(() => {
    let alive = true;
    fetch("/buildings.json")
      .then((r) => r.json())
      .then((d: BData) => alive && setData(d))
      .catch(() => alive && setData([]));
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!data || !ref.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < data.length; i++) {
      const [lat, lon, wm, dm, hm] = data[i];
      const { x, z } = project(lat, lon, W, H);
      const w = Math.max(BLDG_MIN_W, wm * s);
      const d = Math.max(BLDG_MIN_W, dm * s);
      const h = Math.max(BLDG_MIN_W, Math.min(hm, BLDG_MAX_H_M) * s * BLDG_EXAG);
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      // taller -> lighter blue-grey tint (multiplies the facade texture, so keep
      // it bright enough that the windows stay legible)
      const t = Math.min(1, hm / 30);
      color.setRGB(0.7 + t * 0.25, 0.74 + t * 0.22, 0.82 + t * 0.18);
      ref.current.setColorAt(i, color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [data, W, H, s]);

  if (!data || data.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, data.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={facade.map}
        emissiveMap={facade.emissiveMap}
        emissive={"#ffd9a0"}
        emissiveIntensity={0.55}
        roughness={0.55}
        metalness={0.25}
        envMapIntensity={0.9}
      />
    </instancedMesh>
  );
}

function RiskColumn({
  ward,
  risk,
  expected,
  dominant,
  x,
  z,
  hovered,
  showLabel,
  onHover,
}: {
  ward: WardForecast;
  risk: number;
  expected: number;
  dominant: string;
  x: number;
  z: number;
  hovered: boolean;
  showLabel: boolean;
  onHover: (id: string | null) => void;
}) {
  const h = Math.max(0.3, risk * MAX_HEIGHT);
  const col = riskColor(risk);
  return (
    <group position={[x, 0, z]}>
      {/* ground marker ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[COL_R * 1.2, COL_R * 1.9, 32]} />
        <meshBasicMaterial color={col} transparent opacity={0.85} />
      </mesh>
      {/* risk column */}
      <mesh
        position={[0, h / 2, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(ward.ward_id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <cylinderGeometry args={[COL_R, COL_R, h, 24]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={hovered ? 1.0 : 0.6}
          transparent
          opacity={0.85}
        />
      </mesh>
      {(showLabel || hovered) && (
        <Billboard position={[0, h + 0.7, 0]}>
          <Text
            fontSize={0.85}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.07}
            outlineColor="#0d1117"
          >
            {ward.ward_name}
          </Text>
        </Billboard>
      )}
      {hovered && (
        <Html position={[0, h + 1.8, 0]} center distanceFactor={26}>
          <div
            style={{
              background: "rgba(13,17,23,0.94)",
              color: "#e6edf3",
              border: "1px solid #30363d",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              width: 170,
              pointerEvents: "none",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <strong>{ward.ward_name}</strong>
            <div>risk: {risk.toFixed(2)}</div>
            <div>expected: {expected.toFixed(2)}</div>
            <div>type: {dominant.replace(/_/g, " ")}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

type Props = {
  wards: WardForecast[];
  hour: number;
  riskOverride?: Record<string, number>;
};

export default function RiskMap3D({ wards, hour, riskOverride }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { W, H, s } = useMemo(planeSize, []);

  // Auto-rotate when idle; pause while the user drags/zooms, resume after 2.5s.
  const controlsRef = useRef<any>(null);
  const idleTimer = useRef<number | null>(null);
  const onInteractStart = () => {
    if (controlsRef.current) controlsRef.current.autoRotate = false;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
  };
  const onInteractEnd = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, 2500);
  };

  const placed = useMemo(
    () =>
      wards.map((w) => {
        const he =
          w.hourly.find((h) => h.hour === hour) ??
          w.hourly[0] ?? { risk_score: 0, expected_count: 0, dominant_type: "" };
        const baseRisk = he.risk_score ?? 0;
        const risk =
          riskOverride && riskOverride[w.ward_id] !== undefined
            ? riskOverride[w.ward_id]
            : baseRisk;
        const { x, z } = project(w.lat, w.lon, W, H);
        return {
          ward: w,
          risk,
          expected: he.expected_count ?? 0,
          dominant: he.dominant_type ?? "",
          x,
          z,
        };
      }),
    [wards, hour, riskOverride, W, H]
  );

  // Centroid of the ward cluster (where the data lives) — camera frames here so
  // the focus area fills the view even when the basemap is all of London.
  const center = useMemo(() => {
    if (!placed.length) return { x: 0, z: 0 };
    return {
      x: placed.reduce((a, p) => a + p.x, 0) / placed.length,
      z: placed.reduce((a, p) => a + p.z, 0) / placed.length,
    };
  }, [placed]);

  // Only the top-N highest-risk wards get a standing label (declutter at scale).
  const labelSet = useMemo(() => {
    const ids = [...placed]
      .sort((a, b) => b.risk - a.risk)
      .slice(0, LABEL_TOP_N)
      .map((p) => p.ward.ward_id);
    return new Set(ids);
  }, [placed]);

  // Frame the camera + orbit target on the cluster once it's known.
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(center.x, 3, center.z);
    c.object.position.set(center.x, 34, center.z + 42);
    c.update();
  }, [center.x, center.z]);

  return (
    <Canvas
      camera={{ position: [center.x, 34, center.z + 42], fov: 45 }}
      gl={{
        alpha: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
      style={{
        width: "100%",
        height: "100%",
        // radial gradient backdrop (CSS) instead of a flat black fill — softer,
        // reads as ambient haze around the model. gl alpha lets it show through.
        background:
          "radial-gradient(120% 100% at 50% 12%, #1b2436 0%, #0c111c 45%, #05070e 100%)",
      }}
    >
      {/* fog matches the backdrop so the extended pedestal fades to it at range */}
      <fog attach="fog" args={["#0c111c", 160, 480]} />
      <hemisphereLight color="#5a6b8c" groundColor="#0a0d14" intensity={0.55} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[-40, 45, -25]} intensity={1.1} color="#ffd9a8" />
      <directionalLight position={[30, 25, 35]} intensity={0.3} color="#7fa8ff" />
      {/* image-based lighting from custom lightformers (offline, no HDR fetch) */}
      <Environment resolution={256} frames={1} background={false}>
        <Lightformer intensity={1.6} position={[-5, 8, -6]} scale={[10, 10, 1]} color="#ffe0b0" />
        <Lightformer intensity={0.9} position={[6, 5, 6]} scale={[10, 6, 1]} color="#7fa8ff" />
        <Lightformer intensity={0.5} position={[0, 12, 0]} scale={[14, 14, 1]} rotation={[Math.PI / 2, 0, 0]} color="#cfe0ff" />
      </Environment>
      <Pedestal W={W} H={H} />
      <Suspense fallback={null}>
        <Basemap W={W} H={H} />
      </Suspense>
      <Buildings W={W} H={H} s={s} />
      {/* ground buildings + columns onto the map. Scoped to the focus cluster so
          the shadow map keeps resolution (not stretched over all of London). */}
      <ContactShadows
        position={[center.x, 0.03, center.z]}
        scale={120}
        resolution={1024}
        blur={2.6}
        opacity={0.55}
        far={22}
        color="#01030a"
      />
      {placed.map((p) => (
        <RiskColumn
          key={p.ward.ward_id}
          ward={p.ward}
          risk={p.risk}
          expected={p.expected}
          dominant={p.dominant}
          x={p.x}
          z={p.z}
          hovered={hovered === p.ward.ward_id}
          showLabel={labelSet.has(p.ward.ward_id)}
          onHover={setHovered}
        />
      ))}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.45}
        minDistance={6}
        maxDistance={200}
        enablePan
        enableZoom
        enableRotate
        // keep the camera looking down: ~68° max tilt so the horizon/sky (the
        // black background) never enters the frame — only the pedestal fills it.
        maxPolarAngle={Math.PI / 2.65}
        onStart={onInteractStart}
        onEnd={onInteractEnd}
      />
      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.5}
          luminanceSmoothing={0.25}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.3} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
