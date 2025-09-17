import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createScene,
  createCamera,
  createRenderer,
  createControls,
  disposeObject,
} from "./threeUtils";
import { loadFromProjectAndRotateX } from "./actions";

export default function ThreeViewer() {
  const mountRef      = useRef(null);
  const autoloadedRef = useRef(false);
  const rendererRef   = useRef(null);
  const sceneRef      = useRef(null);
  const cameraRef     = useRef(null);
  const controlsRef   = useRef(null);
  const modelRef      = useRef(null);
  const frameRef      = useRef(0);

  // mini-axes overlay
  const axesSceneRef  = useRef(null);
  const axesCameraRef = useRef(null);

  const [, setLoading] = useState(false);

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
    window.Nexus.refs = { sceneRef, cameraRef, controlsRef, modelRef };

    // viewer gotowy (refs istnieją) – powiadom lokalnie
    window.dispatchEvent(new Event('nexus:viewer:ready'));

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

    // --- AUTOSTART modelu: tylko raz (guard pod StrictMode) ---
    if (!autoloadedRef.current) {
      autoloadedRef.current = true;
      requestAnimationFrame(() => {
        loadFromProjectAndRotateX({
          sceneRef,
          cameraRef,
          controlsRef,
          modelRef,
          projectRelUrl: "../model/gltf/24388549.gltf",
          onLoading: setLoading,
          onLoaded: () => {
            // model już w scenie:
            // — lokalny event (dla UI)…
            window.dispatchEvent(new Event('nexus:model:loaded'));
            // — oraz sygnał do C# (jeśli SignalR już gotowy)
            window.Nexus?.send?.('ModelReady');
          },
        });
      });
    }

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

  return <div ref={mountRef} style={{ position:'absolute', inset:0 }} />;
}
