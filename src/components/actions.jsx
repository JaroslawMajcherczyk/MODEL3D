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
    projectRelUrl: "../model/gltf/24388549_asm.gltf",
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
export function focusModelFirstStageSmooth(opts = {}) {
  const {
    startFrac = 0.0, regionFrac = 0.14, padding = 1.04,
    leftBiasN = -0.30, raiseN = -0.06, screenShift = { x: -0.02, y: -0.60 },
    duration = 900, forceAxis = "x", shrink = 0.55,
  } = opts;

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage1)"); return; }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x", axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else { if (size.y > axisSize) { axis = "y"; axisSize = size.y; } if (size.z > axisSize) { axis = "z"; axisSize = size.z; } }

  const segStart = box.min[axis] + THREE.MathUtils.clamp(startFrac, 0, 1) * axisSize;
  const segLen   = THREE.MathUtils.clamp(regionFrac, 0.01, 1) * axisSize;
  const segEnd   = Math.max(segStart, Math.min(box.max[axis], segStart + segLen));

  const rMin = box.min.clone(), rMax = box.max.clone();
  rMin[axis] = segStart; rMax[axis] = segEnd;

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

  const distance = fitDistanceForSize(camera, regionSize, padding);

  const viewDir = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
  const viewUp  = camera.up.clone().normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

  const shiftX = (screenShift?.x !== undefined ? screenShift.x : leftBiasN);
  const shiftY = (screenShift?.y !== undefined ? screenShift.y : raiseN);

  const target = regionCtr.clone()
    .add(viewRight.multiplyScalar(shiftX * regionSize.x))
    .add(viewUp.multiplyScalar(shiftY * regionSize.y));

  animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
  console.log("[actions] stage1");
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

  const distance = fitDistanceForSize(camera, regionSize, padding);
  await animateCameraTo({ camera, controls, newTarget: regionCtr, newDistance: distance, duration: preMs });

  let dirSign = 1;
  if (orbitDir === "cw") dirSign = -1;
  else if (orbitDir === "ccw") dirSign = 1;
  else { const rel = camera.position.clone().sub(regionCtr); dirSign = (rel.x >= 0 ? 1 : -1); }

  const keys = [
    { t: 0,                                   d: distance },
    { t: Math.max(0.05, Math.min(0.95, midAt)), d: distance * midZoom },
    { t: 1,                                   d: distance }
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

  await animateCameraTo({ camera, controls, newTarget: finalTarget, newDistance: distance, duration: postMs });
  console.log("[actions] stage4");
}

// ============================================================================
// Dodatkowe akcje / aliasy
// ============================================================================
export function focusStage(n, opts = {}) {
  if (n === 1) return focusModelFirstStageSmooth(opts);
  if (n === 2) return focusModelSecondStageSmooth(opts);
  if (n === 3) return focusModelThirdStageSmooth(opts);
  if (n === 4) return focusModelFourthStageSmooth(opts);
  console.warn("[actions] focusStage: unknown stage", n);
}


// ============================================================================
// Rejestr globalny (dla C#)
// ============================================================================
// --- helper: historia 4 pomiarów ---
function pushMeasureToHistory(item) {
  window.Nexus ??= {};
  const store = (window.Nexus.summary ??= { items: [] });
  store.items.push(item);
  if (store.items.length > 4) store.items.shift();
  window.dispatchEvent(new CustomEvent("nexus:summary:update", { detail: store.items }));
}

// --- akcje wywoływane z C# (SignalR) ---
export function setMeasure(value, unit = "mm", min = null, max = null, stage = null) {
  const v = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  const m = min == null ? null : Number(min);
  const M = max == null ? null : Number(max);

  window.Nexus ??= {};
  window.Nexus.lastMeasure = { value: v, unit, min: m, max: M, stage, ts: Date.now() };
  window.dispatchEvent(new CustomEvent("nexus:measure", {
    detail: { value: v, unit, min: m, max: M, stage }
  }));

  // do paska podsumowania
  pushMeasureToHistory({ value: v, unit, min: m, max: M, stage, ts: Date.now() });
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

// === REJESTRACJA WSZYSTKICH AKCJI ===
if (typeof window !== "undefined") {
  window.Nexus ??= {};
  window.Nexus.actions = {
    // już istniejące:
    focusModelFirstStageSmooth,
    focusModelSecondStageSmooth,
    focusModelThirdStageSmooth,
    focusModelFourthStageSmooth,
    focusStage,
    // nowe / ważne dla podsumowania:
    setMeasure,
    showSummary,
    hideSummary,
    clearSummary,
  };
  console.log("[Nexus] actions registered:", Object.keys(window.Nexus.actions));
}
