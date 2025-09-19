// Konfiguracja parametrów KAMERY/REGIONU per model i etap.
// Używaj z: getCameraStageOpts(stageNo, modelKey, override)

const MODEL_1 = {
  // Domyślne pod 1.gltf — zgodne z Twoją implementacją Stage 1 i
  // analogiczne dla Stage 2/3/4 (jak w aktualnych funkcjach).
  stages: {
    1: {
      // focusModelFirstStageSmooth
      startFrac: 0.00,
      regionFrac: 0.14,
      padding: 1.04,
      leftBiasN: -0.30,
      raiseN: -0.06,
      screenShift: { x: 0.02, y: -0.66 },
      duration: 900,
      forceAxis: "x",
      shrink: 0.55,
    },
    2: {
      // focusModelSecondStageSmooth
      fraction: 0.72,
      regionFrac: 0.18,
      padding: 1.06,
      align: -0.10,
      offsetN: { x: 0.02, y: 0.06, z: 0 },
      forceAxis: "x",
      shrink: 0.90,
      duration: 1100,
    },
    3: {
      // focusModelThirdStageSmooth
      fraction: 0.82,
      regionFrac: 0.20,
      padding: 1.06,
      align: 0.0,
      forceAxis: "x",
      shrink: 0.85,
      offsetN: { x: 0, y: 0, z: 0 },
      screenShift: { x: 0.14, y: -0.38 },
      duration: 1100,
    },
    4: {
      // focusModelFourthStageSmooth
      fraction: 0.82,
      regionFrac: 0.22,
      padding: 1.06,
      shrink: 0.88,
      forceAxis: "x",
      orbitAngleDeg: 180,
      orbitDir: "auto",
      orbitMs: 1100,
      midAt: 0.40,
      midZoom: 0.90,
      finalAlign: +0.04,
      finalScreenShift: { x: -0.26, y: -0.02 },
      preMs: 260,
      postMs: 340,
    },
  },
};

// Korekty pod 2.gltf (tylko to, co różni się od DEFAULT)
const MODEL_2 = {
  stages: {
    1: {
      startFrac: 0.10,
      regionFrac: 0.16,
      screenShift: { x: -0.16, y: -0.68 },
      // reszta z DEFAULT
    },
    2: {
      fraction: 0.68,
      regionFrac: 0.20,
      offsetN: { x: -0.12, y: 0.15, z: 0 },
    },
    3: {
      fraction: 0.80,
      screenShift: { x: -0.22, y: -0.42 },
    },
    4: {
      fraction: 0.82,
      regionFrac: 0.22,
      padding: 1.06,
      shrink: 0.88,
      forceAxis: "x",
      orbitAngleDeg: 180,
      orbitDir: "auto",
      orbitMs: 1100,
      midAt: 0.40,
      midZoom: 0.90,
      finalAlign: +0.04,
      finalScreenShift: { x: 0.02, y: -0.02 },
      preMs: 260,
      postMs: 340,
    },
  },
};

// 3.gltf — TYLKO etapy 1 i 2 (robisz 2 pomiary). 3/4 pomijamy.
const MODEL_3 = {
  stages: {
    1: {
      // ustaw pozycje tak jak potrzebujesz; startowo jak default
      startFrac: 0.00,
      regionFrac: 0.16,
      screenShift: { x: 0.60, y: 0.48},
      padding: 1.06,
      shrink: 0.60,
    },
    2: {
      fraction: 0.72,
      regionFrac: 0.22,
      padding: 1.06,
      align: -0.10,
      offsetN: { x: 0.18, y: 0.18, z: 0.10 },
      shrink: 0.90,
    },
    // brak 3 i 4 — profile nie istnieją, co pozwala łatwo to wykryć
  },
};

export const CAMERA_PROFILES = {
  default: MODEL_1,
  "1": MODEL_1,
  "2": MODEL_2,
  "3": MODEL_3,
};

export function getCameraStageOpts(stageNo, modelKey, override = {}) {
  const base = CAMERA_PROFILES[modelKey] || CAMERA_PROFILES.default;
  const stage = base?.stages?.[stageNo] ?? {};
  return deepMerge(stage, override || {});
}

// --- utils ---
function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const k of Object.keys(b || {})) {
    const av = out[k], bv = b[k];
    if (isObj(av) && isObj(bv)) out[k] = deepMerge(av, bv);
    else out[k] = bv;
  }
  return out;
}
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
