// Scene: golden-hour sky, sun (with a shadow camera that follows the
// player so shadows work in an endless world), warm fog, ambient fill,
// and an environment map baked from the sky for glass/metal reflections.

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export function createScene(renderer, settings = {}) {
  const { shadows = true, shadowMap = 2048, fog = 0.0072 } = settings;
  const scene = new THREE.Scene();

  // ---- sky ----
  const sky = new Sky();
  sky.scale.setScalar(12000);
  scene.add(sky);

  const sun = new THREE.Vector3();
  const elevation = 8.5; // degrees — low, golden
  const azimuth = 205;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  const u = sky.material.uniforms;
  u.turbidity.value = 5;
  u.rayleigh.value = 2.6;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(sun);

  // ---- fog (warm, hides chunk streaming at the edges) ----
  scene.fog = new THREE.FogExp2(0xeab27a, fog);

  // ---- sun light ----
  const sunLight = new THREE.DirectionalLight(0xffd49a, 2.6);
  sunLight.castShadow = shadows;
  sunLight.shadow.mapSize.set(shadowMap, shadowMap);
  const s = 46;
  sunLight.shadow.camera.left = -s;
  sunLight.shadow.camera.right = s;
  sunLight.shadow.camera.top = s;
  sunLight.shadow.camera.bottom = -s;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 220;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.025;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // ---- fills ----
  const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x4a3a2c, 0.3);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffe7c8, 0.1);
  scene.add(ambient);

  // ---- environment map from the sky ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(12000);
  envSky.material.uniforms.turbidity.value = u.turbidity.value;
  envSky.material.uniforms.rayleigh.value = u.rayleigh.value;
  envSky.material.uniforms.mieCoefficient.value = u.mieCoefficient.value;
  envSky.material.uniforms.mieDirectionalG.value = u.mieDirectionalG.value;
  envSky.material.uniforms.sunPosition.value.copy(sun);
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  // keep the sun direction for the per-frame follow update
  return { scene, sunLight, sunDir: sun.clone() };
}

// Reposition the sun + shadow frustum to straddle the player so shadows
// are always crisp around them, regardless of how far they've walked.
export function followSun(sunLight, sunDir, target) {
  sunLight.position.copy(target).addScaledVector(sunDir, 90);
  sunLight.target.position.copy(target);
  sunLight.target.updateMatrixWorld();
}
