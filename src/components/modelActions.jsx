// Ten plik po refaktorze zawiera:
//  - ładowanie modelu (loadFromProjectAndRotateX)
//  - moduł pomiarów i summary (setMeasure, show/hide/clearMeasure, ...)
//  - rejestrację WYŁĄCZNIE tych akcji w window.Nexus.actions
//
// UWAGA: Funkcje etapów (focusModelFirst..FourthStageSmooth, focusStage)
// są teraz w folderze ./actions i NIE są tu importowane, aby uniknąć cyklu.

import { disposeObject, loadGltfFromUrl } from "./threeUtils";
import { rotateX90, setViewRight } from "./viewOps";

// ============================================================================
// 1) Załaduj model z projektu + obrót X + startowy widok RIGHT
// ============================================================================
export async function loadFromProjectAndRotateX(opts = {}) {
  const cfg = {
    projectRelUrl: "../model/gltf/1.gltf",
    onLoading: () => {},
    onLoaded:  () => {},
    ...opts,
  };

  // Refs z opts albo z window.Nexus.refs
  const g = (typeof window !== "undefined" && window.Nexus && window.Nexus.refs) || {};
  const scene    = (cfg.sceneRef    ?? g.sceneRef   )?.current;
  const camera   = (cfg.cameraRef   ?? g.cameraRef  )?.current;
  const controls = (cfg.controlsRef ?? g.controlsRef)?.current;
  const modelRef = (cfg.modelRef    ?? g.modelRef   );

  if (!scene || !camera || !controls) {
    console.warn("[actions] refs not ready (loadFromProjectAndRotateX)");
    return;
  }

  cfg.onLoading(true);
  try {
    // usuń poprzedni model
    if (modelRef?.current) {
      scene.remove(modelRef.current);
      disposeObject(modelRef.current);
      modelRef.current = null;
    }

    const modelUrl = new URL(cfg.projectRelUrl, import.meta.url).href;
    const root = await loadGltfFromUrl(modelUrl);

    rotateX90(root);
    if (modelRef) modelRef.current = root;
    scene.add(root);

    setViewRight(camera, controls, root);

    // sygnały o wczytaniu
    cfg.onLoaded(root);
    window.dispatchEvent(new Event("nexus:model:loaded"));
    window.Nexus?.send?.("ModelReady");
  } catch (err) {
    console.error(err);
    alert("Nie udało się wczytać modelu: " + (err?.message || err));
  } finally {
    cfg.onLoading(false);
  }
}

// ============================================================================
// 2) SUMMARY / POMIARY — bez zmian w API, z bezpiecznym store
// ============================================================================
function ensureSummaryStore() {
  window.Nexus ??= {};
  const s = (window.Nexus.summary ??= {
    slots: [null, null, null, null],
    items: [],
    visible: false,
  });
  if (!Array.isArray(s.slots) || s.slots.length !== 4) s.slots = [null, null, null, null];
  if (!Array.isArray(s.items)) s.items = [];
  return s;
}

function pushMeasureToHistory(item) {
  const s = ensureSummaryStore();
  s.items.push(item);
  if (s.items.length > 20) s.items.shift();
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
}

export function setMeasure(value, unit = "mm", min = null, max = null, stage = null) {
  const v = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  const m = min == null ? null : Number(min);
  const M = max == null ? null : Number(max);

  window.Nexus ??= {};
  window.Nexus.lastMeasure = { value: v, unit, min: m, max: M, stage, ts: Date.now() };

  // (a) publikacja live
  window.dispatchEvent(new CustomEvent("nexus:measure", {
    detail: { value: v, unit, min: m, max: M, stage }
  }));

  // (b) aktualizacja slotów 1..4
  const s = ensureSummaryStore();
  if (Number.isInteger(stage) && stage >= 1 && stage <= 4) {
    s.slots[stage - 1] = { value: v, unit, min: m, max: M, stage, ts: Date.now() };
    window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
  }

  // (c) historia
  pushMeasureToHistory({ value: v, unit, min: m, max: M, stage, ts: Date.now() });

  console.log("[setMeasure]", { stage, value: v });
}

export function showMeasure() {
  window.Nexus ??= {}; window.Nexus.ui ??= {};
  window.Nexus.ui.measureVisible = true;
  window.dispatchEvent(new Event("nexus:measure:show"));
}
export function hideMeasure() {
  window.Nexus ??= {}; window.Nexus.ui ??= {};
  window.Nexus.ui.measureVisible = false;
  window.dispatchEvent(new Event("nexus:measure:hide"));
}
export function clearMeasure() {
  window.Nexus ??= {};
  window.Nexus.lastMeasure = { value: null, unit: "mm", min: null, max: null };
  window.dispatchEvent(new Event("nexus:measure:clear"));
}

export function fireSummaryUpdate() {
  const s = ensureSummaryStore();
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
}
export function showSummary() {
  const s = ensureSummaryStore();
  s.visible = true;
  window.dispatchEvent(new Event("nexus:summary:show"));
}
export function hideSummary() {
  const s = ensureSummaryStore();
  s.visible = false;
  window.dispatchEvent(new Event("nexus:summary:hide"));
}
export function clearSummary() {
  window.Nexus ??= {};
  window.Nexus.summary = { slots: [null, null, null, null], items: [], visible: false };
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: [] }));
}
export function clearSummarySlot(index) {
  const s = ensureSummaryStore();
  if (index >= 0 && index < 4) s.slots[index] = null;
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
}
export function markMeasureInvalid() {
  window.dispatchEvent(new Event("nexus:measure:invalid"));
}
export function markBack() {
  window.dispatchEvent(new Event("nexus:back"));
}

// ============================================================================
// 3) Rejestracja do window.Nexus.actions (tylko loader + pomiary)
// ============================================================================
if (typeof window !== "undefined") {
  window.Nexus ??= {};
  window.Nexus.actions ??= {};
  Object.assign(window.Nexus.actions, {
    // Loader
    loadFromProjectAndRotateX,
    // Pomiar / Summary
    setMeasure, showMeasure, hideMeasure, clearMeasure,
    fireSummaryUpdate, clearSummary, showSummary, hideSummary, clearSummarySlot,
    markMeasureInvalid, markBack,
  });
  window.dispatchEvent(new Event("nexus:actions:extended"));
  console.log(
    "[Nexus] actions extended (measure+loader):",
    Object.keys(window.Nexus.actions)
  );
}
