// src/components/modelActions.jsx
// Ten plik po refaktorze zawiera:
//  - ładowanie modelu (loadFromProjectAndRotateX)
//  - moduł pomiarów i summary (setMeasure, show/hide/clearMeasure, ...)
//  - sygnały do UndoCountdown (start/cancel + automatyczny trigger na etapie końcowym)
//  - rejestrację WYŁĄCZNIE tych akcji w window.Nexus.actions

import { disposeObject, loadGltfFromUrl } from "./threeUtils";
import { rotateX90, setViewRight } from "./viewOps";

/* ------------------------------- URL resolver ------------------------------- */

function resolveModelUrl(input) {
  if (!input || typeof input !== "string") return null;
  if (/^(https?:|blob:|data:)/i.test(input)) return input;
  if (input.startsWith("/")) return new URL(input, window.location.origin).href;
  if (input.startsWith("../") || input.startsWith("./")) {
    const cleaned = input.replace(/^(\.\/)+/, "").replace(/^(\.\.\/)+/, "");
    return new URL("/" + cleaned, window.location.origin).href;
  }
  const base = (window.__NEXUS_MODELS_BASE__ || "/model/gltf/").replace(/\/+$/, "/");
  return new URL(base + input.replace(/^\/+/, ""), window.location.origin).href;
}

