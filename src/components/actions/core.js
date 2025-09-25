// core.js
import * as THREE from "three";

// --- Refs (z opts lub globalne) ---
export function resolveRefs(opts) {
  const g = (typeof window !== "undefined" && window.Nexus && window.Nexus.refs) || {};
  return {
    sceneRef:    opts?.sceneRef    ?? g.sceneRef,
    cameraRef:   opts?.cameraRef   ?? g.cameraRef,
    controlsRef: opts?.controlsRef ?? g.controlsRef,
    modelRef:    opts?.modelRef    ?? g.modelRef,
  };
}

// --- Fit distance ---
export function fitDistanceForSize(camera, sizeVec, padding = 1.15) {
  const maxSize = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
  const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitW = fitH / camera.aspect;
  return padding * Math.max(fitH, fitW);
}

// --- Easing & animacja kamery ---
let __animToken = 0;
export const EASE = (t)=> (t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t);

/**
 * Animacja kamery. Teraz opcjonalnie przyjmuje `newPosition`.
 * Gdy `newPosition` jest podany, pozycja kamery jest interpolo­wana do tej wartości.
 * W przeciwnym wypadku używamy dotychczasowej logiki opartej o `newDistance`.
 */
export function animateCameraTo({ camera, controls, newTarget, newDistance, newPosition, duration = 800 }) {
  const myToken = ++__animToken;
  return new Promise((resolve) => {
    const startTarget = controls.target.clone();
    const startPos    = camera.position.clone();

    const endTarget = newTarget ? newTarget.clone() : startTarget.clone();

    const endPos = newPosition
      ? newPosition.clone()
      : (() => {
          const dir = startPos.clone().sub(startTarget).normalize();
          const dist = newDistance ?? startPos.distanceTo(startTarget);
          return endTarget.clone().add(dir.multiplyScalar(dist));
        })();

    const t0 = performance.now();

    function step(now){
      if (myToken !== __animToken) return resolve();
      const t = Math.min(1, (now - t0) / duration);
      const k = EASE(t);

      controls.target.copy(startTarget).lerp(endTarget, k);
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

export function orbitCameraAroundTarget({
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

// --- Run when ready (refs/model gotowe) ---
export function runWhenReady(doWork, tries = 30, delayMs = 120) {
  const r = window?.Nexus?.refs;
  const camera   = r?.cameraRef?.current;
  const controls = r?.controlsRef?.current;
  const model    = r?.modelRef?.current;
  if (camera && controls && model) { doWork({ camera, controls, model }); return; }
  if (tries <= 0) { console.warn("[actions] refs not ready"); return; }
  setTimeout(() => runWhenReady(doWork, tries - 1, delayMs), delayMs);
}

// --- NAV/state & helpers potrzebne do 3↔4 ---
export function ensureNav() {
  window.Nexus ??= {};
  const nav = (window.Nexus.nav ??= {
    currStage: null,
    prevStage: null,
    t43: null,
  });
  return nav;
}
export function capturePose(camera, controls) {
  const pos = camera.position.clone();
  const target = controls.target.clone();
  const up = camera.up.clone();
  const distance = pos.distanceTo(target);
  return { pos, target, up, distance };
}
export async function dollyTo(camera, controls, target, distance, duration) {
  await animateCameraTo({ camera, controls, newTarget: target.clone(), newDistance: distance, duration });
}
