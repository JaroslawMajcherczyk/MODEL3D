import * as THREE from "three";
import {
  resolveRefs, ensureNav, animateCameraTo,
  orbitCameraAroundTarget, dollyTo
} from "./core";

export function focusModelThirdStageSmooth(opts = {}) {
  const {
    // --- wybór wycinka / kamera ---
    fraction = 0.82, regionFrac = 0.20, padding = 1.06, duration = 1100,
    align = 0.0, forceAxis = "x", shrink = 0.85,
    offsetN = { x: 0, y: 0, z: 0 }, screenShift = { x: 0.22, y: -0.28 },

    // --- HUD strzałka/napis ---
    hudText = "Zmierz szerokość trzeciego zacisku",
    hudArrowSize = 130,
    hudLabelFontSize = 24,
    hudLabelSide = "bottom",
    hudGapPx = 14,
    hudOffsetPx = { x: 140, y: 220 },
  } = opts;

  // schowaj HUD z poprzedniego etapu
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));

  const { cameraRef, controlsRef, modelRef } = resolveRefs(opts);
  const camera = cameraRef?.current, controls = controlsRef?.current, model = modelRef?.current;
  if (!camera || !controls || !model) { console.warn("[actions] refs not ready (stage3)"); return; }

  // aktualizacja stanu nawigacji (ważne dla reverse 4→3)
  const nav = ensureNav();
  nav.prevStage = nav.currStage;
  nav.currStage = 3;

  // helper: policz region i (opcjonalnie) zaktualizuj kamerę
  function computeRegionAndMaybeFly(updateCamera = true) {
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

    if (updateCamera) {
      const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
      const viewUp    = camera.up.clone().normalize();
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

      const max = Math.max(regionSize.x, regionSize.y, regionSize.z);
      const fitH = max / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      const fitW = fitH / camera.aspect;
      const distance = padding * Math.max(fitH, fitW);

      animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
    }

    return { regionBox, regionSize, regionCtr };
  }

  // helper: pokaż HUD strzałkę dla regionu (bez zmiany kamery)
  function showHud(regionSize, regionCtr) {
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
  }

  // reverse 4 → 3 (jeśli mamy snapshot)
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

        // po cofnięciu: policz region dla etapu 3 i pokaż HUD (bez dodatkowego ruchu kamery)
        const { regionSize, regionCtr } = computeRegionAndMaybeFly(false);
        showHud(regionSize, regionCtr);
      } catch (e) {
        console.warn("[actions] stage3 reverse failed, fallback to normal", e);
        const { regionSize, regionCtr } = computeRegionAndMaybeFly(true);
        showHud(regionSize, regionCtr);
      }
    })();
    console.log("[actions] stage3 (reverse from 4)");
    return;
  }

  // normalny etap 3
  const { regionSize, regionCtr } = computeRegionAndMaybeFly(true);
  showHud(regionSize, regionCtr);
  console.log("[actions] stage3 + HUD");
}
