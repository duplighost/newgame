// Scene setup: sky, sun, lights, fog, ground, environment map.

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export function createScene(renderer) {
  const scene = new THREE.Scene();

  // ---------- Sky ----------
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const sun = new THREE.Vector3();
  // Golden hour: low sun, warm tones
  const elevation = 7; // degrees above horizon
  const azimuth = 200; // degrees
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 6;
  uniforms.rayleigh.value = 2.2;
  uniforms.mieCoefficient.value = 0.006;
  uniforms.mieDirectionalG.value = 0.85;
  uniforms.sunPosition.value.copy(sun);

  // ---------- Fog ----------
  // Warm dusty fog that softens distance without burying close blocks
  scene.fog = new THREE.FogExp2(0xe8b486, 0.0055);

  // ---------- Directional sun light ----------
  const sunLight = new THREE.DirectionalLight(0xffd49a, 2.0);
  sunLight.position.copy(sun).multiplyScalar(120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -80;
  sunLight.shadow.camera.right = 80;
  sunLight.shadow.camera.top = 80;
  sunLight.shadow.camera.bottom = -80;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.radius = 4;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // ---------- Hemisphere (sky/ground bounce) ----------
  const hemi = new THREE.HemisphereLight(0xc0d4ff, 0x4a3a2c, 0.5);
  scene.add(hemi);

  // ---------- Ambient (subtle fill) ----------
  const ambient = new THREE.AmbientLight(0xffe7c8, 0.15);
  scene.add(ambient);

  // ---------- Environment map (PMREM from sky) ----------
  // Use the sky as the environment for nice reflections on glass/metal.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const envTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;

  return { scene, sun, sunLight, sunVec: sun };
}
