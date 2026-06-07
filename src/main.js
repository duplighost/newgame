// Entry point: boots the renderer, the endless streamed city, the
// player, interaction and post-processing, then runs the loop.
// Adapts quality + input to the device (desktop mouse / mobile touch).

import * as THREE from "three";
import { createScene, followSun } from "./scene.js";
import { MaterialLibrary } from "./materials.js";
import { ChunkManager, CHUNK } from "./chunk.js";
import { Player } from "./player.js";
import { Interaction } from "./interaction.js";
import { createComposer } from "./postfx.js";
import { getSettings, getTier, setTier, effectivePR, PRESETS, IS_TOUCH } from "./settings.js";
import { setupTouch } from "./touch.js";

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

const SETTINGS = getSettings();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
renderer.setPixelRatio(effectivePR(SETTINGS));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = SETTINGS.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;

const camera = new THREE.PerspectiveCamera(IS_TOUCH ? 78 : 72, window.innerWidth / window.innerHeight, 0.05, SETTINGS.far);

let scene, sunLight, sunDir, mats, chunks, player, interaction, composer, touch;
const MAX_LIGHTS = SETTINGS.maxLights;
const solidScratch = [];
const _look = new THREE.Vector3();
const _wp = new THREE.Vector3();

function setProgress(p, msg) {
  loadFill.style.width = `${Math.round(p * 100)}%`;
  if (msg) loadStatus.textContent = msg;
}
const frame = () => new Promise((r) => requestAnimationFrame(r));

async function boot() {
  setupQualityUI();

  setProgress(0.05, "raising the sun");
  await frame();
  const sc = createScene(renderer, SETTINGS);
  scene = sc.scene;
  sunLight = sc.sunLight;
  sunDir = sc.sunDir;

  setProgress(0.12, "mixing the paint");
  await frame();
  mats = new MaterialLibrary();
  ["grass", "asphalt", "concrete", "brick-red", "wood-floor", "glass"].forEach((n) => mats.get(n));

  chunks = new ChunkManager(scene, mats, { loadR: SETTINGS.loadR, detailR: SETTINGS.detailR });
  player = new Player(camera, canvas);
  player.position.set(-6, 0, -CHUNK / 2 + 3.5);
  player.yaw = Math.PI;
  interaction = new Interaction();

  setProgress(0.2, "building the city");
  await frame();
  const totalWant = (2 * SETTINGS.loadR + 1) ** 2;
  for (let i = 0; i < 80; i++) {
    chunks.update(player.position, 6);
    const built = chunks.chunks.size;
    setProgress(0.2 + 0.7 * Math.min(1, built / totalWant), "building the city");
    await frame();
    if (built >= totalWant) break;
  }

  setProgress(0.95, "polishing the lens");
  await frame();
  composer = createComposer(renderer, scene, camera, SETTINGS).composer;

  if (IS_TOUCH) {
    touch = setupTouch(player, {
      onInteract: () => {
        if (interaction.current) interaction.toggle(interaction.current);
      },
    });
  }

  window.__game = { player, chunks, camera, scene, interaction, settings: SETTINGS };

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
    chunks.update(player.position, 2);
    chunks.collectSolids(player.position.x, player.position.z, solidScratch);
    player.setSolids(solidScratch);
    player.update(dt);
    if (touch) touch.syncCrouch(player.crouching);

    followSun(sunLight, sunDir, player.position);

    activeTimer -= dt;
    if (activeTimer <= 0) {
      active = chunks.collectActive(player.position.x, player.position.z);
      activeTimer = 0.15;
    }
    cullLights(active.lights);
    flicker(active.lights, dt);

    player.lookDir(_look);
    const focus = interaction.pick(player.position, _look, active.interact);

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
  const yaw = ((player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  compassEl.textContent = DIRS[Math.round(yaw / (Math.PI / 4)) % 8];

  let html = "";
  let interactLabel = null;
  if (focus) {
    const verb = focus.isOpen ? "close" : focus.prompt;
    interactLabel = verb;
    html = IS_TOUCH ? `<span style="opacity:.85">${verb}</span>` : `<span class="key">E</span>${verb}`;
  } else {
    let near = null;
    for (const w of active.windows) {
      if (w.worldPos && w.worldPos.distanceTo(player.position) < w.radius) {
        near = w;
        break;
      }
    }
    if (near) {
      if (!player.crouching) html = IS_TOUCH ? `<span style="opacity:.85">crouch to crawl in</span>` : `<span class="key">C</span>crouch to crawl in`;
      else html = `<span style="opacity:.6">crawl through</span>`;
    }
  }
  if (touch) touch.setInteract(!!focus, interactLabel || "open");
  if (html) {
    promptEl.innerHTML = html;
    promptEl.classList.add("show");
  } else {
    promptEl.classList.remove("show");
  }
}

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

// ---- quality selector on the start card ----
function setupQualityUI() {
  const row = document.getElementById("quality");
  if (!row) return;
  const cur = getTier();
  row.querySelectorAll("button[data-tier]").forEach((b) => {
    if (b.dataset.tier === cur) b.classList.add("on");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = b.dataset.tier;
      if (t === getTier()) return;
      setTier(t);
      location.reload();
    });
  });
}

function startGame() {
  startEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  if (touch) touch.show();
  if (!IS_TOUCH) player.requestLock();
}
playBtn.addEventListener("click", startGame);
// desktop: clicking the world re-captures the mouse. Skip on touch.
document.addEventListener("click", () => {
  if (!IS_TOUCH && startEl.classList.contains("hidden") && !document.pointerLockElement && player) player.requestLock();
});

boot();
