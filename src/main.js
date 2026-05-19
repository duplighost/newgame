// Entry point.  Boots renderer, scene, world, player, postfx, and runs
// the animation loop.

import * as THREE from "three";
import { createScene } from "./scene.js";
import { buildWorld } from "./world.js";
import { Player } from "./player.js";
import { createComposer } from "./postfx.js";

const canvas = document.getElementById("canvas");
const loadingEl = document.getElementById("loading");
const loadFill = document.getElementById("loadfill");
const loadStatus = document.getElementById("loadstatus");
const startEl = document.getElementById("start");
const playBtn = document.getElementById("playbtn");
const hudEl = document.getElementById("hud");
const promptEl = document.getElementById("prompt");
const stanceEl = document.getElementById("stance");
const compassEl = document.getElementById("compass");

// ---------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // SMAA handles it
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

// ---------------------------------------------------------------
// Camera
// ---------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.05,
  500
);

// ---------------------------------------------------------------
// Scene + world
// ---------------------------------------------------------------
function setProgress(p, msg) {
  loadFill.style.width = `${Math.round(p * 100)}%`;
  if (msg) loadStatus.textContent = msg;
}

let player;
let composer;
let scene;
let solids;
let windows;
let lights;
let sunLight;

async function boot() {
  setProgress(0.02, "lighting the sky");
  await frame();

  const { scene: sc, sunLight: sun, sunVec } = createScene(renderer);
  scene = sc;
  sunLight = sun;
  await frame();

  // Build world in chunks so progress bar can animate
  const world = await new Promise((resolve) => {
    const built = buildWorld(scene, sunVec, sunLight, (p, msg) => {
      setProgress(0.1 + 0.8 * p, msg);
    });
    resolve(built);
  });
  solids = world.solids;
  windows = world.windows;
  lights = world.lights;
  await frame();

  // ---------- Player ----------
  setProgress(0.92, "polishing the boots");
  player = new Player(camera, canvas);
  player.setSolids(solids);
  // Spawn outside the front of the blush house, facing its open window.
  player.position.set(-17.5, 0, 24);
  player.yaw = 0;
  await frame();

  // ---------- Composer ----------
  setProgress(0.97, "polishing the lens");
  composer = createComposer(renderer, scene, camera).composer;
  await frame();

  // Debug handle — used by the smoke test to teleport the camera.
  window.__game = { player, camera, scene, solids, windows, lights };

  setProgress(1.0, "ready");
  setTimeout(() => {
    loadingEl.classList.add("gone");
    startEl.classList.remove("hidden");
  }, 350);

  // start render loop (interactive once user clicks Play)
  animate();
}

function frame() {
  return new Promise((res) => requestAnimationFrame(res));
}

// ---------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------
const clock = new THREE.Clock();
let lastPromptKey = "";
let promptTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (player) {
    player.update(dt);
    updateHUD(dt);
    cullLights();
  }

  if (composer) composer.render();
  else renderer.render(scene, camera);
}

// ---------------------------------------------------------------
// HUD updates
// ---------------------------------------------------------------
function updateHUD(dt) {
  // Stance
  const stance = player.stance();
  stanceEl.textContent = stance;

  // Compass
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const yaw = ((player.yaw + Math.PI * 2) % (Math.PI * 2));
  // yaw=0 looks -Z = north (our convention)
  const idx = Math.round(yaw / (Math.PI / 4)) % 8;
  compassEl.textContent = dirs[idx];

  // Window prompts
  promptTimer += dt;
  let activePrompt = null;
  for (const w of windows) {
    const d = w.pos.distanceTo(player.position);
    if (d < w.radius) {
      activePrompt = w;
      break;
    }
  }
  if (activePrompt) {
    let label = activePrompt.label;
    let key = activePrompt.needsCrouch && !player.crouching ? "C" : null;
    const html = key
      ? `<span class="key">${key}</span>${label}`
      : `<span style="opacity:.5">${label}</span>`;
    const id = label + (key || "");
    if (id !== lastPromptKey) {
      promptEl.innerHTML = html;
      lastPromptKey = id;
    }
    promptEl.classList.add("show");
  } else {
    promptEl.classList.remove("show");
    lastPromptKey = "";
  }
}

// ---------------------------------------------------------------
// Lights culling: only keep N nearest interior/lamp point-lights active
// to keep the per-frame light count manageable.
// ---------------------------------------------------------------
const MAX_ACTIVE_LIGHTS = 8;
const _tmpWP = new THREE.Vector3();
function cullLights() {
  if (!lights || lights.length === 0) return;
  const px = player.position.x;
  const py = player.position.y + 1.0;
  const pz = player.position.z;
  // Compute world positions and distances
  const scored = lights.map((l) => {
    l.light.getWorldPosition(_tmpWP);
    const dx = _tmpWP.x - px;
    const dy = _tmpWP.y - py;
    const dz = _tmpWP.z - pz;
    return { l, d: dx * dx + dy * dy + dz * dz };
  });
  scored.sort((a, b) => a.d - b.d);
  scored.forEach((s, rank) => {
    s.l.light.visible = rank < MAX_ACTIVE_LIGHTS;
  });
}

// ---------------------------------------------------------------
// Window resize
// ---------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------
// Start interaction
// ---------------------------------------------------------------
function startGame() {
  startEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  player.requestLock();
}
playBtn.addEventListener("click", startGame);
document.addEventListener("click", () => {
  if (startEl.classList.contains("hidden") && !document.pointerLockElement) {
    if (player) player.requestLock();
  }
});

boot();
