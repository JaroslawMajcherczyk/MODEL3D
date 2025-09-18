// src/components/actions.jsx
import * as THREE from "three";
import { disposeObject, loadGltfFromUrl } from "./threeUtils";
import { rotateX90, setViewRight } from "./viewOps";

// === Refs resolver: pobiera z opts albo z window.Nexus.refs ===
function resolveRefs(opts) {
  const g = (typeof window !== 'undefined' && window.Nexus && window.Nexus.refs) || {};
  return {
    sceneRef:    opts?.sceneRef    ?? g.sceneRef,
    cameraRef:   opts?.cameraRef   ?? g.cameraRef,
    controlsRef: opts?.controlsRef ?? g.controlsRef,
    modelRef:    opts?.modelRef    ?? g.modelRef,
  };
}

// === Helpers ===
function fitDistanceForSize(camera, sizeVec, padding = 1.15) {
  const maxSize = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
  const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitW = fitH / camera.aspect;
  return padding * Math.max(fitH, fitW);
}

let __animToken = 0;
// eslint-disable-next-line react-refresh/only-export-components
const EASE = (t)=> (t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t);

function animateCameraTo({ camera, controls, newTarget, newDistance, duration = 800 }) {
  const myToken = ++__animToken;
  return new Promise((resolve) => {
    const startTarget = controls.target.clone();
    const startPos    = camera.position.clone();
    const dir         = startPos.clone().sub(startTarget).normalize();
    const endPos      = newTarget.clone().add(dir.multiplyScalar(newDistance));
    const t0 = performance.now();

    function step(now){
      if (myToken !== __animToken) return resolve();
      const t = Math.min(1, (now - t0) / duration);
      const k = EASE(t);

      controls.target.copy(startTarget).lerp(newTarget, k);
      camera.position.copy(startPos).lerp(endPos, k);

      const d = camera.position.distanceTo(controls.target);
      camera.near = Math.max(0.001, d / 100);
      camera.far  = Math.max(10, d * 100);
      camera.updateProjectionMatrix();
      controls.update();

      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function orbitCameraAroundTarget({
  camera, controls, target, axis,
  totalAngle = Math.PI * 105/180, duration = 1100, distanceKeys,
}) {
  const myToken = ++__animToken;
  return new Promise((resolve) => {
    const startPos = camera.position.clone();
    const startRel = startPos.clone().sub(target);
    const startD   = startRel.length();
    const up = (axis && axis.clone().normalize()) || camera.up.clone().normalize();

    const keys = distanceKeys && distanceKeys.length
      ? distanceKeys
      : [{ t:0, d:startD }, { t:0.4, d:startD*0.9 }, { t:1, d:startD }];

    const t0 = performance.now();
    function distAt(t){
      let a = keys[0], b = keys[keys.length - 1];
      for (let i=0;i<keys.length-1;i++){
        if (t>=keys[i].t && t<=keys[i+1].t){ a=keys[i]; b=keys[i+1]; break; }
      }
      const span = Math.max(1e-6, b.t - a.t);
      const k = (t - a.t) / span;
      return a.d*(1-k) + b.d*k;
    }

    function step(now){
      if (myToken !== __animToken) return resolve();
      const t = Math.min(1, (now - t0) / duration);
      const k = EASE(t);

      const q   = new THREE.Quaternion().setFromAxisAngle(up, totalAngle * k);
      const rel = startRel.clone().applyQuaternion(q).normalize();
      const d   = distAt(t);

      camera.position.copy( target.clone().add(rel.multiplyScalar(d)) );
      controls.target.copy(target);

      const cd = camera.position.distanceTo(controls.target);
      camera.near = Math.max(0.001, cd/100);
      camera.far  = Math.max(10, cd*100);
      camera.updateProjectionMatrix();
      controls.update();

      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// ============================================================================
// 1) Załaduj model z projektu + obrót X + startowy widok RIGHT
// ============================================================================
export async function loadFromProjectAndRotateX(opts = {}) {
  const cfg = {
    projectRelUrl: "../model/gltf/24388549.gltf",
    onLoading: () => {},
    onLoaded:  () => {},
    ...opts,
  };
  const { sceneRef, cameraRef, controlsRef, modelRef } = resolveRefs(cfg);
  const scene = sceneRef?.current, camera = cameraRef?.current, controls = controlsRef?.current;
  if (!scene || !camera || !controls) { console.warn("[actions] refs not ready (loadFromProjectAndRotateX)"); return; }

  cfg.onLoading(true);
  try {
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
    cfg.onLoaded(root);
  } catch (err) {
    console.error(err);
    alert("Nie udało się wczytać modelu: " + (err?.message || err));
  } finally {
    cfg.onLoading(false);
  }
}

// ============================================================================
// 2) Fokus: etap 1
// ============================================================================
// Pomocnik: uruchom dopiero gdy kamera/kontrolki/model są gotowe
function runWhenReady(doWork, tries = 30, delayMs = 120) {
  const r = window?.Nexus?.refs;
  const camera   = r?.cameraRef?.current;
  const controls = r?.controlsRef?.current;
  const model    = r?.modelRef?.current;
  if (camera && controls && model) { doWork({ camera, controls, model }); return; }
  if (tries <= 0) { console.warn("[actions] stage1: refs not ready"); return; }
  setTimeout(() => runWhenReady(doWork, tries - 1, delayMs), delayMs);
}

export function focusModelFirstStageSmooth(opts = {}) {
  const {
    startFrac = 0.0,            // od 0..1 od początku najdłuższej osi
    regionFrac = 0.14,          // wielkość regionu wzdłuż osi (0.01..1)
    padding = 1.04,             // zapas kadrowania
    leftBiasN = -0.30,          // przesunięcie ekranu X
    raiseN = -0.06,             // przesunięcie ekranu Y
    screenShift = { x: -0.02, y: -0.60 },
    duration = 900,
    forceAxis = "x",            // "x" | "y" | "z" | "auto"
    shrink = 0.55,              // zwężenie w pozostałych osiach
  } = opts || {};

  runWhenReady(({ camera, controls, model }) => {
    // AABB modelu
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    // wybór osi (wymuszona lub najdłuższa)
    let axis = "x", axisSize = size.x;
    if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
    else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
    else {
      if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
      if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
    }

    // odcinek wzdłuż osi
    const s = THREE.MathUtils.clamp(startFrac, 0, 1);
    const rf = THREE.MathUtils.clamp(regionFrac, 0.01, 1);
    const segStart = box.min[axis] + s * axisSize;
    const segEnd   = Math.min(box.max[axis], Math.max(segStart + 1e-6, segStart + rf * axisSize));

    // region ograniczony: zwęż go w pozostałych osiach
    const rMin = box.min.clone();
    const rMax = box.max.clone();
    rMin[axis] = segStart; rMax[axis] = segEnd;

    for (const k of ["x","y","z"]) {
      if (k !== axis) {
        const c    = (box.min[k] + box.max[k]) * 0.5;
        const half = ((box.max[k] - box.min[k]) * 0.5) * shrink;
        rMin[k] = c - half; rMax[k] = c + half;
      }
    }

    const regionBox  = new THREE.Box3(rMin, rMax);
    const regionSize = regionBox.getSize(new THREE.Vector3());
    const regionCtr  = regionBox.getCenter(new THREE.Vector3());

    // odległość kamery, by region się mieścił
    const distance = (function fitDistanceForSize(cam, sz, pad=1.15) {
      const maxSize = Math.max(sz.x, sz.y, sz.z);
      const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      const fitW = fitH / cam.aspect;
      return pad * Math.max(fitH, fitW);
    })(camera, regionSize, padding);

    // przesunięcie w screen-space
    const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
    const viewUp    = camera.up.clone().normalize();
    const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

    const shiftX = (screenShift && screenShift.x !== undefined) ? screenShift.x : leftBiasN;
    const shiftY = (screenShift && screenShift.y !== undefined) ? screenShift.y : raiseN;

    const target = regionCtr.clone()
      .add(viewRight.multiplyScalar(shiftX * regionSize.x))
      .add(viewUp   .multiplyScalar(shiftY * regionSize.y));

    // płynny dolot kamery bez ruszania widocznością modelu
    animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
    console.log("[actions] stage1");
  });
}


// ============================================================================
// 3) Fokus: etap 2
// ============================================================================
export function focusModelSecondStageSmooth(opts = {}) {
  const {
    fraction = 0.72, regionFrac = 0.18, padding = 1.06, duration = 1100,
    align = -0.10, offsetN = { x: 0, y: 0.06, z: 0 }, forceAxis = "x", shrink = 0.90,
  } = opts;

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage2)"); return; }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x", axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else { if (size.y > axisSize) { axis = "y"; axisSize = size.y; } if (size.z > axisSize) { axis = "z"; axisSize = size.z; } }

  const frac = THREE.MathUtils.clamp(fraction, 0, 1);
  const segHalf = 0.5 * THREE.MathUtils.clamp(regionFrac, 0.01, 1) * axisSize;
  const segCenter = box.min[axis] + frac * axisSize;

  const rMin = box.min.clone(), rMax = box.max.clone();
  rMin[axis] = Math.max(box.min[axis], segCenter - segHalf);
  rMax[axis] = Math.min(box.max[axis], segCenter + segHalf);

  ["x","y","z"].forEach(k => {
    if (k !== axis) {
      const c = (box.min[k] + box.max[k]) * 0.5;
      const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
      rMin[k] = c - half; rMax[k] = c + half;
    }
  });

  const regionBox = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr  = regionBox.getCenter(new THREE.Vector3());

  const target = regionCtr.clone();
  target[axis] += align * segHalf;
  target.add(new THREE.Vector3(
    (offsetN.x || 0) * size.x,
    (offsetN.y || 0) * size.y,
    (offsetN.z || 0) * size.z
  ));

  const distance = fitDistanceForSize(camera, regionSize, padding);
  animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
  console.log("[actions] stage2");
}

export const przejscieDoNastepnegoEtapu = focusModelSecondStageSmooth;

// ============================================================================
// 4) Fokus: etap 3
// ============================================================================
export function focusModelThirdStageSmooth(opts = {}) {
  const {
    fraction = 0.82, regionFrac = 0.20, padding = 1.06, duration = 1100,
    align = 0.0, forceAxis = "x", shrink = 0.85,
    offsetN = { x: 0, y: 0, z: 0 }, screenShift = { x: 0.22, y: -0.28 },
  } = opts;

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage3)"); return; }

  const nav = ensureNav();

  // Jeśli wracamy z 4 → 3 i mamy zarejestrowaną trasę 3→4 — odtwórzmy ją wstecz.
  if (nav.prevStage === 4 && nav.t43) {
    const t = nav.t43; // snapshot trasy
    (async () => {
      try {
        // 1) micro-dolot wstecz: finalTarget -> regionCtr (używamy postMs)
        await dollyTo(camera, controls, t.regionCtr, t.distance, t.postMs);

        // 2) orbita w przeciwną stronę (ten sam kąt/czas/keys)
        const keys = [
          { t: 0, d: t.distance },
          { t: Math.max(0.05, Math.min(0.95, t.midAt)), d: t.distance * t.midZoom },
          { t: 1, d: t.distance }
        ];
        await orbitCameraAroundTarget({
          camera, controls, target: t.regionCtr,
          axis: camera.up, totalAngle: THREE.MathUtils.degToRad(t.orbitAngleDeg) * (-t.dirSign),
          duration: t.orbitMs, distanceKeys: keys,
        });

        // 3) micro-dolot wstecz: regionCtr -> pozycja ze stage 3 (używamy preMs)
        await dollyTo(camera, controls, t.fromPose.target, t.fromPose.distance, t.preMs);
      } catch (e) {
        console.warn("[actions] stage3 reverse failed, falling back to normal stage3", e);
        // jeśli coś pójdzie nie tak — wykonaj normalny stage3
        normalStage3();
      }
    })();
    console.log("[actions] stage3 (reverse from 4)");
    return;
  }

  // Normalny stage 3 (gdy przychodzimy z 2 → 3, albo brak snapshota)
  normalStage3();

  function normalStage3() {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    let axis = "x", axisSize = size.x;
    if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
    else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
    else { if (size.y > axisSize) { axis = "y"; axisSize = size.y; } if (size.z > axisSize) { axis = "z"; axisSize = size.z; } }

    const frac = THREE.MathUtils.clamp(fraction, 0, 1);
    const segHalf = 0.5 * THREE.MathUtils.clamp(regionFrac, 0.01, 1) * axisSize;
    const segCtr  = box.min[axis] + frac * axisSize;

    const rMin = box.min.clone(), rMax = box.max.clone();
    rMin[axis] = Math.max(box.min[axis], segCtr - segHalf);
    rMax[axis] = Math.min(box.max[axis], segCtr + segHalf);

    ["x","y","z"].forEach(k => {
      if (k !== axis) {
        const c = (box.min[k] + box.max[k]) * 0.5;
        const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
        rMin[k] = c - half; rMax[k] = c + half;
      }
    });

    const regionBox = new THREE.Box3(rMin, rMax);
    const regionSize = regionBox.getSize(new THREE.Vector3());
    const regionCtr  = regionBox.getCenter(new THREE.Vector3());

    const viewDir = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
    const viewUp  = camera.up.clone().normalize();
    const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

    const target = regionCtr.clone();
    target[axis] += align * segHalf;
    target.add(new THREE.Vector3(
      (offsetN.x || 0) * size.x,
      (offsetN.y || 0) * size.y,
      (offsetN.z || 0) * size.z
    ));
    if (screenShift) {
      target.add(viewRight.multiplyScalar((screenShift.x || 0) * regionSize.x));
      target.add(viewUp   .multiplyScalar((screenShift.y || 0) * regionSize.y));
    }

    const distance = fitDistanceForSize(camera, regionSize, padding);
    animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
    console.log("[actions] stage3");
  }
}

// ============================================================================
// 5) Fokus: etap 4 (orbita + micro-dolot)
// ============================================================================
export async function focusModelFourthStageSmooth(opts = {}) {
  const {
    fraction = 0.82, regionFrac = 0.22, padding = 1.06, shrink = 0.88, forceAxis = "x",
    orbitAngleDeg = 180, orbitDir = "auto", orbitMs = 1100, midAt = 0.40, midZoom = 0.90,
    finalAlign = +0.04, finalScreenShift = { x:-0.22, y:-0.02 }, preMs = 260, postMs = 340,
  } = opts;

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage4)"); return; }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x", axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else { if (size.y > axisSize) { axis = "y"; axisSize = size.y; } if (size.z > axisSize) { axis = "z"; axisSize = size.z; } }

  const frac    = THREE.MathUtils.clamp(fraction, 0, 1);
  const segHalf = 0.5 * THREE.MathUtils.clamp(regionFrac, 0.01, 1) * axisSize;
  const segCtr  = box.min[axis] + frac * axisSize;

  const rMin = box.min.clone(), rMax = box.max.clone();
  rMin[axis] = Math.max(box.min[axis], segCtr - segHalf);
  rMax[axis] = Math.min(box.max[axis], segCtr + segHalf);

  ["x","y","z"].forEach(k => {
    if (k !== axis) {
      const c = (box.min[k] + box.max[k]) * 0.5;
      const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
      rMin[k] = c - half; rMax[k] = c + half;
    }
  });

  const regionBox  = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr  = regionBox.getCenter(new THREE.Vector3());

  // ZAPISZ POZYCJĘ PRZED STAGE 4 (to jest "pose ze stage 3")
  const fromPose = capturePose(camera, controls);

  const distance = fitDistanceForSize(camera, regionSize, padding);
  await dollyTo(camera, controls, regionCtr, distance, preMs);

  let dirSign = 1;
  if (orbitDir === "cw") dirSign = -1;
  else if (orbitDir === "ccw") dirSign = 1;
  else { const rel = camera.position.clone().sub(regionCtr); dirSign = (rel.x >= 0 ? 1 : -1); }

  const keys = [
    { t: 0, d: distance },
    { t: Math.max(0.05, Math.min(0.95, midAt)), d: distance * midZoom },
    { t: 1, d: distance }
  ];

  await orbitCameraAroundTarget({
    camera, controls, target: regionCtr,
    axis: camera.up, totalAngle: THREE.MathUtils.degToRad(orbitAngleDeg) * dirSign,
    duration: orbitMs, distanceKeys: keys,
  });

  const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
  const viewUp    = camera.up.clone().normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

  const finalTarget = regionCtr.clone();
  finalTarget[axis] += finalAlign * segHalf;
  finalTarget.add(viewRight.multiplyScalar((finalScreenShift.x || 0) * regionSize.x));
  finalTarget.add(viewUp   .multiplyScalar((finalScreenShift.y || 0) * regionSize.y));

  await dollyTo(camera, controls, finalTarget, distance, postMs);

  // Zapis trasy do reverse (4 → 3)
  const nav = ensureNav();
  nav.t43 = {
    fromPose,               // gdzie wrócić na końcu
    regionCtr,              // środek orbity
    distance,               // dystans użyty przy dolotach/orbicie
    dirSign,                // kierunek orbity przy 3→4
    orbitAngleDeg, orbitMs, midAt, midZoom,
    preMs, postMs,          // czasy mikro-dolotów
    axis, segHalf, finalScreenShift, finalAlign, // kosmetyka (niekonieczne, ale niech będzie)
  };

  console.log("[actions] stage4");
}


// ============================================================================
// Dodatkowe akcje / aliasy
// ============================================================================
let currentFocusTween = null;

export async function focusStage(n, opts = {}) {
  const nav = ensureNav();
  nav.prevStage = nav.currStage;
  nav.currStage = n;

  if (currentFocusTween) { currentFocusTween.kill?.(); currentFocusTween = null; }
  if (n === 1) currentFocusTween = focusModelFirstStageSmooth(opts);
  if (n === 2) currentFocusTween = focusModelSecondStageSmooth(opts);
  if (n === 3) currentFocusTween = focusModelThirdStageSmooth(opts);
  if (n === 4) currentFocusTween = focusModelFourthStageSmooth(opts);
  console.log("[focusStage]", n)
}


// ============================================================================
// Rejestr globalny (dla C#)
// ============================================================================
// 2) Historia pomiarów – odporna na undefined
function pushMeasureToHistory(item) {
  const s = ensureSummaryStore();
  s.items.push(item);
  // utrzymujmy np. max 20 wpisów (jak chcesz)
  if (s.items.length > 20) s.items.shift();
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
}

// 3) setMeasure – używaj ensureSummaryStore ZAWSZE
export function setMeasure(value, unit = "mm", min = null, max = null, stage = null) {
  const v = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  const m = min == null ? null : Number(min);
  const M = max == null ? null : Number(max);

  window.Nexus ??= {};
  window.Nexus.lastMeasure = { value: v, unit, min: m, max: M, stage, ts: Date.now() };

  // (a) publikacja eventu live
  window.dispatchEvent(new CustomEvent("nexus:measure", {
    detail: { value: v, unit, min: m, max: M, stage }
  }));

  // (b) aktualizacja slotów 1..4
  const s = ensureSummaryStore();
  if (Number.isInteger(stage) && stage >= 1 && stage <= 4) {
    s.slots[stage - 1] = { value: v, unit, min: m, max: M, stage, ts: Date.now() };
    window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
  }

  // (c) historia (odporna)
  pushMeasureToHistory({ value: v, unit, min: m, max: M, stage, ts: Date.now() });

  // (d) debug
  console.log("[setMeasure]", { stage, value: v });
}

export function showSummary() {
  window.dispatchEvent(new Event("nexus:summary:show"));
}
export function hideSummary() {
  window.dispatchEvent(new Event("nexus:summary:hide"));
}
export function clearSummary() {
  window.Nexus ??= {};
  window.Nexus.summary = { items: [] };
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: [] }));
}

// --- akcje wołane z C# (SignalR) ---

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


function fireSummaryUpdate() {
  const s = ensureSummaryStore();
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
}
// 1) Solidna inicjalizacja store
function ensureSummaryStore() {
  window.Nexus ??= {};
  const s = (window.Nexus.summary ??= { slots: [null, null, null, null], items: [], visible: false });
  // sanity checks
  if (!Array.isArray(s.slots) || s.slots.length !== 4) s.slots = [null, null, null, null];
  if (!Array.isArray(s.items)) s.items = [];
  return s;
}
export function markMeasureInvalid() {
  window.dispatchEvent(new Event("nexus:measure:invalid"));
}
export function clearSummarySlot(index) {
  const s = ensureSummaryStore();
  if (index >= 0 && index < 4) s.slots[index] = null;
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: s.slots.slice() }));
}
export function markBack() {
  window.dispatchEvent(new Event('nexus:back'));
}
// --- NAV STATE + helpers ---
function ensureNav() {
  window.Nexus ??= {};
  const nav = (window.Nexus.nav ??= {
    currStage: null,
    prevStage: null,
    t43: null,          // zapis trasy 3→4 do odtworzenia 4→3
  });
  return nav;
}

