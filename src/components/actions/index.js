// src/components/actions/index.js
// Ten plik eksportuje WYŁĄCZNIE etapy fokusów oraz focusStage.
// NIE importuje nic z ../modelActions.jsx, żeby nie było cyklu.

import { getCameraStageOpts } from "../../config/focusProfilesCamera";
import { getArrowStageOpts }  from "../../config/focusProfilesArrow";

// Uwaga: nie importujemy tu modułów focusX na stałe, żeby nie spinać cykli.
// Ładujemy je leniwie (dynamic import) w zależności od numeru etapu.

/** Ustal klucz modelu (ustawiany podczas ładowania modelu) */
function resolveModelKey(overrides) {
  if (overrides && typeof overrides.modelKey === "string" && overrides.modelKey)
    return overrides.modelKey;
  const k = window?.Nexus?.modelKey;
  return (typeof k === "string" && k) ? k : "default";
}

/** Czy model ma ograniczenia etapów (np. model3 tylko 1–2)? */
function clampStageForModel(stage, modelKey) {
  if (String(modelKey) === "3") return Math.min(2, Math.max(1, stage|0));
  return stage|0;
}

/** Połącz profile z ewentualnymi nadpisaniami */
function buildOpts(stageNo, modelKey, overrides) {
  const cam = getCameraStageOpts(stageNo, modelKey, overrides);
  const hud = getArrowStageOpts(stageNo, modelKey, overrides?.hud);
  // Etapy oczekują płaskiego obiektu opcji, więc rozlewamy:
  return { modelKey, ...cam, ...hud, ...(overrides || {}) };
}

/** Leniwe odpalenie konkretnej funkcji etapu */
async function runStage(stageNo, opts) {
  switch (stageNo) {
    case 1: {
      const { focusModelFirstStageSmooth } = await import("./focusFirst");
      return focusModelFirstStageSmooth(opts);
    }
    case 2: {
      const { focusModelSecondStageSmooth } = await import("./focusSecond");
      return focusModelSecondStageSmooth(opts);
    }
    case 3: {
      const { focusModelThirdStageSmooth } = await import("./focusThird");
      return focusModelThirdStageSmooth(opts);
    }
    case 4: {
      const { focusModelFourthStageSmooth } = await import("./focusFourth");
      return focusModelFourthStageSmooth(opts);
    }
    default:
      console.warn("[focusStage] unsupported stage:", stageNo);
      return;
  }
}

/**
 * Główny dyspozytor wołany z backendu:
 *    CallReactAsync("focusStage", stageNo [, overrides])
 * Albo lokalnie: window.Nexus.actions.focusStage(2, { ... })
 */
export async function focusStage(n, overrides = {}) {
  const modelKey = resolveModelKey();
  const stage = clampStageForModel(n|0, modelKey);

    console.log("[focusStage] stage:", n, "→", stage, "modelKey:", modelKey);


  const opts = buildOpts(stage, modelKey, overrides);
  return runStage(stage, opts);
}

// (Opcjonalnie) eksport bezpośredni — przydatny, gdy ktoś importuje funkcje ręcznie.
// UWAGA: te „bezpośrednie” API też wpinamy w profile, wywołując pod spodem focusStage,
// żeby zachować spójność (nawet jeśli backend nadal wzywa stare nazwy).
export async function focusModelFirstStageSmooth(overrides = {})  { return focusStage(1, overrides); }
export async function focusModelSecondStageSmooth(overrides = {}) { return focusStage(2, overrides); }
export async function focusModelThirdStageSmooth(overrides = {})  { return focusStage(3, overrides); }
export async function focusModelFourthStageSmooth(overrides = {}) { return focusStage(4, overrides); }

// Opcjonalna rejestracja do window.Nexus.actions (tylko etapy, przez profile)
if (typeof window !== "undefined") {
  window.Nexus ??= {};
  window.Nexus.actions ??= {};
  const api = {
    focusStage,
    // proxy — nawet gdy backend/człowiek wzywa „stare” nazwy, i tak przechodzimy przez profile:
    focusModelFirstStageSmooth:  (o)=> focusStage(1, o),
    focusModelSecondStageSmooth: (o)=> focusStage(2, o),
    focusModelThirdStageSmooth:  (o)=> focusStage(3, o),
    focusModelFourthStageSmooth: (o)=> focusStage(4, o),
  };
  Object.assign(window.Nexus.actions, api);
  window.dispatchEvent(new Event("nexus:actions:ready"));
  window.Nexus?.send?.("ActionsReady");
  console.log("[Nexus] actions registered (stages via profiles):", Object.keys(api));
}
