// src/components/actions/focusFourth.js
import * as THREE from "three";
import {
  resolveRefs, ensureNav, fitDistanceForSize, dollyTo,
  orbitCameraAroundTarget, capturePose
} from "./core";

export async function focusModelFourthStageSmooth(opts = {}) {
  const {
    // --- region/orbita ---
    fraction = 0.82, regionFrac = 0.22, padding = 1.06, shrink = 0.88, forceAxis = "x",
    orbitAngleDeg = 180, orbitDir = "auto", orbitMs = 1100, midAt = 0.40, midZoom = 0.90,
    finalAlign = +0.04, finalScreenShift = { x:-0.22, y:-0.02 }, preMs = 260, postMs = 340,

    // --- HUD strzałka/napis dla etapu 4 ---
    hudText = "Zmierz szerokość czwartego zacisku",
    hudArrowSize = 140,
    hudLabelFontSize = 26,
    hudLabelSide = "bottom",
    hudGapPx = 14,
    hudOffsetPx = { x: -400, y: -220 },
  } = opts;

  // schowaj poprzedni HUD
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage4)"); return; }

  // stan nawigacji
  const nav = ensureNav();
  nav.prevStage = nav.currStage;
  nav.currStage = 4;

  // --- region ---
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

  // snapshot pozycji „przed wejściem w 4”
  const fromPose = capturePose(camera, controls);

  // micro-dolot
  const distance = fitDistanceForSize(camera, regionSize, padding);
  await dollyTo(camera, controls, regionCtr, distance, preMs);

  // kierunek orbity
  let dirSign = 1;
  if (orbitDir === "cw") dirSign = -1;
  else if (orbitDir === "ccw") dirSign = 1;
  else { const rel = camera.position.clone().sub(regionCtr); dirSign = (rel.x >= 0 ? 1 : -1); }

  // orbita z „oddechem”
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

  // finalny micro-dolot
  const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
  const viewUp    = camera.up.clone().normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

  const finalTarget = regionCtr.clone();
  finalTarget[axis] += finalAlign * segHalf;
  finalTarget.add(viewRight.multiplyScalar((finalScreenShift.x || 0) * regionSize.x));
  finalTarget.add(viewUp   .multiplyScalar((finalScreenShift.y || 0) * regionSize.y));
  await dollyTo(camera, controls, finalTarget, distance, postMs);

  // HUD
  const up = camera.up.clone().normalize();
  const bottomMid = regionCtr.clone().add(up.clone().multiplyScalar(-0.5 * regionSize.y));
  const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
  const tip = bottomMid.clone().add(up.clone().multiplyScalar(-gap));

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

  // zapis trasy do reverse 4 → 3 (UWAGA: używamy TEGO SAMEGO `nav`)
  nav.t43 = {
    fromPose,
    regionCtr,
    distance,
    dirSign,
    orbitAngleDeg, orbitMs, midAt, midZoom,
    preMs, postMs,
    axis, segHalf, finalScreenShift, finalAlign,
  };

  console.log("[actions] stage4 + HUD (snapshot saved for reverse 4→3)");
}
