import * as THREE from "three";
import { resolveRefs, fitDistanceForSize } from "./core";
import { getCanonicalViewAxes, animateCameraToDir } from "./coreEx";
import { getCameraStageOpts } from "../../config/focusProfilesCamera";
import { getArrowStageOpts }  from "../../config/focusProfilesArrow";

export function focusModelSecondStageSmooth(opts = {}) {
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));
  window.dispatchEvent(new Event("nexus:stage:second"));

  const modelKey = window.Nexus?.modelKey || "default";
  const cam = getCameraStageOpts(2, modelKey, opts);
  const hud = getArrowStageOpts (2, modelKey, opts.hud);

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera   = cameraRef?.current;
  const controls = controlsRef?.current;
  const model    = modelRef?.current;
  if (!camera || !controls || !model) {
    console.warn("[actions] refs not ready (stage2)");
    return;
  }

  // --- region ---
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x", axisSize = size.x;
  if (cam.forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (cam.forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else {
    if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
    if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
  }

  const fraction   = cam.fraction   ?? 0.72;
  const regionFrac = cam.regionFrac ?? 0.18;
  const shrink     = cam.shrink     ?? 0.90;

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

  // --- target + przemieszczenie w stałej ramie odniesienia ---
  const padding = cam.padding ?? 1.06;
  const duration = cam.duration ?? 1100;
  const align = cam.align ?? -0.10;
  const offsetN = cam.offsetN ?? { x: 0, y: 0.06, z: 0 };

  const target = regionCtr.clone();
  target[axis] += align * segHalf;
  target.add(new THREE.Vector3(
    (offsetN.x || 0) * size.x,
    (offsetN.y || 0) * size.y,
    (offsetN.z || 0) * size.z
  ));

  const distance = fitDistanceForSize(camera, regionSize, padding);

  // użyj kanonicznego kierunku widoku
  const { view: canonicalView, up: canonicalUp } = getCanonicalViewAxes();
  animateCameraToDir({
    camera, controls,
    newTarget: target,
    newDistance: distance,
    viewDir: canonicalView,
    duration
  });

  // --- HUD względem stałego up (kanoniczny) ---
  const up = canonicalUp;
  const bottomMid = regionCtr.clone().add(up.clone().multiplyScalar(-0.5 * regionSize.y));
  const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
  const tip = bottomMid.clone().add(up.clone().multiplyScalar(-gap));

  window.dispatchEvent(new CustomEvent("nexus:arrowhud:show", {
    detail: {
      mode: "world",
      world: { x: tip.x, y: tip.y, z: tip.z },
      text: hud.text ?? "Zmierz szerokość drugiego zacisku",
      arrowSize: hud.arrowSize ?? 130,
      labelFontSize: hud.labelFontSize ?? 24,
      labelSide: hud.labelSide ?? "bottom",
      gapPx: hud.gapPx ?? 14,
      offsetPx: hud.offsetPx ?? { x: -20, y: -600 },
    }
  }));

  console.log(`[actions] stage2 + HUD (modelKey=${modelKey})`);
}
