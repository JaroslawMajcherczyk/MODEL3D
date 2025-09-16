// src/components/actions.jsx
import * as THREE from "three";
import { disposeObject, loadGltfFromUrl } from "./threeUtils";
import { rotateX90, setViewRight } from "./viewOps";

/* ============================================================================
 * 1) Załaduj model z projektu + obrót X + startowy widok RIGHT
 * ==========================================================================*/
export async function loadFromProjectAndRotateX({
  sceneRef,
  cameraRef,
  controlsRef,
  modelRef,
  projectRelUrl = "../model/gltf/24388549_asm.gltf",
  onLoading = () => {},
  onLoaded = () => {},
}) {
  const scene = sceneRef.current;
  if (!scene) return;

  onLoading(true);
  try {
    if (modelRef.current) {
      scene.remove(modelRef.current);
      disposeObject(modelRef.current);
      modelRef.current = null;
    }

    const modelUrl = new URL(projectRelUrl, import.meta.url).href;
    const root = await loadGltfFromUrl(modelUrl);

    rotateX90(root);
    modelRef.current = root;
    scene.add(root);

    setViewRight(cameraRef.current, controlsRef.current, root);
    onLoaded(root);
  } catch (err) {
    console.error(err);
    alert("Nie udało się wczytać modelu: " + (err?.message || err));
  } finally {
    onLoading(false);
  }
}

/* ============================================================================
 * Wspólne helpery (używane przez wszystkie akcje – brak duplikatów!)
 * ==========================================================================*/

/** Easing S-curve */
// function easeInOutQuad(t) {
//   return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
// }

/** Odległość kamery potrzebna, żeby `sizeVec` zmieścił się w kadrze */
function fitDistanceForSize(camera, sizeVec, padding = 1.15) {
  const maxSize = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
  const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitW = fitH / camera.aspect;
  return padding * Math.max(fitH, fitW);
}

/** Płynna animacja kamery do (target, distance) z zachowaniem kierunku patrzenia */
// function animateCameraTo({ camera, controls, newTarget, newDistance, duration = 1000 }) {
//   const startTarget = controls.target.clone();
//   const startPos = camera.position.clone();

//   const dir = startPos.clone().sub(startTarget).normalize(); // utrzymaj kierunek
//   const endPos = newTarget.clone().add(dir.multiplyScalar(newDistance));

//   const startTime = performance.now();

//   function step(now) {
//     const t = Math.min(1, (now - startTime) / duration);
//     const k = easeInOutQuad(t);

//     controls.target.copy(startTarget).lerp(newTarget, k);
//     camera.position.copy(startPos).lerp(endPos, k);

//     const dist = camera.position.distanceTo(controls.target);
//     camera.near = Math.max(0.001, dist / 100);
//     camera.far = Math.max(10, dist * 100);
//     camera.updateProjectionMatrix();
//     controls.update();

//     if (t < 1) requestAnimationFrame(step);
//   }
//   requestAnimationFrame(step);
// }

/* ============================================================================
 * 2) Fokus: POCZĄTEK modelu (bardzo blisko, lewo/dół jak ustalaliśmy)
 * ==========================================================================*/
 export function focusModelFirstStageSmooth({
  cameraRef,
  controlsRef,
  modelRef,

  // region zakotwiczony na początku najdłuższej osi
  startFrac = 0.0,
  regionFrac = 0.14,
  padding = 1.04,

  // przesunięcie w układzie ekranu (ujemne = w lewo / w dół)
  leftBiasN = -0.30,
  raiseN = -0.06,
  screenShift = { x: -0.02, y: -0.60 },

  duration = 900,
  forceAxis = "x",
  shrink = 0.55,
} = {}) {
  const camera = cameraRef.current;
  const controls = controlsRef.current;
  const model = modelRef.current;
  if (!camera || !controls || !model) return;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x";
  let axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else {
    if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
    if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
  }

  const segStart = box.min[axis] + THREE.MathUtils.clamp(startFrac, 0, 1) * axisSize;
  const segLen = THREE.MathUtils.clamp(regionFrac, 0.01, 1) * axisSize;
  const segEnd = Math.min(box.max[axis], segStart + segLen);

  const rMin = box.min.clone();
  const rMax = box.max.clone();
  rMin[axis] = segStart; rMax[axis] = segEnd;

  ["x", "y", "z"].forEach((k) => {
    if (k !== axis) {
      const c = (box.min[k] + box.max[k]) * 0.5;
      const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
      rMin[k] = c - half; rMax[k] = c + half;
    }
  });

  const regionBox = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr = regionBox.getCenter(new THREE.Vector3());

  const distance = fitDistanceForSize(camera, regionSize, padding);

  // przesunięcie w screen space
  const viewDir = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
  const viewUp = camera.up.clone().normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

  const shiftX = (screenShift?.x !== undefined ? screenShift.x : leftBiasN);
  const shiftY = (screenShift?.y !== undefined ? screenShift.y : raiseN);

  const target = regionCtr.clone()
    .add(viewRight.multiplyScalar(shiftX * regionSize.x))
    .add(viewUp.multiplyScalar(shiftY * regionSize.y));

  animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
  console.log('[actions] stage1')
}

