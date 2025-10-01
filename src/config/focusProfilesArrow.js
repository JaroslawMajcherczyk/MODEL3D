// Konfiguracja HUD (strzałka + label) per model i etap.
// Używaj z: getArrowStageOpts(stageNo, modelKey, override)

const MODEL_1 = {
  stages: {
    1: {
      text: "Misurare la larghezza del primo morsetto",
      arrowSize: 130,
      labelFontSize: 24,
      labelSide: "bottom",   // napis pod strzałką
      gapPx: 14,
      offsetPx: { x: -45, y: 380 }, // ekran: +y w dół, +x w prawo
      // opcjonalnie: anchorNode, anchorOffset
    },
    2: {
      text: "Misurare la larghezza del secondo morsetto",
      arrowSize: 130,
      labelFontSize: 24,
      labelSide: "bottom",
      gapPx: 14,
      offsetPx: { x: -20, y: -450 }, // ekran: +y w dół, +x w prawo
    },
    3: {
      text: "Misurare la larghezza del terzo morsetto",
      arrowSize: 130,
      labelFontSize: 24,
      labelSide: "bottom",
      gapPx: 14,
      offsetPx: { x: 120, y: 210 }, // ekran: +y w dół, +x w prawo
    },
    4: {
      text: "Misurare la larghezza del quarto morsetto",
      arrowSize: 140,
      labelFontSize: 26,
      labelSide: "bottom",
      gapPx: 14,
      offsetPx: { x: -290, y: -150 }, // ekran: +y w dół, +x w prawo
    },
  },
};

// 2.gltf – delikatne przesunięcia i większa strzałka w 1 etapie
const MODEL_2 = {
  stages: {
    1: {text: "Misurare la larghezza del primo morsetto", offsetPx: { x: -150, y: 454 }, arrowSize: 150 }, // ekran: +y w dół, +x w prawo
    2: {text: "Misurare la larghezza del secondo morsetto", offsetPx: { x: -560,  y: -636 } }, // ekran: +y w dół, +x w prawo
    3: {text: "Misurare la larghezza del terzo morsetto", offsetPx: { x: -200, y: 220 } }, // ekran: +y w dół, +x w prawo
    4: {text: "Misurare la larghezza del quarto morsetto", offsetPx: { x: -40,  y: -390 } }, // ekran: +y w dół, +x w prawo
  },
};

// 3.gltf – tylko etapy 1 i 2, inne teksty/rozmiary jeśli chcesz
const MODEL_3 = {
  stages: {
    1: {
      text: "Misurare la larghezza del primo morsetto", 
      arrowSize: 140,
      labelFontSize: 26,
      offsetPx: { x: 540, y: -320 }, // ekran: +y w dół, +x w prawo
    },
    2: {
      text: "Misurare la larghezza del secondo morsetto", 
      arrowSize: 140,
      labelFontSize: 26,
      offsetPx: { x: 600, y: -220 }, // ekran: +y w dół, +x w prawo
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
