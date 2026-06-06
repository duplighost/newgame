// Entry point: boots the renderer, the endless streamed city, the
// player, interaction and post-processing, then runs the loop.

import * as THREE from "three";
import { createScene, followSun } from "./scene.js";
import { MaterialLibrary } from "./materials.js";
import { ChunkManager, CHUNK } from "./chunk.js";
import { Player } from "./player.js";
import { Interaction } from "./interaction.js";
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 600);

let scene, sunLight, sunDir, mats, chunks, player, interaction, composer;
const solidScratch = [];
const _look = new THREE.Vector3();
const _wp = new THREE.Vector3();

function setProgress(p, msg) {
  loadFill.style.width = `${Math.round(p * 100)}%`;
  if (msg) loadStatus.textContent = msg;
}
const frame = () => new Promise((r) => requestAnimationFrame(r));

async function boot() {
  setProgress(0.05, "raising the sun");
  await frame();
  const sc = createScene(renderer);
  scene = sc.scene;
  sunLight = sc.sunLight;
  sunDir = sc.sunDir;

  setProgress(0.12, "mixing the paint");
  await frame();
  mats = new MaterialLibrary();
  // warm up a few core materials so the first chunk builds quickly
  ["grass", "asphalt", "concrete", "brick-red", "wood-floor", "glass"].forEach((n) => mats.get(n));

  chunks = new ChunkManager(scene, mats);
  player = new Player(camera, canvas);
  player.position.set(-6, 0, -CHUNK / 2 + 3.5); // on the south road of chunk (0,0)
  player.yaw = Math.PI; // look north, toward the homes
  interaction = new Interaction();

  // Build the neighbourhood around spawn before revealing the world.
  setProgress(0.2, "building the city");
  await frame();
  let built = 0;
  const totalWant = (2 * 3 + 1) ** 2;
  for (let i = 0; i < 60; i++) {
    chunks.update(player.position, 6);
    built = chunks.chunks.size;
    setProgress(0.2 + 0.7 * Math.min(1, built / totalWant), "building the city");
    await frame();
    if (built >= totalWant) break;
  }

  setProgress(0.95, "polishing the lens");
  await frame();
  composer = createComposer(renderer, scene, camera).composer;

  window.__game = { player, chunks, camera, scene, interaction };

  setProgress(1, "ready");
  setTimeout(() => {
    loadingEl.classList.add("gone");
    startEl.classList.remove("hidden");
  }, 300);

  animate();
}

const clock = new THREE.Clock();
let prevE = false;
let active = { interact: [], windows: [], lights: [] };
let activeTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (player) {
    // stream chunks around the player
    chunks.update(player.position, 2);

    // collision set from nearby chunks
    chunks.collectSolids(player.position.x, player.position.z, solidScratch);
    player.setSolids(solidScratch);
    player.update(dt);

    followSun(sunLight, sunDir, player.position);

    // refresh interactables/windows/lights a few times a second
    activeTimer -= dt;
    if (activeTimer <= 0) {
      active = chunks.collectActive(player.position.x, player.position.z);
      activeTimer = 0.15;
    }
    cullLights(active.lights);
    flicker(active.lights, dt);

    // interaction focus
    player.lookDir(_look);
    const focus = interaction.pick(player.position, _look, active.interact);

    // E to toggle
    const eDown = !!player.keys.KeyE;
    if (eDown && !prevE && focus) interaction.toggle(focus);
    prevE = eDown;
    interaction.update(dt);

    updateHUD(focus);
  }

  if (composer) composer.render();
  else if (scene) renderer.render(scene, camera);
}

const DIRS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
function updateHUD(focus) {
  stanceEl.textContent = player.stance();

  // compass: yaw 0 looks -Z (north in our world labels). Map to letters.
  const yaw = ((player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  compassEl.textContent = DIRS[Math.round(yaw / (Math.PI / 4)) % 8];

  let html = "";
  if (focus) {
    const verb = focus.isOpen ? "close" : focus.prompt;
    html = `<span class="key">E</span>${verb}`;
  } else {
    // crawl-window hint
    let near = null;
    for (const w of active.windows) {
      if (!w.worldPos) continue;
      if (w.worldPos.distanceTo(player.position) < w.radius) {
        near = w;
        break;
      }
    }
    if (near) {
      if (!player.crouching) html = `<span class="key">C</span>crouch to crawl in`;
      else html = `<span style="opacity:.6">crawl through</span>`;
    }
  }
  if (html) {
    promptEl.innerHTML = html;
    promptEl.classList.add("show");
  } else {
    promptEl.classList.remove("show");
  }
}

const MAX_LIGHTS = 9;
function cullLights(lights) {
  if (!lights.length) return;
  const px = player.position.x,
    py = player.position.y + 1.2,
    pz = player.position.z;
  for (const l of lights) {
    l.light.getWorldPosition(_wp);
    l._d = (_wp.x - px) ** 2 + (_wp.y - py) ** 2 + (_wp.z - pz) ** 2;
  }
  lights.sort((a, b) => a._d - b._d);
  for (let i = 0; i < lights.length; i++) lights[i].light.visible = i < MAX_LIGHTS;
}

function flicker(lights, dt) {
  for (const l of lights) {
    if (!l.flicker || !l.light.visible) continue;
    l._base = l._base ?? l.light.intensity;
    l.light.intensity = l._base * (0.8 + Math.random() * 0.4);
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

function startGame() {
  startEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  player.requestLock();
}
playBtn.addEventListener("click", startGame);
document.addEventListener("click", () => {
  if (startEl.classList.contains("hidden") && !document.pointerLockElement && player) player.requestLock();
});

boot();
