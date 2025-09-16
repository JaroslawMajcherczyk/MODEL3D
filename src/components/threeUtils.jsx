// src/components/threeUtils.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// --- Scena ---
export function createScene() {
  const scene = new THREE.Scene();

  // BIAŁE TŁO
  scene.background = new THREE.Color(0xffffff);

  // Światła
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 7.5);
  scene.add(dir);

  // UWAGA: nie dodajemy AxesHelper do sceny głównej (oś rysujemy jako overlay).
  return scene;
}
// --- Kamera ---
export function createCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 5000);
  camera.position.set(2.5, 1.5, 3.5);
  return camera;
}

// --- Renderer (montuje canvas do kontenera) ---
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  return renderer;
}

// --- OrbitControls ---
export function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  return controls;
}

// --- Bezpieczne czyszczenie ---
export function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.();
      const m = child.material;
      if (Array.isArray(m)) m.forEach(disposeMaterial);
      else disposeMaterial(m);
    }
  });
}
function disposeMaterial(mat) {
  if (!mat) return;
  const any = mat;
  [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
    "displacementMap",
    "bumpMap",
    "clearcoatNormalMap",
  ].forEach((k) => {
    if (any[k] && typeof any[k].dispose === "function") any[k].dispose();
  });
  mat.dispose?.();
}

// --- Center + Zoom (zoom-to-fit) ---
export function centerAndZoom(camera, controls, object3d) {
  if (!camera || !controls || !object3d) return;

  const box = new THREE.Box3().setFromObject(object3d);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeight = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitWidth = fitHeight / camera.aspect;
  const distance = 1.25 * Math.max(fitHeight, fitWidth);

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(distance));

  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}
export async function loadGltfFromUrl(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
  if (!root) throw new Error("Nie znaleziono sceny w GLTF.");
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return root;
}
// --- Obrót 90° wokół lokalnej osi X ---
export function rotateX90(object3d) {
  if (!object3d) return;
  object3d.rotateX(Math.PI / 2);
}

// --- Ładowanie GLTF/GLB z pliku ---
export async function loadGltfFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!root) throw new Error("Nie znaleziono sceny w GLTF/GLB.");

    // cienie (opcjonalnie)
    root.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    return root;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function loadGltfFromFileSet(fileList) {
  const files = Array.from(fileList);
  const urlMap = new Map();
  let gltfFile = null;

  for (const f of files) {
    urlMap.set(f.name, URL.createObjectURL(f));
    if (/\.gltf$/i.test(f.name)) gltfFile = f;
  }
  if (!gltfFile) throw new Error("Wybierz plik .gltf razem z .bin/teksturami.");

  const loader = new GLTFLoader();

  loader.setURLModifier((url) => {
    const clean = url.split(/[?#]/)[0];
    const name = clean.substring(clean.lastIndexOf("/") + 1);
    if (urlMap.has(clean)) return urlMap.get(clean);
    if (urlMap.has(name)) return urlMap.get(name);
    return url; // fallback
  });

  const modelUrl = urlMap.get(gltfFile.name);
  const gltf = await loader.loadAsync(modelUrl);
  loader.setURLModifier(null);

  // sprzątanie blobów po załadowaniu
  for (const u of urlMap.values()) URL.revokeObjectURL(u);

  const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
  if (!root) throw new Error("Nie znaleziono sceny w GLTF.");
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return root;
}