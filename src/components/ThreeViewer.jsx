// ThreeViewer.jsx
import React, { useEffect, useRef, useState } from "react";
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

// ⬇️ DODANE: loader modeli z Twojego pliku modelActions.jsx
import { loadFromProjectAndRotateX } from "./modelActions";

// proste, czytelne style dla przycisków
const btnStyle = {
  pointerEvents: "auto",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(4px)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  fontSize: 14,
  cursor: "pointer",
  userSelect: "none",
};

export default function ThreeViewer() {
  const containerRef  = useRef(null);
  const mountRef      = useRef(null);
  const rendererRef   = useRef(null);
  const sceneRef      = useRef(null);
  const cameraRef     = useRef(null);
  const controlsRef   = useRef(null);
  const modelRef      = useRef(null);
  const frameRef      = useRef(0);

  // mini-axes overlay
  const axesSceneRef  = useRef(null);
  const axesCameraRef = useRef(null);

  // ⬇️ DODANE: stan ładowania i aktualnie wybrany model
  const [loading, setLoading] = useState(false);
  const [activeModelKey, setActiveModelKey] = useState(null);

  // helper do wywołania etapów
  const callStage = (fn) => {
    fn?.({ sceneRef, cameraRef, controlsRef, modelRef });
  };

  // ⬇️ DODANE: helper do ładowania modelu po numerze
  const loadModel = async (n) => {
    // pozwala na override bazowej ścieżki przez window.__NEXUS_MODELS_BASE__
    // a sam resolver w modelActions obsługuje czyste nazwy typu "1.gltf"
    setActiveModelKey(String(n));
    await loadFromProjectAndRotateX({
      projectRelUrl: `${n}.gltf`,
      onLoading: (isLoading) => setLoading(!!isLoading),
      onLoaded: () => {
        // gotowe – aktywny model ustawiony wyżej, nic więcej nie trzeba
      },
      // przekazujemy referecje tylko jeśli chcesz ominąć window.Nexus.refs
      sceneRef,
      cameraRef,
      controlsRef,
      modelRef,
    });
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene    = createScene();
    scene.background = new THREE.Color(0xffffff);

    const camera   = createCamera(mount.clientWidth, mount.clientHeight);
    const renderer = createRenderer(mount);
    const controls = createControls(camera, renderer.domElement);

    sceneRef.current    = scene;
    cameraRef.current   = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    window.Nexus ??= {};
    window.Nexus.refs = { sceneRef, cameraRef, controlsRef, modelRef, rendererRef, mountRef };
    window.dispatchEvent(new Event("nexus:viewer:ready"));

    // overlay mini-osi
    const axesScene  = new THREE.Scene();
    const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    axesCamera.position.set(0, 0, 3);
    axesScene.add(new THREE.AxesHelper(0.6));
    axesSceneRef.current  = axesScene;
    axesCameraRef.current = axesCamera;

    renderer.autoClear = true;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      controls.update();
      renderer.setViewport(0, 0, mount.clientWidth, mount.clientHeight);
      renderer.setScissorTest(false);
      renderer.autoClear = true;
      renderer.render(scene, camera);

      const aScene  = axesSceneRef.current;
      const aCamera = axesCameraRef.current;
      if (aScene && aCamera) {
        aCamera.quaternion.copy(camera.quaternion);
        aCamera.updateProjectionMatrix();

        renderer.autoClear = false;
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
      {/* ⬇️ NOWY: panel wyboru modelu */}
      <div
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
      </div>

      {/* Panel etapów (zostaje jak było) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          display: "flex",
          gap: 8,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <button
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
        </button>
      </div>

      {/* subtelny overlay "Ładowanie…" */}
      {loading && (
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
      )}

      {/* Mount na renderer */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