function capturePose(camera, controls) {
  const pos = camera.position.clone();
  const target = controls.target.clone();
  const up = camera.up.clone();
  const distance = pos.distanceTo(target);
  return { pos, target, up, distance };
}

// ujednolicenie: anim dolotu do targetu na konkretną odległość
async function dollyTo(camera, controls, target, distance, duration) {
  await animateCameraTo({ camera, controls, newTarget: target.clone(), newDistance: distance, duration });
}


// === REJESTRACJA WSZYSTKICH AKCJI ===
// Upewnij się, że rejestr akcje eksportuje ensureSummaryStore pośrednio:
if (typeof window !== "undefined") {
  window.Nexus ??= {};
  window.Nexus.actions = {
    focusModelFirstStageSmooth,
    focusModelSecondStageSmooth,
    focusModelThirdStageSmooth,
    focusModelFourthStageSmooth,
    focusStage,
    setMeasure, showMeasure, hideMeasure, clearMeasure,fireSummaryUpdate,
    clearSummary, showSummary, hideSummary, clearSummarySlot,
    // (opcjonalnie) markBack
  };

  window.dispatchEvent(new Event('nexus:actions:ready'));
  window.Nexus?.send?.('ActionsReady');
  console.log("[Nexus] actions registered:", Object.keys(window.Nexus.actions));
}