/* ============================================================================
 * 3) Fokus: „następny etap” (kolanko + obejmy)
 * ==========================================================================*/
export function focusModelSecondStageSmooth({
  cameraRef,
  controlsRef,
  modelRef,

  fraction = 0.72,
  regionFrac = 0.18,
  padding = 1.06,
  duration = 1100,

  align = -0.10,
  offsetN = { x: 0, y: 0.06, z: 0 },
  forceAxis = "x",
  shrink = 0.90,
} = {}) {
  const camera = cameraRef.current;
  const controls = controlsRef.current;
  const model = modelRef.current;
  if (!camera || !controls || !model) return;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x";
  let axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else {
    if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
    if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
  }

  const frac = Math.max(0, Math.min(1, fraction));
  const segHalf = 0.5 * Math.max(0.01, Math.min(1, regionFrac)) * axisSize;
  const segCenter = box.min[axis] + frac * axisSize;

  const rMin = box.min.clone();
  const rMax = box.max.clone();
  rMin[axis] = Math.max(box.min[axis], segCenter - segHalf);
  rMax[axis] = Math.min(box.max[axis], segCenter + segHalf);

  ["x", "y", "z"].forEach((k) => {
    if (k !== axis) {
      const c = (box.min[k] + box.max[k]) * 0.5;
      const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
      rMin[k] = c - half; rMax[k] = c + half;
    }
  });

  const regionBox = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr = regionBox.getCenter(new THREE.Vector3());

  const target = regionCtr.clone();
  target[axis] += align * segHalf;
  target.add(new THREE.Vector3(
    (offsetN.x || 0) * size.x,
    (offsetN.y || 0) * size.y,
    (offsetN.z || 0) * size.z
  ));

  const distance = fitDistanceForSize(camera, regionSize, padding);
  animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
  console.log('[actions] stage2')
}

/* Alias po polsku (opcjonalnie) */
export const przejscieDoNastepnegoEtapu = focusModelSecondStageSmooth;

/* ============================================================================
 * 4) Fokus: „etap 3” (złącze trójnika z obejmami)
 * ==========================================================================*/
export function focusModelThirdStageSmooth({
  cameraRef,
  controlsRef,
  modelRef,

  fraction = 0.82,
  regionFrac = 0.20,
  padding = 1.06,
  duration = 1100,

  align = 0.0,
  forceAxis = "x",
  shrink = 0.85,

  offsetN = { x: 0, y: 0, z: 0 },
  screenShift = { x: 0.22, y: -0.28 },
} = {}) {
  const camera = cameraRef.current;
  const controls = controlsRef.current;
  const model = modelRef.current;
  if (!camera || !controls || !model) return;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x";
  let axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else {
    if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
    if (size.z > axisSize) { axis = "z"; axisSize = size.z; }
  }

  const frac = Math.max(0, Math.min(1, fraction));
  const segHalf = 0.5 * Math.max(0.01, Math.min(1, regionFrac)) * axisSize;
  const segCtr = box.min[axis] + frac * axisSize;

  const rMin = box.min.clone();
  const rMax = box.max.clone();
  rMin[axis] = Math.max(box.min[axis], segCtr - segHalf);
  rMax[axis] = Math.min(box.max[axis], segCtr + segHalf);

  ["x", "y", "z"].forEach((k) => {
    if (k !== axis) {
      const c = (box.min[k] + box.max[k]) * 0.5;
      const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
      rMin[k] = c - half; rMax[k] = c + half;
    }
  });

  const regionBox = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr = regionBox.getCenter(new THREE.Vector3());

  const viewDir = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
  const viewUp = camera.up.clone().normalize();
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
    target.add(viewUp.multiplyScalar((screenShift.y || 0) * regionSize.y));
  }

  const distance = fitDistanceForSize(camera, regionSize, padding);
  animateCameraTo({ camera, controls, newTarget: target, newDistance: distance, duration });
  console.log('[actions] stage3')
}





//etap 5 

