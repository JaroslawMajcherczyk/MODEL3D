import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// --- wspólny LoadingManager (progress w konsoli) ---
const manager = new THREE.LoadingManager();
manager.onStart = (url) => console.time(`[load] ${url}`);
manager.onLoad  = () => console.timeEnd(`[load]`);
manager.onProgress = (url, loaded, total) => {
  console.log(`[load] ${(100*loaded/total).toFixed(0)}%: ${url}`);
};
manager.onError = (url) => console.warn(`[load] ERROR: ${url}`);

// --- Fabryka GLTFLoader z akceleracją ---
function createOptimizedGltfLoader(renderer /* może być null na starcie */) {
  const loader = new GLTFLoader(manager);

  // Meshopt (szybkie dekodowanie na CPU, zero requestów na dodatkowe skrypty)
  loader.setMeshoptDecoder(MeshoptDecoder);

  // Draco (większa kompresja; wymaga plików decoderów)
  const draco = new DRACOLoader(manager);
  // Ustal ścieżkę do dekoderów (patrz sekcja 3)
  // wrzucimy je do /draco/ w katalogu dist/public
  draco.setDecoderPath('/draco/');
  draco.setDecoderConfig({ type: 'wasm' }); // wasm > js
  loader.setDRACOLoader(draco);

  // KTX2 (kompresja tekstur BasisU)
  if (renderer) {
    const ktx2 = new KTX2Loader(manager).setTranscoderPath('/basis/');
    ktx2.detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  }

  loader.setCrossOrigin('anonymous');
  return loader;
}

// --- Scena, kamera, renderer, controls (jak miałeś) ---
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 7.5);
  scene.add(dir);
  return scene;
}

export function createCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 5000);
  camera.position.set(2.5, 1.5, 3.5);
  return camera;
}

export function createRenderer(container) {
  // antialias=false + FXAA/SMAA (opcjonalnie) – szybciej przy dużych scenach
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // cap ×2
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false; // włącz tylko, jeśli naprawdę potrzebujesz
  container.appendChild(renderer.domElement);
  return renderer;
}

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
    "map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap",
    "alphaMap","displacementMap","bumpMap","clearcoatNormalMap"
  ].forEach((k) => {
    if (any[k] && typeof any[k].dispose === "function") any[k].dispose();
  });
  mat.dispose?.();
}

// --- Center + Zoom ---
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
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

// --- Ładowanie GLB/GLTF z URL (z optymalizacją) ---
export async function loadGltfFromUrl(url, renderer /* opcjonalnie podaj renderer */) {
  const loader = createOptimizedGltfLoader(renderer);
  console.time(`[gltf] ${url}`);
  const gltf = await loader.loadAsync(url);
  console.timeEnd(`[gltf] ${url}`);

  const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
  if (!root) throw new Error("Nie znaleziono sceny w GLTF/GLB.");
  root.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } }); // cienie off = szybciej
  return root;
}

// --- pliki lokalne: jak było (możesz też użyć createOptimizedGltfLoader) ---
export async function loadGltfFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const loader = createOptimizedGltfLoader(null);
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!root) throw new Error("Nie znaleziono sceny w GLTF/GLB.");
    root.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
    return root;
  } finally {
    URL.revokeObjectURL(url);
  }
}
