// src/components/ThreeViewer.jsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createScene,
  createCamera,
  createRenderer,
  createControls,
  disposeObject,
  loadGltfFromFile,
  // loadGltfFromUrl,
} from "./threeUtils";
import { setViewRight } from "./viewOps";
import {
  loadFromProjectAndRotateX,
  // focusModelFirstStageSmooth,
  // focusModelSecondStageSmooth,
  // focusModelThirdStageSmooth,
  // focusModelFourthStageSmooth,  // lub przejscieDoNastepnegoEtapu
} from "./actions";

export default function ThreeViewer() {
  const mountRef    = useRef(null);
 const autoloadedRef = useRef(false);
  const rendererRef = useRef(null);
  const sceneRef    = useRef(null);
  const cameraRef   = useRef(null);
  const controlsRef = useRef(null);
  const modelRef    = useRef(null);
  const frameRef    = useRef(0);

  // Mini-axes overlay
  const axesSceneRef  = useRef(null);
  const axesCameraRef = useRef(null);

  const [, setLoading] = useState(false);
  // ---- Inicjalizacja bazowa + overlay osi ----
  useEffect(() => {

  window.Nexus ??= {};
  window.Nexus.refs = { sceneRef, cameraRef, controlsRef, modelRef };
  window.Nexus.ready = true;
  window.Nexus.send?.('ThreeReady'); // opcjonalnie: ACK do C#
  

    
    const mount = mountRef.current;
    if (!mount) return;

    const scene = createScene();
    scene.background = new THREE.Color(0xffffff); // BIAŁE TŁO

    const camera   = createCamera(mount.clientWidth, mount.clientHeight);
    const renderer = createRenderer(mount);
    const controls = createControls(camera, renderer.domElement);

    // <<< WAŻNE: zapisz instancje do refów (wcześniej tego brakowało)
    sceneRef.current    = scene;
    cameraRef.current   = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // --- overlay: osobna scena i kamera dla mini-osi (bez tła) ---
    const axesScene  = new THREE.Scene();
    const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    axesCamera.position.set(0, 0, 3);
    axesScene.add(new THREE.AxesHelper(0.6));

    axesSceneRef.current  = axesScene;
    axesCameraRef.current = axesCamera;

    renderer.autoClear = true;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      // ----- render główny -----
      controls.update();
      renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
      renderer.setScissorTest(false);
      renderer.autoClear = true;
      renderer.render(scene, camera);

      // ----- overlay mini-osi w lewym dolnym rogu -----
      const aScene  = axesSceneRef.current;
      const aCamera = axesCameraRef.current;
      if (aScene && aCamera) {
        aCamera.quaternion.copy(camera.quaternion); // oś obraca się jak kamera
        aCamera.updateProjectionMatrix();

        renderer.autoClear = false; // nie czyść koloru — brak czarnego kwadratu
        renderer.clearDepth();

        const size = 96;
        const pad  = 8;
        renderer.setScissorTest(true);
        renderer.setScissor(pad, pad, size, size);
        renderer.setViewport(pad, pad, size, size);
        renderer.render(aScene, aCamera);

        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
        renderer.autoClear = true;
      }
    };
    animate();
   // --- AUTOSTART: wczytaj model + obróć X 90° jako pierwszy widok ---
    if (!autoloadedRef.current) {
      autoloadedRef.current = true;        // anty-duplikat (React StrictMode)
      requestAnimationFrame(() => {
        loadFromProjectAndRotateX({
          sceneRef,
          cameraRef,
          controlsRef,
          modelRef,
          projectRelUrl: "../model/gltf/24388549.gltf",
          onLoading: setLoading,
        });
      });
    }
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      disposeObject(scene);
      scene.clear();
      if (renderer.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // // ---- Wczytywanie z projektu: widok RIGHT (boczny) ----
  // const loadFromProject = async () => {
  //   const scene = sceneRef.current;
  //   if (!scene) return;
  //   setLoading(true);
  //   try {
  //     if (modelRef.current) {
  //       scene.remove(modelRef.current);
  //       disposeObject(modelRef.current);
  //       modelRef.current = null;
  //     }
  //     const modelUrl = new URL("../model/gltf/24388549.gltf", import.meta.url).href;
  //     const root = await loadGltfFromUrl(modelUrl);
  //     modelRef.current = root;
  //     scene.add(root);

  //     setViewRight(cameraRef.current, controlsRef.current, root);
  //   } catch (err) {
  //     console.error(err);
  //     alert("Nie udało się wczytać modelu: " + (err?.message || err));
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // // ---- Wczytywanie pliku (.glb polecany) ----
  // const onPickFile = async (e) => {
  //   const file = e.target.files?.[0];
  //   if (!file) return;
  //   if (/\.gltf$/i.test(file.name)) {
  //     alert('Ten .gltf zwykle wymaga .bin/tekstur. Użyj "Załaduj z projektu" lub wrzuć .glb.');
  //     e.target.value = "";
  //     return;
  //   }
  //   await loadModel(file);
  //   e.target.value = "";
  // };

  async function loadModel(file) {
    const scene = sceneRef.current;
    if (!scene) return;
    setLoading(true);
    try {
      if (modelRef.current) {
        scene.remove(modelRef.current);
        disposeObject(modelRef.current);
        modelRef.current = null;
      }
      const root = await loadGltfFromFile(file);
      modelRef.current = root;
      scene.add(root);

      setViewRight(cameraRef.current, controlsRef.current, root);
    } catch (err) {
      console.error(err);
      alert("Nie udało się wczytać modelu: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // ---- Drag&Drop (.glb) ----
  useEffect(() => {
    const node = mountRef.current;
    if (!node) return;

    const onDrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (/\.glb$/i.test(file.name)) loadModel(file);
      else if (/\.gltf$/i.test(file.name))
        alert('Dla .gltf użyj "Załaduj z projektu" lub wrzuć komplet plików.');
    };
    const onDragOver = (e) => e.preventDefault();

    node.addEventListener("drop", onDrop);
    node.addEventListener("dragover", onDragOver);
    return () => {
      node.removeEventListener("drop", onDrop);
      node.removeEventListener("dragover", onDragOver);
    };
  }, []);

  // ---- Akcje UI ----





  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 8, height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, color: "#e2e8f0" }}>
        {/* <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="file" accept=".glb,.gltf" onChange={onPickFile} style={{ display: "none" }} />
          <span style={{ padding: "6px 12px", background: "#2563eb", borderRadius: 8 }}>
            Wczytaj model (.glb/.gltf)
          </span>
        </label>

        <button onClick={loadFromProject} style={{ padding:"6px 12px", background:"#334155", borderRadius:8, color:"#e2e8f0" }}>
          Załaduj z projektu (src/model/gltf)
        </button>
        <button
        onClick={() => loadFromProjectAndRotateX({
            sceneRef, cameraRef, controlsRef, modelRef,
            projectRelUrl: "../model/gltf/24388549.gltf",
            onLoading: setLoading,
        })}
        style={{ padding: "6px 12px", background: "#334155", borderRadius: 8, color: "#e2e8f0" }}
        >
            Załaduj z projektu + Obrót X 90°
        </button>

        <button
        onClick={() => focusModelFirstStageSmooth({ cameraRef, controlsRef, modelRef, slice: 0.08, zoomFactor: 0.35, duration: 1100 })}
        style={{ padding: "6px 12px", background: "#334155", borderRadius: 8, color: "#e2e8f0" }}
        >
            Płynny fokus: początek + zoom
        </button>
        <button
            onClick={() => focusModelSecondStageSmooth({ cameraRef, controlsRef, modelRef })}
            style={{ padding:"6px 12px", background:"#334155", borderRadius:8, color:"#e2e8f0" }}
            >
            Pokaż „kolanko” (płynnie)
        </button>
        <button
            onClick={() => focusModelThirdStageSmooth({ cameraRef, controlsRef, modelRef })}
            style={{ padding:"6px 12px", background:"#334155", borderRadius:8, color:"#e2e8f0" }}
            >
            Fokus: etap 3 (płynnie)
        </button>
        <button
            onClick={() => focusModelFourthStageSmooth({ cameraRef, controlsRef, modelRef })}
            style={{ padding:"6px 12px", background:"#334155", borderRadius:8, color:"#e2e8f0" }}
            >
            Fokus: etap 4 (obrót + zoom)
            </button> */}
      </div>

      <div ref={mountRef} style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}