// ---- kontrola anulowania animacji (żeby nie „zatrzymywało się” w pół) ----
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
      if (myToken !== __animToken) return resolve(); // anulowane
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
  camera,
  controls,
  target,
  axis,                // jeśli nie podasz, użyjemy camera.up (ekranowy „pion”)
  totalAngle = Math.PI * 105/180, // ~105°
  duration   = 1100,
  distanceKeys,        // np. [{t:0,d:D},{t:0.4,d:D*0.9},{t:1,d:D}]
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
      if (myToken !== __animToken) return resolve(); // anulowane
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
// 4) Z etapu 3 do „kontra-ujęcia”: krótka orbita + finalny micro-dolot
// ============================================================================
export async function focusModelFourthStageSmooth({
  cameraRef,
  controlsRef,
  modelRef,

  fraction   = 0.82,
  regionFrac = 0.22,
  padding    = 1.06,
  shrink     = 0.88,
  forceAxis  = "x",

  // <<< ważne: pełny obrót
  orbitAngleDeg   = 180,
  orbitDir        = "auto",   // 'auto' | 'cw' | 'ccw'
  orbitMs         = 1100,
  midAt           = 0.40,
  midZoom         = 0.90,

  finalAlign        = +0.04,
  finalScreenShift  = { x:-0.22, y:-0.02 },
  preMs  = 260,
  postMs = 340,
} = {}) {
  const camera   = cameraRef.current;
  const controls = controlsRef.current;
  const model    = modelRef.current;
  if (!camera || !controls || !model) return;

  // ---- region jak w etapie 3 ----
  const box  = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  let axis = "x"; let axisSize = size.x;
  if (forceAxis === "y") { axis = "y"; axisSize = size.y; }
  else if (forceAxis === "z") { axis = "z"; axisSize = size.z; }
  else { if (size.y > axisSize) { axis = "y"; axisSize = size.y; }
         if (size.z > axisSize) { axis = "z"; axisSize = size.z; } }

  const frac    = THREE.MathUtils.clamp(fraction, 0, 1);
  const segHalf = 0.5 * THREE.MathUtils.clamp(regionFrac, 0.01, 1) * axisSize;
  const segCtr  = box.min[axis] + frac * axisSize;

  const rMin = box.min.clone(), rMax = box.max.clone();
  rMin[axis] = Math.max(box.min[axis], segCtr - segHalf);
  rMax[axis] = Math.min(box.max[axis], segCtr + segHalf);

  ["x","y","z"].forEach((k) => {
    if (k !== axis) {
      const c = (box.min[k] + box.max[k]) * 0.5;
      const half = (box.max[k] - box.min[k]) * 0.5 * shrink;
      rMin[k] = c - half; rMax[k] = c + half;
    }
  });

  const regionBox  = new THREE.Box3(rMin, rMax);
  const regionSize = regionBox.getSize(new THREE.Vector3());
  const regionCtr  = regionBox.getCenter(new THREE.Vector3());

  // 1) krótki pre-fit
  const distance = (function fitDistanceForSize(cam, sz, pad=1.15) {
    const maxSize = Math.max(sz.x, sz.y, sz.z);
    const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const fitW = fitH / cam.aspect;
    return pad * Math.max(fitH, fitW);
  })(camera, regionSize, padding);

  await animateCameraTo({ camera, controls, newTarget: regionCtr, newDistance: distance, duration: preMs });

  // 2) orbita: pełne 180° — wybieramy sensowny kierunek
  let dirSign = 1;
  if (orbitDir === "cw") dirSign = -1;
  else if (orbitDir === "ccw") dirSign = 1;
  else {
    // auto: wybierz kierunek tak, żeby po obrocie X kamery "zmienił znak"
    const rel = camera.position.clone().sub(regionCtr);
    dirSign = (rel.x >= 0 ? 1 : -1);
  }

  const keys = [
    { t: 0,                                        d: distance },
    { t: Math.max(0.05, Math.min(0.95, midAt)),    d: distance * midZoom },
    { t: 1,                                        d: distance }
  ];

  await orbitCameraAroundTarget({
    camera, controls, target: regionCtr,
    axis: camera.up, // stabilnie względem ekranu
    totalAngle: THREE.MathUtils.degToRad(orbitAngleDeg) * dirSign,
    duration: orbitMs,
    distanceKeys: keys,
  });

  // 3) finalny micro-dolot / kompozycja
  const viewDir   = new THREE.Vector3(); camera.getWorldDirection(viewDir).normalize();
  const viewUp    = camera.up.clone().normalize();
  const viewRight = new THREE.Vector3().crossVectors(viewDir, viewUp).normalize();

  const finalTarget = regionCtr.clone();
  finalTarget[axis] += finalAlign * segHalf;
  finalTarget.add(viewRight.multiplyScalar((finalScreenShift.x || 0) * regionSize.x));
  finalTarget.add(viewUp   .multiplyScalar((finalScreenShift.y || 0) * regionSize.y));

  await animateCameraTo({ camera, controls, newTarget: finalTarget, newDistance: distance, duration: postMs });
  console.log('[actions] stage4')
}




// wystaw do globalu + log:

if (typeof window !== 'undefined') {
  window.Nexus ??= {};
  window.Nexus.actions = {
    focusModelFirstStageSmooth,
    focusModelSecondStageSmooth,
    focusModelThirdStageSmooth,
    focusModelFourthStageSmooth,
    // przykładowa akcja z danymi:
    setMeasure: (val, unit) => console.log('[actions] setMeasure', val, unit),
  };
  console.log('[Nexus] actions registered:', Object.keys(window.Nexus.actions));
}
