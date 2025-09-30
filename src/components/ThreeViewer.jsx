// src/components/ThreeViewer.jsx
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  createScene,
  createCamera,
  createRenderer,
  createControls,
  disposeObject,
} from "./threeUtils";
import {
  focusModelFirstStageSmooth,
  focusModelSecondStageSmooth,
  focusModelThirdStageSmooth,
  focusModelFourthStageSmooth,
} from "./actions/index.js";

// ⬇️ loader modeli (z Twojego pliku modelActions.jsx)
//import { loadFromProjectAndRotateX } from "./modelActions";

export default function ThreeViewer() {
  const containerRef  = useRef(null);  // kontener całego viewer’a (relative)
  const mountRef      = useRef(null);  // tu wpina się renderer
  const rendererRef   = useRef(null);
  const sceneRef      = useRef(null);
  const cameraRef     = useRef(null);
  const controlsRef   = useRef(null);
  const modelRef      = useRef(null);
  const frameRef      = useRef(0);

  // mini-axes overlay
  const axesSceneRef  = useRef(null);
  const axesCameraRef = useRef(null);

  // UI: stan ładowania + aktualny model
  // const [loading, setLoading] = useState(false);
  // const [activeModelKey, setActiveModelKey] = useState(null);

  // helper do wywołania etapów
  const callStage = (fn) => {
    fn?.({
      sceneRef,
      cameraRef,
      controlsRef,
      modelRef,
    });
  };

  // ładowanie modelu po numerze 1/2/3
  // const loadModel = async (n) => {
  //   setActiveModelKey(String(n));
  //   await loadFromProjectAndRotateX({
  //     projectRelUrl: `${n}.gltf`,              // resolver zadba o /model/gltf/ bazę
  //     onLoading: (isLoading) => setLoading(!!isLoading),
  //     onLoaded: () => {},
  //     // przekazujemy refs (możesz też polegać na window.Nexus.refs)
  //     sceneRef,
  //     cameraRef,
  //     controlsRef,
  //     modelRef,
  //   });
  // };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene    = createScene();
    scene.background = new THREE.Color(0xffffff);

    const camera   = createCamera(mount.clientWidth, mount.clientHeight);
    const renderer = createRenderer(mount);
    const controls = createControls(camera, renderer.domElement);

    // zapisz instancje do refów
    sceneRef.current    = scene;
    cameraRef.current   = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // zarejestruj globalne refs dla akcji (C# -> React)
    window.Nexus ??= {};
    window.Nexus.refs = { sceneRef, cameraRef, controlsRef, modelRef, rendererRef, mountRef  };

    // viewer gotowy (refs istnieją) – powiadom lokalnie
    window.dispatchEvent(new Event("nexus:viewer:ready"));

    // --- overlay mini-osi (osobna scena + kamera, brak tła) ---
    const axesScene  = new THREE.Scene();
    const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    axesCamera.position.set(0, 0, 3);
    axesScene.add(new THREE.AxesHelper(0.6));
    axesSceneRef.current  = axesScene;
    axesCameraRef.current = axesCamera;

    renderer.autoClear = true;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      // render główny
      controls.update();
      renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
      renderer.setScissorTest(false);
      renderer.autoClear = true;
      renderer.render(scene, camera);

      // overlay mini-osi (np. lewy-dół)
      const aScene  = axesSceneRef.current;
      const aCamera = axesCameraRef.current;
      if (aScene && aCamera) {
        aCamera.quaternion.copy(camera.quaternion);
        aCamera.updateProjectionMatrix();

        renderer.autoClear = false; // nie czyść koloru
        renderer.clearDepth();

        const size = 96, pad = 8;
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

    // resize
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

  // skróty klawiaturowe 1–4 dla focusów
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      switch (e.key) {
        case "1": return callStage(focusModelFirstStageSmooth);
        case "2": return callStage(focusModelSecondStageSmooth);
        case "3": return callStage(focusModelThirdStageSmooth);
        case "4": return callStage(focusModelFourthStageSmooth);
        default: return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {/* Panel wyboru modelu (prawo-góra) */}
      {/* <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          display: "flex",
          gap: 8,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <button
          style={btnStyle}
          disabled={loading || activeModelKey === "1"}
          onClick={() => loadModel(1)}
          title="Załaduj 1.gltf"
        >
          Model 1
        </button>
        <button
          style={btnStyle}
          disabled={loading || activeModelKey === "2"}
          onClick={() => loadModel(2)}
          title="Załaduj 2.gltf"
        >
          Model 2
        </button>
        <button
          style={btnStyle}
          disabled={loading || activeModelKey === "3"}
          onClick={() => loadModel(3)}
          title="Załaduj 3.gltf"
        >
          Model 3
        </button>
      </div> */}

      {/* Panel etapów (lewo-góra) */}
      {/* <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          gap: 8,
          zIndex: 10,
          pointerEvents: "none",
        }}
      > */}
        {/* <button
          style={btnStyle}
          onClick={() => callStage(focusModelFirstStageSmooth)}
          title="Etap 1 (skrót: 1)"
        >
          Etap 1
        </button>
        <button
          style={btnStyle}
          onClick={() => callStage(focusModelSecondStageSmooth)}
          title="Etap 2 (skrót: 2)"
        >
          Etap 2
        </button>
        <button
          style={btnStyle}
          onClick={() => callStage(focusModelThirdStageSmooth)}
          title="Etap 3 (skrót: 3)"
        >
          Etap 3
        </button>
        <button
          style={btnStyle}
          onClick={() => callStage(focusModelFourthStageSmooth)}
          title="Etap 4 (skrót: 4)"
        >
          Etap 4
        </button> */}
      {/* </div> */}

      {/* subtelny overlay "Ładowanie…" */}
      {/* {loading && (
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 12,
            zIndex: 11,
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(4px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          Ładowanie modelu…
        </div>
      )} */}

      {/* Mount na renderer */}
      <div
        ref={mountRef}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
}

// // proste, czytelne style dla przycisków
// const btnStyle = {
//   pointerEvents: "auto",
//   padding: "6px 10px",
//   borderRadius: 10,
//   border: "1px solid #ddd",
//   background: "rgba(255,255,255,0.85)",
//   backdropFilter: "blur(4px)",
//   boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
//   fontSize: 14,
//   cursor: "pointer",
//   userSelect: "none",
// };
