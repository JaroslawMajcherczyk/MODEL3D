// Konfiguracja HUD (strzałka + label) per model i etap.
// Używaj z: getArrowStageOpts(stageNo, modelKey, override)

const MODEL_1 = {
  stages: {
    1: {
      text: "Zmierz szerokość pierwszego zacisku",
      arrowSize: 130,
      labelFontSize: 24,
      labelSide: "bottom",   // napis pod strzałką
      gapPx: 14,
      offsetPx: { x: -45, y: 420 }, // ekran: +y w dół, +x w prawo
      // opcjonalnie: anchorNode, anchorOffset
    },
    2: {
      text: "Zmierz szerokość drugiego zacisku",
      arrowSize: 130,
      labelFontSize: 24,
      labelSide: "bottom",
      gapPx: 14,
      offsetPx: { x: -20, y: -594 },
    },
    3: {
      text: "Zmierz szerokość trzeciego zacisku",
      arrowSize: 130,
      labelFontSize: 24,
      labelSide: "bottom",
      gapPx: 14,
      offsetPx: { x: 140, y: 210 },
    },
    4: {
      text: "Zmierz szerokość czwartego zacisku",
      arrowSize: 140,
      labelFontSize: 26,
      labelSide: "bottom",
      gapPx: 14,
      offsetPx: { x: -360, y: -220 },
    },
  },
};

// 2.gltf – delikatne przesunięcia i większa strzałka w 1 etapie
const MODEL_2 = {
  stages: {
    1: { offsetPx: { x: -180, y: 514 }, arrowSize: 150 },
    2: { offsetPx: { x: -710,  y: -840 } },
    3: { offsetPx: { x: -250, y: 230 } },
    4: { offsetPx: { x: -40,  y: -480 } },
  },
};

// 3.gltf – tylko etapy 1 i 2, inne teksty/rozmiary jeśli chcesz
const MODEL_3 = {
  stages: {
    1: {
      text: "Zmierz pierwszy zacisk",
      arrowSize: 140,
      labelFontSize: 26,
      offsetPx: { x: 680, y: -440 },
    },
    2: {
      text: "Zmierz drugi zacisk",
      arrowSize: 140,
      labelFontSize: 26,
      offsetPx: { x: 750, y: -320 },
    },
    // brak 3 i 4
  },
};

export const ARROW_PROFILES = {
  default: MODEL_1,
  "1": MODEL_1,
  "2": MODEL_2,
  "3": MODEL_3,
};

export function getArrowStageOpts(stageNo, modelKey, override = {}) {
  const base = ARROW_PROFILES[modelKey] || ARROW_PROFILES.default;
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
