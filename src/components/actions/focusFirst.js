// src/components/actions/focusFirst.js
import * as THREE from "three";
import { runWhenReady, animateCameraTo } from "./core";

export function focusModelFirstStageSmooth(opts = {}) {
  // schowaj ewentualne HUD-y z poprzednich etapów
  window.dispatchEvent(new Event("nexus:arrowhud:hide"));
  window.dispatchEvent(new Event("nexus:stage:first"));

  const {
    startFrac = 0.0,       // początek wycinka wzdłuż osi dominującej
    regionFrac = 0.14,     // długość wycinka (0..1)
    padding = 1.04,        // margines przy dopasowaniu kamery
    leftBiasN = -0.30,     // przesunięcie celu w prawo/lewo (w jednostkach rozmiaru regionu w osi X ekranu)
    raiseN = -0.06,        // przesunięcie celu w górę/dół (w jednostkach rozmiaru regionu w osi Y ekranu)
    screenShift = { x: -0.02, y: -0.60 }, // dodatkowy shift ekranu
    duration = 900,        // czas dolotu
    forceAxis = "x",       // jeśli chcesz nadpisać oś dominującą
    shrink = 0.55,         // „ściśnięcie” regionu w osiach poprzecznych
  } = opts || {};

  runWhenReady(async ({ camera, controls, model }) => {
    // 1) Wyznacz box regionu
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    // dominująca oś
    let axis = "x", axisSize = size.x;
    if (forceAxis === "y")      { axis = "y"; axisSize = size.y; }
    else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
    else {
      if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
      if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
    }

    const s  = THREE.MathUtils.clamp(startFrac, 0, 1);
    const rf = THREE.MathUtils.clamp(regionFrac, 0.01, 1);
    const segStart = box.min[axis] + s * axisSize;
    const segEnd   = Math.min(box.max[axis], Math.max(segStart + 1e-6, segStart + rf * axisSize));

    const rMin = box.min.clone(), rMax = box.max.clone();
    rMin[axis] = segStart; rMax[axis] = segEnd;

    // „ściśnij” w osiach poprzecznych, żeby skupić się na wycinku
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

    // 2) Ustal docelowy target kamery z lekkim shiftem w ekranie
    const fitDist = (cam, sz, pad=1.15) => {
      const maxSize = Math.max(sz.x, sz.y, sz.z);
      const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      const fitW = fitH / cam.aspect;
      return pad * Math.max(fitH, fitW);
    };
    const distance = fitDist(camera, regionSize, padding);

    const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
    const viewUp    = camera.up.clone().normalize();
    const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

    const shiftX = (screenShift?.x ?? leftBiasN);
    const shiftY = (screenShift?.y ?? raiseN);

    const target = regionCtr.clone()
      .add(viewRight.multiplyScalar(shiftX * regionSize.x))
      .add(viewUp   .multiplyScalar(shiftY * regionSize.y));

    await animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });

    // 3) Punkt kotwiczenia HUD-strzałki – „pod” jasnoszarym elementem
    const up = camera.up.clone().normalize();
    const bottomMid = regionCtr.clone().add(up.clone().multiplyScalar(-0.5 * regionSize.y));
    const gap = Math.max(regionSize.x, regionSize.y, regionSize.z) * 0.04;
    const tip = bottomMid.clone().add(up.clone().multiplyScalar(-gap));

    // 4) Pokaż zieloną strzałkę HUD przy elemencie + etykietę
  window.dispatchEvent(new CustomEvent("nexus:arrowhud:show", {
  detail: {
    mode: "world",
    world: { x: tip.x, y: tip.y, z: tip.z },
    text: "Zmierz szerokość pierwszego zacisku",
    arrowSize: 130,
    labelFontSize: 24,
    labelSide: "bottom",         // napis pod strzałką
    gapPx: 14,
    offsetPx: { x: -45, y: 420 },  // na ekranie: +y = niżej, +x = w prawo
  }
}));

    console.log("[stage1] HUD arrow shown");
  });
}
