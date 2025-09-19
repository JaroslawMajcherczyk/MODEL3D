// src/components/actions/focusFirst.js
import * as THREE from "three";
import { runWhenReady, animateCameraTo } from "./core";
import { getCameraStageOpts } from "../../config/focusProfilesCamera";
import { getArrowStageOpts }  from "../../config/focusProfilesArrow";

export function focusModelFirstStageSmooth(opts = {}) {
  // czyść HUD z poprzedniego etapu
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));
  window.dispatchEvent(new Event("nexus:stage:first"));

  // wybór profilu na podstawie aktualnego modelu
  const modelKey = window.Nexus?.modelKey || "default";
  const cam = getCameraStageOpts(1, modelKey, opts);     // profil kamery dla Stage 1 (+ ewentualne nadpisania z opts)
  const hud = getArrowStageOpts (1, modelKey, opts.hud); // profil HUD dla Stage 1 (+ ewentualne nadpisania z opts.hud)

  runWhenReady(async ({ camera, controls, model }) => {
    // 1) Region pod kamerę
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    // dominująca oś (z możliwością wymuszenia)
    let axis = "x", axisSize = size.x;
    if (cam.forceAxis === "y") { axis = "y"; axisSize = size.y; }
    else if (cam.forceAxis === "z") { axis = "z"; axisSize = size.z; }
    else {
      if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
      if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
    }

    const s  = THREE.MathUtils.clamp(cam.startFrac ?? 0, 0, 1);
    const rf = THREE.MathUtils.clamp(cam.regionFrac ?? 0.14, 0.01, 1);
    const segStart = box.min[axis] + s * axisSize;
    const segEnd   = Math.min(box.max[axis], Math.max(segStart + 1e-6, segStart + rf * axisSize));

    const rMin = box.min.clone(), rMax = box.max.clone();
    rMin[axis] = segStart; rMax[axis] = segEnd;

    // „ściśnij” w osiach poprzecznych
    const shrink = cam.shrink ?? 0.55;
    for (const k of ["x","y","z"]) {
      if (k !== axis) {
        const c = (box.min[k] + box.max[k]) * 0.5;
        const half = ((box.max[k] - box.min[k]) * 0.5) * shrink;
        rMin[k] = c - half; rMax[k] = c + half;
      }
    }

    const regionBox  = new THREE.Box3(rMin, rMax);
    const regionSize = regionBox.getSize(new THREE.Vector3());
    const regionCtr  = regionBox.getCenter(new THREE.Vector3());

    // 2) Target kamery z lekkim shiftem w ekranie
    const fitDist = (camObj, sz, pad=1.15) => {
      const maxSize = Math.max(sz.x, sz.y, sz.z);
      const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camObj.fov) / 2));
      const fitW = fitH / camObj.aspect;
      return (pad ?? 1.15) * Math.max(fitH, fitW);
    };
    const distance = fitDist(camera, regionSize, cam.padding ?? 1.04);

    const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
    const viewUp    = camera.up.clone().normalize();
    const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

    const shiftX = (cam.screenShift?.x ?? cam.leftBiasN ?? -0.30);
    const shiftY = (cam.screenShift?.y ?? cam.raiseN    ?? -0.06);

    const target = regionCtr.clone()
      .add(viewRight.multiplyScalar(shiftX * regionSize.x))
      .add(viewUp   .multiplyScalar(shiftY * regionSize.y));

    await animateCameraTo({
      camera,
      controls,
      newTarget: target,
      newDistance: distance,
      duration: cam.duration ?? 900
    });

    // 3) Punkt kotwiczenia HUD – „pod” regionem w kierunku up kamery
    const up = camera.up.clone().normalize();
    const bottomMid = regionCtr.clone().add(up.clone().multiplyScalar(-0.5 * regionSize.y));
    const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
    const tip = bottomMid.clone().add(up.clone().multiplyScalar(-gap));

    // 4) HUD: strzałka + label według profilu
    window.dispatchEvent(new CustomEvent("nexus:arrowhud:show", {
      detail: {
        mode: "world",
        world: { x: tip.x, y: tip.y, z: tip.z },
        text: hud.text ?? "Zmierz szerokość pierwszego zacisku",
        arrowSize: hud.arrowSize ?? 130,
        labelFontSize: hud.labelFontSize ?? 24,
        labelSide: hud.labelSide ?? "bottom",
        gapPx: hud.gapPx ?? 14,
        offsetPx: hud.offsetPx ?? { x: -45, y: 420 },
      }
    }));

    console.log(`[stage1] HUD arrow shown (modelKey=${modelKey})`);
  });
}
