import * as THREE from "three";
import { runWhenReady, fitDistanceForSize } from "./core";
import { getCanonicalViewAxes, animateCameraToDir } from "./coreEx";
import { getCameraStageOpts } from "../../config/focusProfilesCamera";
import { getArrowStageOpts }  from "../../config/focusProfilesArrow";

export function focusModelFirstStageSmooth(opts = {}) {
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));
  window.dispatchEvent(new Event("nexus:stage:first"));

  const modelKey = window.Nexus?.modelKey || "default";
  const cam = getCameraStageOpts(1, modelKey, opts);
  const hud = getArrowStageOpts (1, modelKey, opts.hud);

  // czy używać stałych (kanonicznych) osi do przesunięć celu
  const useWorldFrame = cam.useWorldFrame ?? true;

  runWhenReady(async ({ camera, controls, model }) => {
    // --- region ---
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

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

    // --- target + dystans ---
    const distance = fitDistanceForSize(camera, regionSize, cam.padding ?? 1.04);

    const shiftX = (cam.screenShift?.x ?? cam.leftBiasN ?? -0.30);
    const shiftY = (cam.screenShift?.y ?? cam.raiseN    ?? -0.06);

    // wektory do przesunięć
    let rightVec, upVec;
    if (useWorldFrame) {
      // z kanonicznej bazy (stałe osie względem sceny)
      const { right, up } = getCanonicalViewAxes();
      rightVec = right; upVec = up;
    } else {
      // bieżące osie kamery (legacy)
      const viewDir = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
      const viewUp  = camera.up.clone().normalize();
      rightVec = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();
      upVec    = viewUp;
    }

    const target = regionCtr.clone()
      .add(rightVec.clone().multiplyScalar(shiftX * regionSize.x))
      .add(upVec.clone()   .multiplyScalar(shiftY * regionSize.y));

    // kierunek widoku – kanoniczny (niezależny od tego, jak user obrócił kamerę)
    const { view: canonicalView } = getCanonicalViewAxes();
    await animateCameraToDir({
      camera,
      controls,
      newTarget: target,
      newDistance: distance,
      viewDir: canonicalView,
      duration: cam.duration ?? 900
    });

    // --- HUD (użyj up ze świata/kanoniczny, aby overlay był stabilny) ---
    const upForHud = getCanonicalViewAxes().up; // stabilny „up”
    const bottomMid = regionCtr.clone().add(upForHud.clone().multiplyScalar(-0.5 * regionSize.y));
    const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
    const tip = bottomMid.clone().add(upForHud.clone().multiplyScalar(-gap));

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

    console.log(`[stage1] HUD (modelKey=${modelKey}, worldFrame=${useWorldFrame})`);
  });
}
