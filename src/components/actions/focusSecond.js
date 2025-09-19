// src/components/actions/focusSecond.js
import * as THREE from "three";
import { resolveRefs, fitDistanceForSize, animateCameraTo } from "./core";

export function focusModelSecondStageSmooth(opts = {}) {
  const {
    // --- wybór wycinka ---
    fraction = 0.72,
    regionFrac = 0.18,
    forceAxis = "x",
    shrink = 0.90,

    // --- dolot kamery ---
    padding = 1.06,
    duration = 1100,
    align = -0.10,
    offsetN = { x: 0, y: 0.06, z: 0 },

    // --- HUD strzałka/napis (możesz nadpisywać przy wywołaniu) ---
    hudText = "Zmierz szerokość drugiego zacisku",
    hudArrowSize = 130,
    hudLabelFontSize = 24,
    hudLabelSide = "bottom",         // "bottom" = napis POD strzałką
    hudGapPx = 14,
    hudOffsetPx = { x: -20, y: -600 }, // +y = niżej na ekranie, +x = w prawo
  } = opts;

  // najpierw schowaj ewentualną strzałkę z poprzedniego etapu
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera   = cameraRef?.current;
  const controls = controlsRef?.current;
  const model    = modelRef?.current;
  if (!camera || !controls || !model) {
    console.warn("[actions] refs not ready (stage2)");
    return;
  }

  // --- wyznacz region dla etapu 2 ---
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x", axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else {
    if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
    if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
  }

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

  const regionBox  = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr  = regionBox.getCenter(new THREE.Vector3());

  // docelowy target (jak dotąd)
  const target = regionCtr.clone();
  target[axis] += align * segHalf;
  target.add(new THREE.Vector3(
    (offsetN.x || 0) * size.x,
    (offsetN.y || 0) * size.y,
    (offsetN.z || 0) * size.z
  ));

  const distance = fitDistanceForSize(camera, regionSize, padding);
  animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });

  // --- pozycja HUD-a: „pod” wycinkiem (podobnie jak w etapie 1, ale możesz łatwo zmienić offsety)
  const up = camera.up.clone().normalize();
  const bottomMid = regionCtr.clone().add(up.clone().multiplyScalar(-0.5 * regionSize.y));
  const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
  const tip = bottomMid.clone().add(up.clone().multiplyScalar(-gap));

  // pokaż NOWĄ strzałkę HUD dla etapu 2
  window.dispatchEvent(new CustomEvent("nexus:arrowhud:show", {
    detail: {
      mode: "world",
      world: { x: tip.x, y: tip.y, z: tip.z },
      text: hudText,
      arrowSize: hudArrowSize,
      labelFontSize: hudLabelFontSize,
      labelSide: hudLabelSide,
      gapPx: hudGapPx,
      offsetPx: hudOffsetPx,
    }
  }));

  console.log("[actions] stage2 + HUD");
}
