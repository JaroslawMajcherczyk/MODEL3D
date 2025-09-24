// src/components/actions/coreEx.js
import * as THREE from "three";
import { animateCameraTo } from "./core"; // Twoja istniejąca animacja

export function getCanonicalViewAxes() {
  const basis = window.Nexus?.viewBasis;
  if (!basis) {
    // awaryjnie – jeśli nie zapisane: weź aktualny (niekanoniczne, ale zapobiegnie crashowi)
    const camera = window.Nexus?.cameraRef?.current;
    if (camera) {
      const view = new THREE.Vector3(); camera.getWorldDirection(view).normalize();
      const up = camera.up.clone().normalize();
      const right = new THREE.Vector3().crossVectors(view, up).normalize();
      return { view, up, right };
    }
    // twardy fallback:
    return {
      view: new THREE.Vector3(0, 0, -1),
      up:   new THREE.Vector3(0, 1,  0),
      right:new THREE.Vector3(1, 0,  0),
    };
  }
  return {
    view: basis.view.clone(),
    up:   basis.up.clone(),
    right:basis.right.clone()
  };
}

/**
 * Animacja z narzuconym kierunkiem widoku (viewDir).
 * Zamiast „newDistance + obecny kierunek”, liczymy pozycję: pos = target - viewDir * distance
 */
export function animateCameraToDir({ camera, controls, newTarget, newDistance, viewDir, duration = 900 }) {
  const dir = viewDir.clone().normalize();
  const desiredPos = newTarget.clone().sub(dir.multiplyScalar(newDistance));
  return animateCameraTo({
    camera,
    controls,
    newTarget,
    // WYMAGANE: core.animateCameraTo musi akceptować newPosition (jeśli nie ma – dopisz obsługę)
    newPosition: desiredPos,
    duration
  });
}
