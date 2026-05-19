// Procedural textures + shared materials.
// We bake small canvases into THREE textures so surfaces have grain,
// brick mortar, wood rings, etc.  Cheap to make, expensive-looking on screen.

import * as THREE from "three";

const TEX_SIZE = 512;

function makeCanvas(size = TEX_SIZE) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeat = 1, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function toDataTexture(canvas, repeat = 1) {
  // Linear (for roughness/normal-ish maps)
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Simple value noise via averaged random points
function noise(ctx, size, scale, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // tiled noise (smooth random)
      const v = Math.random() * 255;
      d[i] = (d[i] * (1 - alpha) + v * alpha) | 0;
      d[i + 1] = (d[i + 1] * (1 - alpha) + v * alpha) | 0;
      d[i + 2] = (d[i + 2] * (1 - alpha) + v * alpha) | 0;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------
// BRICK
// ------------------------------------------------------------------
export function brickTexture(baseColor = "#8a3a2a", mortar = "#1f1815") {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = mortar;
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const rows = 12;
  const brickH = TEX_SIZE / rows;
  const brickW = brickH * 2.4;
  for (let row = 0; row < rows; row++) {
    const offset = (row % 2) * (brickW / 2);
    for (let col = -1; col < rows; col++) {
      const px = col * brickW + offset + 4;
      const py = row * brickH + 4;
      const w = brickW - 8;
      const h = brickH - 8;
      // brick color with variation
      const variance = (Math.random() - 0.5) * 30;
      const tint = shiftColor(baseColor, variance);
      x.fillStyle = tint;
      x.fillRect(px, py, w, h);
      // subtle grit
      x.fillStyle = "rgba(0,0,0,0.07)";
      for (let i = 0; i < 12; i++) {
        const gx = px + Math.random() * w;
        const gy = py + Math.random() * h;
        x.fillRect(gx, gy, 2, 1);
      }
      // top highlight
      x.fillStyle = "rgba(255,235,210,0.06)";
      x.fillRect(px, py, w, 2);
      // bottom shadow
      x.fillStyle = "rgba(0,0,0,0.18)";
      x.fillRect(px, py + h - 2, w, 2);
    }
  }
  return toTexture(c, 1);
}

function shiftColor(hex, delta) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff,
    g = (n >> 8) & 0xff,
    b = n & 0xff;
  r = Math.max(0, Math.min(255, r + delta));
  g = Math.max(0, Math.min(255, g + delta));
  b = Math.max(0, Math.min(255, b + delta));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ------------------------------------------------------------------
// WOOD
// ------------------------------------------------------------------
export function woodTexture(base = "#6b4a2b") {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // planks
  const planks = 6;
  const ph = TEX_SIZE / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    // plank tint
    x.fillStyle = shiftColor(base, (Math.random() - 0.5) * 28);
    x.fillRect(0, y, TEX_SIZE, ph);
    // grain lines
    for (let i = 0; i < 18; i++) {
      const gy = y + Math.random() * ph;
      x.strokeStyle = `rgba(40,22,10,${0.06 + Math.random() * 0.12})`;
      x.lineWidth = 0.7 + Math.random() * 1.2;
      x.beginPath();
      x.moveTo(0, gy);
      for (let xi = 0; xi < TEX_SIZE; xi += 8) {
        x.lineTo(xi, gy + Math.sin(xi * 0.04 + p) * 1.2);
      }
      x.stroke();
    }
    // knots
    if (Math.random() < 0.35) {
      const kx = Math.random() * TEX_SIZE;
      const ky = y + ph * 0.5;
      const grad = x.createRadialGradient(kx, ky, 1, kx, ky, 10);
      grad.addColorStop(0, "rgba(35,18,8,0.9)");
      grad.addColorStop(1, "rgba(35,18,8,0)");
      x.fillStyle = grad;
      x.beginPath();
      x.arc(kx, ky, 10, 0, Math.PI * 2);
      x.fill();
    }
    // seams
    x.fillStyle = "rgba(0,0,0,0.5)";
    x.fillRect(0, y, TEX_SIZE, 1);
    x.fillStyle = "rgba(255,255,255,0.04)";
    x.fillRect(0, y + 1, TEX_SIZE, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// PLASTER (interior walls)
// ------------------------------------------------------------------
export function plasterTexture(base = "#e6dccb") {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // very subtle noise
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  for (let i = 0; i < 2000; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// ASPHALT
// ------------------------------------------------------------------
export function asphaltTexture() {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = "#22232a";
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 8000; i++) {
    const v = 0.04 + Math.random() * 0.18;
    x.fillStyle = `rgba(255,255,255,${v})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// CONCRETE (sidewalk)
// ------------------------------------------------------------------
export function concreteTexture() {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = "#8a8475";
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 6000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  // expansion joints
  x.strokeStyle = "rgba(0,0,0,0.4)";
  x.lineWidth = 2;
  for (let s = 0; s < 4; s++) {
    x.beginPath();
    x.moveTo(0, (s * TEX_SIZE) / 4);
    x.lineTo(TEX_SIZE, (s * TEX_SIZE) / 4);
    x.stroke();
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// GRASS
// ------------------------------------------------------------------
export function grassTexture() {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = "#3e5a2a";
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 18000; i++) {
    const g = Math.random();
    const r = 40 + Math.random() * 40;
    const gr = 70 + Math.random() * 80;
    const b = 30 + Math.random() * 30;
    x.fillStyle = `rgba(${r},${gr},${b},${0.4 + g * 0.5})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  // sparse dirt
  for (let i = 0; i < 1500; i++) {
    x.fillStyle = `rgba(60,40,20,${Math.random() * 0.3})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// FABRIC (for upholstery)
// ------------------------------------------------------------------
export function fabricTexture(base = "#5a5466") {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // weave
  for (let y = 0; y < TEX_SIZE; y += 3) {
    x.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.06})`;
    x.fillRect(0, y, TEX_SIZE, 1);
  }
  for (let xi = 0; xi < TEX_SIZE; xi += 3) {
    x.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    x.fillRect(xi, 0, 1, TEX_SIZE);
  }
  for (let i = 0; i < 2000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// ROOF TILES
// ------------------------------------------------------------------
export function roofTileTexture(base = "#5a2f23") {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = "#1a0e0a";
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const rows = 16;
  const rh = TEX_SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (rh * 0.6);
    for (let col = -1; col < rows * 1.2; col++) {
      const px = col * rh * 1.2 + offset;
      const py = r * rh;
      const grad = x.createLinearGradient(px, py, px, py + rh);
      const tint = shiftColor(base, (Math.random() - 0.5) * 30);
      grad.addColorStop(0, tint);
      grad.addColorStop(0.7, tint);
      grad.addColorStop(1, shiftColor(base, -60));
      x.fillStyle = grad;
      x.beginPath();
      x.moveTo(px, py + rh);
      x.lineTo(px, py + rh * 0.4);
      x.quadraticCurveTo(px + rh * 0.6, py - rh * 0.1, px + rh * 1.2, py + rh * 0.4);
      x.lineTo(px + rh * 1.2, py + rh);
      x.closePath();
      x.fill();
    }
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// CARPET / RUG
// ------------------------------------------------------------------
export function rugTexture() {
  const c = makeCanvas();
  const x = c.getContext("2d");
  // Persian-ish rug pattern
  x.fillStyle = "#5a1a1a";
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Border
  x.strokeStyle = "#1a0a08";
  x.lineWidth = 18;
  x.strokeRect(20, 20, TEX_SIZE - 40, TEX_SIZE - 40);
  x.strokeStyle = "#c89060";
  x.lineWidth = 6;
  x.strokeRect(36, 36, TEX_SIZE - 72, TEX_SIZE - 72);

  // Inner motif
  x.fillStyle = "#2a0808";
  x.fillRect(80, 80, TEX_SIZE - 160, TEX_SIZE - 160);

  // Diamonds
  x.fillStyle = "#c89060";
  for (let i = 0; i < 5; i++) {
    const cx = TEX_SIZE / 2;
    const cy = 120 + i * 60;
    if (cy > TEX_SIZE - 120) break;
    x.beginPath();
    x.moveTo(cx, cy - 24);
    x.lineTo(cx + 32, cy);
    x.lineTo(cx, cy + 24);
    x.lineTo(cx - 32, cy);
    x.closePath();
    x.fill();
  }

  // noise
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// WALLPAPER (subtle pattern)
// ------------------------------------------------------------------
export function wallpaperTexture(base = "#e8d8bf", accent = "#a06e3a") {
  const c = makeCanvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // vertical stripes
  x.fillStyle = "rgba(0,0,0,0.05)";
  for (let i = 0; i < TEX_SIZE; i += 32) x.fillRect(i, 0, 1, TEX_SIZE);
  // floral dots
  x.fillStyle = accent;
  for (let y = 16; y < TEX_SIZE; y += 64) {
    for (let xi = 16; xi < TEX_SIZE; xi += 64) {
      const ox = xi + ((y / 64) % 2 ? 32 : 0);
      x.beginPath();
      x.arc(ox, y, 4, 0, Math.PI * 2);
      x.fill();
      // four petals
      x.beginPath();
      x.arc(ox - 8, y, 2, 0, Math.PI * 2);
      x.arc(ox + 8, y, 2, 0, Math.PI * 2);
      x.arc(ox, y - 8, 2, 0, Math.PI * 2);
      x.arc(ox, y + 8, 2, 0, Math.PI * 2);
      x.fill();
    }
  }
  // noise
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * TEX_SIZE, Math.random() * TEX_SIZE, 1, 1);
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// PAINTING (random abstract framed art)
// ------------------------------------------------------------------
export function paintingTexture(theme = "landscape") {
  const c = makeCanvas(256);
  const x = c.getContext("2d");
  if (theme === "landscape") {
    // sky
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#f3c279");
    g.addColorStop(0.5, "#d77b56");
    g.addColorStop(1, "#3a3168");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    // hills
    x.fillStyle = "#221a2a";
    x.beginPath();
    x.moveTo(0, 180);
    for (let i = 0; i <= 256; i += 16)
      x.lineTo(i, 180 + Math.sin(i * 0.04) * 18 + Math.random() * 6);
    x.lineTo(256, 256);
    x.lineTo(0, 256);
    x.closePath();
    x.fill();
    x.fillStyle = "#100a18";
    x.beginPath();
    x.moveTo(0, 210);
    for (let i = 0; i <= 256; i += 16)
      x.lineTo(i, 210 + Math.sin(i * 0.06 + 1) * 14 + Math.random() * 4);
    x.lineTo(256, 256);
    x.lineTo(0, 256);
    x.closePath();
    x.fill();
    // sun
    x.fillStyle = "#fde0a8";
    x.beginPath();
    x.arc(180, 130, 22, 0, Math.PI * 2);
    x.fill();
  } else {
    // abstract
    x.fillStyle = "#1c1a22";
    x.fillRect(0, 0, 256, 256);
    const colors = ["#a83a5a", "#3a6da8", "#d7b54e", "#5ea84a", "#e8e2d2"];
    for (let i = 0; i < 8; i++) {
      x.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      x.globalAlpha = 0.7;
      const w = 30 + Math.random() * 100;
      const h = 30 + Math.random() * 100;
      x.fillRect(
        Math.random() * (256 - w),
        Math.random() * (256 - h),
        w,
        h
      );
    }
    x.globalAlpha = 1;
  }
  return toTexture(c, 1);
}

// ------------------------------------------------------------------
// Material cache + shared materials
// ------------------------------------------------------------------
export class MaterialLibrary {
  constructor() {
    this.cache = {};
  }
  get(name) {
    if (this.cache[name]) return this.cache[name];
    let m;
    switch (name) {
      case "brick-red":
        m = new THREE.MeshStandardMaterial({
          map: brickTexture("#8a3a2a"),
          roughness: 0.92,
          metalness: 0.0,
        });
        m.map.repeat.set(2, 2);
        break;
      case "brick-cream":
        m = new THREE.MeshStandardMaterial({
          map: brickTexture("#c8b094", "#5b4a3a"),
          roughness: 0.9,
          metalness: 0.0,
        });
        m.map.repeat.set(2, 2);
        break;
      case "brick-grey":
        m = new THREE.MeshStandardMaterial({
          map: brickTexture("#6a6a6a", "#2a2a2a"),
          roughness: 0.92,
          metalness: 0.0,
        });
        m.map.repeat.set(2, 2);
        break;
      case "wood-oak":
        m = new THREE.MeshStandardMaterial({
          map: woodTexture("#7a5530"),
          roughness: 0.7,
          metalness: 0.0,
        });
        break;
      case "wood-walnut":
        m = new THREE.MeshStandardMaterial({
          map: woodTexture("#3a2618"),
          roughness: 0.55,
          metalness: 0.0,
        });
        break;
      case "wood-floor":
        m = new THREE.MeshStandardMaterial({
          map: woodTexture("#8a6238"),
          roughness: 0.45,
          metalness: 0.0,
        });
        m.map.repeat.set(3, 3);
        break;
      case "plaster":
        m = new THREE.MeshStandardMaterial({
          map: plasterTexture("#ece2cf"),
          roughness: 0.95,
        });
        break;
      case "wallpaper-cream":
        m = new THREE.MeshStandardMaterial({
          map: wallpaperTexture("#e8d8bf", "#a06e3a"),
          roughness: 0.92,
        });
        m.map.repeat.set(2, 2);
        break;
      case "wallpaper-sage":
        m = new THREE.MeshStandardMaterial({
          map: wallpaperTexture("#c8d6bf", "#5a7a4a"),
          roughness: 0.92,
        });
        m.map.repeat.set(2, 2);
        break;
      case "wallpaper-blush":
        m = new THREE.MeshStandardMaterial({
          map: wallpaperTexture("#e6c8c0", "#a66060"),
          roughness: 0.92,
        });
        m.map.repeat.set(2, 2);
        break;
      case "asphalt":
        m = new THREE.MeshStandardMaterial({
          map: asphaltTexture(),
          roughness: 0.85,
          metalness: 0.0,
        });
        m.map.repeat.set(20, 20);
        break;
      case "concrete":
        m = new THREE.MeshStandardMaterial({
          map: concreteTexture(),
          roughness: 0.85,
        });
        m.map.repeat.set(8, 8);
        break;
      case "grass":
        m = new THREE.MeshStandardMaterial({
          map: grassTexture(),
          roughness: 1.0,
        });
        m.map.repeat.set(30, 30);
        break;
      case "fabric-navy":
        m = new THREE.MeshStandardMaterial({
          map: fabricTexture("#2a3a5a"),
          roughness: 0.95,
        });
        m.map.repeat.set(2, 2);
        break;
      case "fabric-ochre":
        m = new THREE.MeshStandardMaterial({
          map: fabricTexture("#a86c2a"),
          roughness: 0.95,
        });
        m.map.repeat.set(2, 2);
        break;
      case "fabric-sage":
        m = new THREE.MeshStandardMaterial({
          map: fabricTexture("#5a6a4a"),
          roughness: 0.95,
        });
        m.map.repeat.set(2, 2);
        break;
      case "roof-terracotta":
        m = new THREE.MeshStandardMaterial({
          map: roofTileTexture("#7a3a28"),
          roughness: 0.75,
        });
        m.map.repeat.set(2, 2);
        break;
      case "roof-slate":
        m = new THREE.MeshStandardMaterial({
          map: roofTileTexture("#2c2e36"),
          roughness: 0.6,
        });
        m.map.repeat.set(2, 2);
        break;
      case "rug":
        m = new THREE.MeshStandardMaterial({
          map: rugTexture(),
          roughness: 0.98,
        });
        break;
      case "glass":
        m = new THREE.MeshPhysicalMaterial({
          color: 0xa0c4d8,
          roughness: 0.05,
          metalness: 0.0,
          transmission: 0.85,
          thickness: 0.05,
          ior: 1.45,
          transparent: true,
          opacity: 0.35,
          envMapIntensity: 1.2,
        });
        break;
      case "metal-brass":
        m = new THREE.MeshStandardMaterial({
          color: 0xc69a4c,
          roughness: 0.25,
          metalness: 0.95,
        });
        break;
      case "metal-iron":
        m = new THREE.MeshStandardMaterial({
          color: 0x232323,
          roughness: 0.5,
          metalness: 0.85,
        });
        break;
      case "lamp-warm":
        m = new THREE.MeshStandardMaterial({
          color: 0xffe7b0,
          emissive: 0xffc070,
          emissiveIntensity: 2.5,
          roughness: 0.5,
        });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    }
    this.cache[name] = m;
    return m;
  }
}
