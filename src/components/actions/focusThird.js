// src/components/actions/focusThird.js
import * as THREE from "three";
import {
  resolveRefs, ensureNav, fitDistanceForSize, dollyTo,
  orbitCameraAroundTarget, capturePose
} from "./core";
import { getCanonicalViewAxes, animateCameraToDir } from "./coreEx";
import { getCameraStageOpts } from "../../config/focusProfilesCamera";
import { getArrowStageOpts }  from "../../config/focusProfilesArrow";

export function focusModelThirdStageSmooth(opts = {}) {
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));
  window.dispatchEvent(new Event("nexus:stage:third"));

  const modelKey = window.Nexus?.modelKey || "default";
  const cam = getCameraStageOpts(3, modelKey, opts);
  const hud = getArrowStageOpts (3, modelKey, opts.hud);

  const {
    fraction   = 0.82,
    regionFrac = 0.20,
    padding    = 1.06,
    duration   = 1100,
    align      = 0.0,
    forceAxis  = "x",
    shrink     = 0.85,
    offsetN    = { x: 0, y: 0, z: 0 },
    screenShift = { x: 0.22, y: -0.28 },
  } = cam;

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage3)"); return; }

  const nav = ensureNav();
  nav.prevStage = nav.currStage;
  nav.currStage = 3;

  function computeRegion() {
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
    const segCtr  = box.min[axis] + frac * axisSize;

    const rMin = box.min.clone(), rMax = box.max.clone();
    rMin[axis] = Math.max(box.min[axis], segCtr - segHalf);
    rMax[axis] = Math.min(box.max[axis], segCtr + segHalf);

    ["x","y","z"].forEach(k => {
      if (k !== axis) {
        const c = (box.min[k] + box.max[k]) * 0.5;
        const half = (box.max[k] - box.min[k]) * 0.5 * (shrink ?? 0.85);
        rMin[k] = c - half; rMax[k] = c + half;
      }
    });

    const regionBox = new THREE.Box3(rMin, rMax);
    const regionSize = regionBox.getSize(new THREE.Vector3());
    const regionCtr  = regionBox.getCenter(new THREE.Vector3());
    return { regionBox, regionSize, regionCtr, axis, segHalf, size };
  }

  const { view: canonicalView, up: canonicalUp, right: canonicalRight } = getCanonicalViewAxes();

  function goToRegion({ regionSize, regionCtr, axis, segHalf, size }) {
    const target = regionCtr.clone();
    target[axis] += (align ?? 0) * segHalf;
    target.add(new THREE.Vector3(
      (offsetN?.x || 0) * size.x,
      (offsetN?.y || 0) * size.y,
      (offsetN?.z || 0) * size.z
    ));
    if (screenShift) {
      target.add(canonicalRight.clone().multiplyScalar((screenShift.x || 0) * regionSize.x));
      target.add(canonicalUp.clone()   .multiplyScalar((screenShift.y || 0) * regionSize.y));
    }

    const distance = fitDistanceForSize(camera, regionSize, padding);
    return animateCameraToDir({
      camera, controls,
      newTarget: target,
      newDistance: distance,
      viewDir: canonicalView,
      duration: (duration ?? 1100)
    });
  }

  function showHud(regionSize, regionCtr) {
    const up = canonicalUp;
    const bottomMid = regionCtr.clone().add(up.clone().multiplyScalar(-0.5 * regionSize.y));
    const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
    const tip = bottomMid.clone().add(up.clone().multiplyScalar(-gap));

    window.dispatchEvent(new CustomEvent("nexus:arrowhud:show", {
      detail: {
        mode: "world",
        world: { x: tip.x, y: tip.y, z: tip.z },
        text: (hud?.text ?? "Zmierz szerokość trzeciego zacisku"),
        arrowSize: (hud?.arrowSize ?? 130),
        labelFontSize: (hud?.labelFontSize ?? 24),
        labelSide: (hud?.labelSide ?? "bottom"),
        gapPx: (hud?.gapPx ?? 14),
        offsetPx: (hud?.offsetPx ?? { x: 140, y: 220 }),
      }
    }));
  }

  // reverse 4→3
  if (nav.prevStage === 4 && nav.t43) {
    const t = nav.t43;
    (async () => {
      try {
        await dollyTo(camera, controls, t.regionCtr, t.distance, t.postMs);
        const keys = [
          { t: 0, d: t.distance },
          { t: Math.max(0.05, Math.min(0.95, t.midAt)), d: t.distance * t.midZoom },
          { t: 1, d: t.distance }
        ];
        await orbitCameraAroundTarget({
          camera, controls, target: t.regionCtr,
          axis: camera.up,
          totalAngle: THREE.MathUtils.degToRad(t.orbitAngleDeg) * (-t.dirSign),
          duration: t.orbitMs, distanceKeys: keys,
        });
        await dollyTo(camera, controls, t.fromPose.target, t.fromPose.distance, t.preMs);

        const reg2 = computeRegion();
        await goToRegion(reg2);
        showHud(reg2.regionSize, reg2.regionCtr);

        // snap po Stage 3 (po reverse), do wejścia 3→4
        const dist2 = fitDistanceForSize(camera, reg2.regionSize, padding);
        const fromPose2 = capturePose(camera, controls);
        nav.t34 = {
          fromPose: fromPose2,
          regionCtr: reg2.regionCtr,
          distance: dist2,
          axis: reg2.axis,
          segHalf: reg2.segHalf
        };
      } catch (e) {
        console.warn("[actions] stage3 reverse failed, fallback to normal", e);
        const reg = computeRegion();
        await goToRegion(reg);
        showHud(reg.regionSize, reg.regionCtr);

        // snap po Stage 3 (fallback)
        const dist = fitDistanceForSize(camera, reg.regionSize, padding);
        const fromPose = capturePose(camera, controls);
        nav.t34 = { fromPose, regionCtr: reg.regionCtr, distance: dist, axis: reg.axis, segHalf: reg.segHalf };
      }
    })();
    console.log(`[actions] stage3 (reverse from 4, modelKey=${modelKey})`);
    return;
  }

  // normalny etap 3
  const reg = computeRegion();
  goToRegion(reg).then(() => {
    showHud(reg.regionSize, reg.regionCtr);

    // ⬇ SNAP po Stage 3 — do płynnego wejścia w Stage 4
    const distance = fitDistanceForSize(camera, reg.regionSize, padding);
    const fromPose = capturePose(camera, controls);
    nav.t34 = {
      fromPose,
      regionCtr: reg.regionCtr,
      distance,
      axis: reg.axis,
      segHalf: reg.segHalf
    };
  });

  console.log(`[actions] stage3 + HUD (modelKey=${modelKey})`);
}