function extractModelKeyFromUrl(u) {
  try {
    const s = String(u || "");
    const m = s.match(/\/([^\\/?#]+)\.gltf(\?|#|$)/i);
    return m ? m[1] : "default";
  } catch { return "default"; }
}

/* ------------------------------- Loader modelu ------------------------------- */

export async function loadFromProjectAndRotateX(opts = {}) {
  const cfg = {
    projectRelUrl: null,
    onLoading: () => {},
    onLoaded:  () => {},
    modelKey: undefined,
    ...opts,
  };

  const g = (typeof window !== "undefined" && window.Nexus && window.Nexus.refs) || {};
  const scene    = (cfg.sceneRef    ?? g.sceneRef   )?.current;
  const camera   = (cfg.cameraRef   ?? g.cameraRef  )?.current;
  const controls = (cfg.controlsRef ?? g.controlsRef)?.current;
  const modelRef = (cfg.modelRef    ?? g.modelRef   );
  if (!scene || !camera || !controls) {
    console.warn("[actions] refs not ready (loadFromProjectAndRotateX)");
    return;
  }

  const src = resolveModelUrl(cfg.projectRelUrl);
  if (!src) {
    console.warn("[actions] loadFromProjectAndRotateX: brak/niepoprawny projectRelUrl:", cfg.projectRelUrl);
    return;
  }
  console.log("[loader] requested:", cfg.projectRelUrl, "resolved:", src);

  const key = extractModelKeyFromUrl(src);
  window.Nexus ??= {};
  window.Nexus.modelKey = key;
  window.Nexus.currentModelUrl = src;
  window.dispatchEvent(new CustomEvent("nexus:model:key", { detail: key }));
  console.log("[loader] modelKey:", key, "url:", src);

  cfg.onLoading(true);
  try {
    try {
      const head = await fetch(src, { method: "HEAD" });
      const ct = head.headers.get("content-type") || "";
      if (!head.ok || /text\/html/i.test(ct)) {
        console.warn("[actions] HEAD probe warns:", head.status, head.statusText, "content-type:", ct);
      }
    } catch (probeErr) {
      console.warn("[actions] probe (HEAD) failed — continuing anyway:", probeErr?.message || probeErr);
    }

    if (modelRef?.current) {
      scene.remove(modelRef.current);
      disposeObject(modelRef.current);
      modelRef.current = null;
    }

    const root = await loadGltfFromUrl(src);
    rotateX90(root);
    if (modelRef) modelRef.current = root;
    scene.add(root);

    setViewRight(camera, controls, root);

    window.Nexus ??= {};
    const file = (new URL(src, window.location.origin).pathname.split("/").pop() || "");
    window.Nexus.modelMeta = { key: window.Nexus.modelKey, src, file };

    cfg.onLoaded(root);
    window.dispatchEvent(new Event("nexus:model:loaded"));
    window.Nexus?.send?.("ModelReady");
  } catch (err) {
    console.error("[actions] load model error:", err);
    alert("Nie udało się wczytać modelu: " + (err?.message || err));
  } finally {
    cfg.onLoading(false);
  }
}

/* --------------------------- SUMMARY / POMIARY + UNDO --------------------------- */

// terminalny etap (ostatni pomiar) zależny od modelu
const TERMINAL_STAGE_BY_MODELKEY = {
  "1": 4,
  "2": 4,
  "3": 2,
  default: 4,
};

// proste API do uruchamiania/kończenia licznika cofnij
export function startUndoCountdown(seconds = 12, extra = {}) {
  window.dispatchEvent(new CustomEvent("nexus:undo:start", {
    detail: { seconds, ...extra }
  }));
}
export function cancelUndoCountdown() {
  window.dispatchEvent(new Event("nexus:undo:cancel"));
}

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

  // live event dla UI/pomiarów
  window.dispatchEvent(new CustomEvent("nexus:measure", {
    detail: { value: v, unit, min: m, max: M, stage }
  }));

  // sloty 1..4
  const s = ensureSummaryStore();
  if (Number.isInteger(stage) && stage >= 1 && stage <= 4) {
    s.slots[stage - 1] = { value: v, unit, min: m, max: M, stage, ts: Date.now() };
    window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
  }

  // historia
  pushMeasureToHistory({ value: v, unit, min: m, max: M, stage, ts: Date.now() });

  // 🔴 AUTOMATYCZNY TRIGGER COUNTDOWN NA ETAPIE KOŃCOWYM, TYLKO GDY POZA ZAKRESEM
  const modelKey = window.Nexus?.modelKey || "default";
  const terminalStage = TERMINAL_STAGE_BY_MODELKEY[modelKey] ?? TERMINAL_STAGE_BY_MODELKEY.default;

  if (Number.isFinite(v) && Number.isFinite(m) && Number.isFinite(M) && stage === terminalStage) {
    const outOfRange = (v < m) || (v > M);
    if (outOfRange) {
      // start licznika cofnięcia (domyślnie 12s)
      startUndoCountdown(12, { stage, value: v, min: m, max: M, modelKey });
    } else {
      // jeżeli weszło w zakres — pewność, że nie ma aktywnego timera
      cancelUndoCountdown();
    }
  }

  console.log("[setMeasure]", { stage, value: v, min: m, max: M });
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
export function setSummaryRequiredSlots(n = 4) {
  window.Nexus ??= {}; window.Nexus.ui ??= {};
  const k = Math.max(1, Math.min(4, Number(n) || 4));
  window.Nexus.ui.summaryRequiredSlots = k;
  window.dispatchEvent(new Event("nexus:summary:required"));
}

/* --------------------------- Rejestracja akcji --------------------------- */

if (typeof window !== "undefined") {
  window.Nexus ??= {};
  window.Nexus.actions ??= {};
  Object.assign(window.Nexus.actions, {
    // Loader
    loadFromProjectAndRotateX,
    // Pomiar / Summary
    setMeasure, showMeasure, hideMeasure, clearMeasure,
    fireSummaryUpdate, clearSummary, showSummary, hideSummary, clearSummarySlot,
    markMeasureInvalid, markBack, setSummaryRequiredSlots,
    // Undo countdown (ręczne sterowanie z backendu, jeśli potrzeba)
    startUndoCountdown,
    cancelUndoCountdown,
  });

  window.dispatchEvent(new Event("nexus:actions:extended"));
  window.dispatchEvent(new Event("nexus:actions:ready"));

  console.log(
    "[Nexus] actions extended (measure+loader+undo):",
    Object.keys(window.Nexus.actions)
  );
}
