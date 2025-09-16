// src/components/viewOps.jsx
import * as THREE from "three";

/** Ustaw kamerę tak, by cały obiekt był widoczny z podanego kierunku. */
export function fitViewFromDirection(camera, controls, object3d, {
  direction = new THREE.Vector3(0, 0, 1),
  padding = 1.15,
} = {}) {
  if (!camera || !controls || !object3d) return;

  const box = new THREE.Box3().setFromObject(object3d);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;

  const size   = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitW = fitH / camera.aspect;
  const distance = padding * Math.max(fitH, fitW);

  const dir = direction.clone().normalize();
  camera.up.set(0, 1, 0);

  controls.target.copy(center);
  camera.position.copy(center).add(dir.multiplyScalar(distance));

  camera.near = Math.max(0.001, distance / 100);
  camera.far  = Math.max(10, distance * 100);
  camera.updateProjectionMatrix();
  controls.update();
}

/** Presety kierunków — wygodnie na przyciski / start. */
export const setViewRight  = (cam, ctr, obj) => fitViewFromDirection(cam, ctr, obj, { direction: new THREE.Vector3(0, 0, 1),  padding: 1.15 });
export const setViewLeft   = (cam, ctr, obj) => fitViewFromDirection(cam, ctr, obj, { direction: new THREE.Vector3(0, 0, -1), padding: 1.15 });
export const setViewFront  = (cam, ctr, obj) => fitViewFromDirection(cam, ctr, obj, { direction: new THREE.Vector3(1, 0, 0),  padding: 1.15 });
export const setViewBack   = (cam, ctr, obj) => fitViewFromDirection(cam, ctr, obj, { direction: new THREE.Vector3(-1,0, 0),  padding: 1.15 });
export const setViewTop    = (cam, ctr, obj) => fitViewFromDirection(cam, ctr, obj, { direction: new THREE.Vector3(0, -1,0),  padding: 1.15 });
export const setViewBottom = (cam, ctr, obj) => fitViewFromDirection(cam, ctr, obj, { direction: new THREE.Vector3(0, 1, 0),  padding: 1.15 });

/** Klasyczne “wyśrodkuj + zbliż”, zachowując aktualny kierunek kamery. */
export function centerAndZoom(camera, controls, object3d, padding = 1.25) {
  if (!camera || !controls || !object3d) return;

  const box = new THREE.Box3().setFromObject(object3d);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;

  const size   = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitH = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitW = fitH / camera.aspect;
  const distance = padding * Math.max(fitH, fitW);

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(distance));

  camera.near = Math.max(0.001, distance / 100);
  camera.far  = Math.max(10, distance * 100);
  camera.updateProjectionMatrix();
  controls.update();
}

/** Obrót lokalny modelu o 90° wokół osi X. */
export function rotateX90(object3d) {
  if (!object3d) return;
  object3d.rotateX(Math.PI / 2);
}
