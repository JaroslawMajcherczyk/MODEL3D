// src/components/modelActions.jsx
// Ten plik po refaktorze zawiera:
//  - ładowanie modelu (loadFromProjectAndRotateX)
//  - moduł pomiarów i summary (setMeasure, show/hide/clearMeasure, ...)
//  - rejestrację WYŁĄCZNIE tych akcji w window.Nexus.actions

import { disposeObject, loadGltfFromUrl } from "./threeUtils";
import { rotateX90, setViewRight } from "./viewOps";

/* ------------------------------- URL resolver -------------------------------

Przyjmuje:
- absolutne: http(s)://, blob:, data:
- od root-a: /model/gltf/1.gltf
- relatywne: ./foo/1.gltf, ../bar/1.gltf (normalizowane do /… względem origin)
- „gołą” nazwę: 1.gltf -> (window.__NEXUS_MODELS_BASE__ || "/model/gltf/") + 1.gltf

------------------------------------------------------------------------------- */


function resolveModelUrl(input) {
  if (!input || typeof input !== "string") return null;

  // 1) Absolutne URL-e i schematy specjalne
  if (/^(https?:|blob:|data:)/i.test(input)) return input;

  // 2) Origin-relative ("/model/gltf/1.gltf")
  if (input.startsWith("/")) return new URL(input, window.location.origin).href;

  // 3) Względne "../" lub "./" → znormalizuj do ścieżki od root-a
  if (input.startsWith("../") || input.startsWith("./")) {
    const cleaned = input.replace(/^(\.\/)+/, "").replace(/^(\.\.\/)+/, "");
    return new URL("/" + cleaned, window.location.origin).href;
  }

  // 4) Sama nazwa pliku → katalog bazowy na modele (public/model/gltf/)
  const base = (window.__NEXUS_MODELS_BASE__ || "/model/gltf/").replace(/\/+$/, "/");
  return new URL(base + input.replace(/^\/+/, ""), window.location.origin).href;
}

function extractModelKeyFromUrl(u) {
  try {
    const s = String(u || "");
    // np. /model/gltf/2.gltf -> "2"
    const m = s.match(/\/([^\\/?#]+)\.gltf(\?|#|$)/i);
    return m ? m[1] : "default";
  } catch { return "default"; }
}
// ============================================================================
// 1) Załaduj model + obrót X + startowy widok RIGHT
//    UWAGA: brak domyślnego modelu — MUSISZ podać projectRelUrl z backendu
// ============================================================================
export async function loadFromProjectAndRotateX(opts = {}) {
  const cfg = {
    projectRelUrl: null,   // <- MUSI przyjść z C#
    onLoading: () => {},
    onLoaded:  () => {},
    // (opcjonalnie można podać modelKey ręcznie; jeśli nie, wyliczymy z nazwy pliku)
    modelKey: undefined,
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

  const src = resolveModelUrl(cfg.projectRelUrl);
  if (!src) {
    console.warn("[actions] loadFromProjectAndRotateX: brak/niepoprawny projectRelUrl:", cfg.projectRelUrl);
    return;
  }
  console.log("[loader] requested:", cfg.projectRelUrl, "resolved:", src);
// ⬇️ USTAW KLUCZ OD RAZU (zanim zacznie się ładowanie)
  const key = extractModelKeyFromUrl(src);
  window.Nexus ??= {};
  window.Nexus.modelKey = key;
  window.Nexus.currentModelUrl = src;
  window.dispatchEvent(new CustomEvent("nexus:model:key", { detail: key }));
  console.log("[loader] modelKey:", key, "url:", src);
  cfg.onLoading(true);
  try {
    // Sonda HEAD jest tylko ostrzegawcza — NIE blokujemy ładowania,
    // bo dev serwery (Vite) czasem nie wspierają HEAD poprawnie.
    try {
      const head = await fetch(src, { method: "HEAD" });
      const ct = head.headers.get("content-type") || "";
      if (!head.ok || /text\/html/i.test(ct)) {
        console.warn("[actions] HEAD probe warns:", head.status, head.statusText, "content-type:", ct);
      }
    } catch (probeErr) {
      console.warn("[actions] probe (HEAD) failed — continuing anyway:", probeErr?.message || probeErr);
    }

    // Usuń poprzedni model
    if (modelRef?.current) {
      scene.remove(modelRef.current);
      disposeObject(modelRef.current);
      modelRef.current = null;
    }

    // Wczytaj GLTF
    const root = await loadGltfFromUrl(src);
    rotateX90(root);
    if (modelRef) modelRef.current = root;
    scene.add(root);

    // Ustaw widok startowy
    setViewRight(camera, controls, root);

    // (opcjonalnie) zapisz meta — BEZ zmiany modelKey
    window.Nexus ??= {};
    const file = (new URL(src, window.location.origin).pathname.split("/").pop() || "");
    window.Nexus.modelMeta = { key: window.Nexus.modelKey, src, file };

    // Sygnały o wczytaniu
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

// ============================================================================
// 2) SUMMARY / POMIARY
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

  // live
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
export function setSummaryRequiredSlots(n = 4) {
  window.Nexus ??= {}; window.Nexus.ui ??= {};
  const k = Math.max(1, Math.min(4, Number(n) || 4));
  window.Nexus.ui.summaryRequiredSlots = k;
  window.dispatchEvent(new Event("nexus:summary:required"));
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
    markMeasureInvalid, markBack, setSummaryRequiredSlots,
  });

  // Dwa eventy: „extended” do logów i „ready” dla handshake w main.jsx
  window.dispatchEvent(new Event("nexus:actions:extended"));
  window.dispatchEvent(new Event("nexus:actions:ready"));

  console.log(
    "[Nexus] actions extended (measure+loader):",
    Object.keys(window.Nexus.actions)
  );
}
