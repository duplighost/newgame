// Procedural textures + shared materials.
//
// Everything is painted onto small canvases and baked into THREE
// textures: colour (albedo) maps plus matching normal maps derived from
// a height field, so brick, plaster and floorboards actually catch the
// light instead of looking like flat stickers.

import * as THREE from "three";

const TEX = 512;

function canvas(size = TEX) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function albedo(c, repeat = 1, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function linearTex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Derive a tangent-space normal map from a grayscale height canvas
// using a Sobel gradient.  strength scales the bump.
function heightToNormal(heightCanvas, strength = 2.0) {
  const size = heightCanvas.width;
  const hctx = heightCanvas.getContext("2d");
  const src = hctx.getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext("2d");
  const dst = octx.createImageData(size, size);
  const d = dst.data;
  const lum = (x, y) => {
    x = (x + size) % size;
    y = (y + size) % size;
    const i = (y * size + x) * 4;
    return (src[i] + src[i + 1] + src[i + 2]) / 765; // 0..1
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = lum(x - 1, y - 1),
        t = lum(x, y - 1),
        tr = lum(x + 1, y - 1);
      const l = lum(x - 1, y),
        r = lum(x + 1, y);
      const bl = lum(x - 1, y + 1),
        b = lum(x, y + 1),
        br = lum(x + 1, y + 1);
      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);
      const nx = dx * strength;
      const ny = dy * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      d[i] = ((nx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  return linearTex(out);
}

function shift(hex, delta) {
  if (hex[0] === "#") {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    r = Math.max(0, Math.min(255, r + delta));
    g = Math.max(0, Math.min(255, g + delta));
    b = Math.max(0, Math.min(255, b + delta));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  return hex;
}

// ------------------------------------------------------------------ BRICK
function brick(base = "#8a3a2a", mortar = "#241c18") {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = mortar;
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#202020"; // mortar = recessed (dark)
  hx.fillRect(0, 0, TEX, TEX);

  const rows = 12;
  const bh = TEX / rows;
  const bw = bh * 2.4;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < rows; col++) {
      const px = col * bw + off + 4;
      const py = row * bh + 4;
      const w = bw - 8,
        hgt = bh - 8;
      x.fillStyle = shift(base, (Math.random() - 0.5) * 28);
      x.fillRect(px, py, w, hgt);
      hx.fillStyle = `rgb(${180 + ((Math.random() * 40) | 0)},${180},${180})`;
      hx.fillRect(px, py, w, hgt);
      // grit
      x.fillStyle = "rgba(0,0,0,0.06)";
      for (let i = 0; i < 10; i++)
        x.fillRect(px + Math.random() * w, py + Math.random() * hgt, 2, 1);
      x.fillStyle = "rgba(255,235,210,0.05)";
      x.fillRect(px, py, w, 2);
      x.fillStyle = "rgba(0,0,0,0.16)";
      x.fillRect(px, py + hgt - 2, w, 2);
    }
  }
  return { map: albedo(c), normal: heightToNormal(h, 0.6) };
}

// ------------------------------------------------------------------ WOOD
function wood(base = "#6b4a2b", planks = 6) {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#b8b8b8";
  hx.fillRect(0, 0, TEX, TEX);
  const ph = TEX / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * ph;
    x.fillStyle = shift(base, (Math.random() - 0.5) * 26);
    x.fillRect(0, y, TEX, ph);
    for (let i = 0; i < 22; i++) {
      const gy = y + Math.random() * ph;
      x.strokeStyle = `rgba(40,22,10,${0.05 + Math.random() * 0.12})`;
      x.lineWidth = 0.6 + Math.random() * 1.1;
      x.beginPath();
      x.moveTo(0, gy);
      for (let xi = 0; xi < TEX; xi += 8)
        x.lineTo(xi, gy + Math.sin(xi * 0.04 + p) * 1.1);
      x.stroke();
    }
    if (Math.random() < 0.3) {
      const kx = Math.random() * TEX,
        ky = y + ph * 0.5;
      const g = x.createRadialGradient(kx, ky, 1, kx, ky, 9);
      g.addColorStop(0, "rgba(35,18,8,0.9)");
      g.addColorStop(1, "rgba(35,18,8,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(kx, ky, 9, 0, 7);
      x.fill();
    }
    // plank seams (height grooves)
    x.fillStyle = "rgba(0,0,0,0.5)";
    x.fillRect(0, y, TEX, 1);
    x.fillStyle = "rgba(255,255,255,0.04)";
    x.fillRect(0, y + 1, TEX, 1);
    hx.fillStyle = "#404040";
    hx.fillRect(0, y, TEX, 2);
  }
  return { map: albedo(c), normal: heightToNormal(h, 0.8) };
}

// ------------------------------------------------------------------ PLASTER
function plaster(base = "#ece2cf") {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 6000; i++) {
    const a = Math.random() * 0.05;
    x.fillStyle = `rgba(0,0,0,${a})`;
    const px = Math.random() * TEX,
      py = Math.random() * TEX;
    x.fillRect(px, py, 1, 1);
    hx.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${a * 3})`;
    hx.fillRect(px, py, 2, 2);
  }
  return { map: albedo(c), normal: heightToNormal(h, 0.4) };
}

// ------------------------------------------------------------------ WALLPAPER
function wallpaper(base = "#e8d8bf", accent = "#a06e3a", pattern = "floral") {
  const c = canvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX, TEX);
  if (pattern === "stripe") {
    for (let i = 0; i < TEX; i += 26) {
      x.fillStyle = i % 52 ? shift(base, -10) : accent;
      x.globalAlpha = i % 52 ? 1 : 0.25;
      x.fillRect(i, 0, 13, TEX);
      x.globalAlpha = 1;
    }
  } else if (pattern === "damask") {
    x.fillStyle = accent;
    x.globalAlpha = 0.3;
    for (let y = 24; y < TEX; y += 80) {
      for (let xi = 24; xi < TEX; xi += 80) {
        const ox = xi + ((y / 80) % 2 ? 40 : 0);
        x.beginPath();
        x.ellipse(ox, y, 10, 18, 0, 0, 7);
        x.fill();
        x.beginPath();
        x.ellipse(ox, y - 20, 6, 10, 0, 0, 7);
        x.fill();
      }
    }
    x.globalAlpha = 1;
  } else {
    x.fillStyle = "rgba(0,0,0,0.04)";
    for (let i = 0; i < TEX; i += 32) x.fillRect(i, 0, 1, TEX);
    x.fillStyle = accent;
    for (let y = 16; y < TEX; y += 64) {
      for (let xi = 16; xi < TEX; xi += 64) {
        const ox = xi + ((y / 64) % 2 ? 32 : 0);
        x.beginPath();
        x.arc(ox, y, 4, 0, 7);
        x.arc(ox - 8, y, 2, 0, 7);
        x.arc(ox + 8, y, 2, 0, 7);
        x.arc(ox, y - 8, 2, 0, 7);
        x.arc(ox, y + 8, 2, 0, 7);
        x.fill();
      }
    }
  }
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 1, 1);
  }
  return albedo(c);
}

// ------------------------------------------------------------------ ASPHALT
function asphalt() {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = "#23242b";
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 9000; i++) {
    const v = 0.04 + Math.random() * 0.18;
    const px = Math.random() * TEX,
      py = Math.random() * TEX;
    x.fillStyle = `rgba(255,255,255,${v})`;
    x.fillRect(px, py, 1, 1);
    hx.fillStyle = `rgba(255,255,255,${v})`;
    hx.fillRect(px, py, 1, 1);
  }
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 1, 1);
  }
  return { map: albedo(c), normal: heightToNormal(h, 0.5) };
}

// ------------------------------------------------------------------ CONCRETE
function concrete(base = "#8a8475") {
  const c = canvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 6000; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 1, 1);
  }
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 1, 1);
  }
  x.strokeStyle = "rgba(0,0,0,0.35)";
  x.lineWidth = 2;
  for (let s = 1; s < 4; s++) {
    x.beginPath();
    x.moveTo(0, (s * TEX) / 4);
    x.lineTo(TEX, (s * TEX) / 4);
    x.stroke();
    x.beginPath();
    x.moveTo((s * TEX) / 4, 0);
    x.lineTo((s * TEX) / 4, TEX);
    x.stroke();
  }
  return albedo(c);
}

// ------------------------------------------------------------------ GRASS
function grass(base = [0x3e, 0x5a, 0x2a]) {
  const c = canvas();
  const x = c.getContext("2d");
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  x.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 20000; i++) {
    const r = base[0] - 10 + Math.random() * 30;
    const g = base[1] - 10 + Math.random() * 60;
    const b = base[2] - 10 + Math.random() * 26;
    x.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.4 + Math.random() * 0.5})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 1, 2);
  }
  for (let i = 0; i < 1200; i++) {
    x.fillStyle = `rgba(70,50,26,${Math.random() * 0.3})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 2, 2);
  }
  return albedo(c);
}

// ------------------------------------------------------------------ FABRIC
function fabric(base = "#5a5466") {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, TEX, TEX);
  for (let y = 0; y < TEX; y += 3) {
    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`;
    x.fillRect(0, y, TEX, 1);
    hx.fillStyle = "rgba(0,0,0,0.3)";
    hx.fillRect(0, y, TEX, 1);
  }
  for (let xi = 0; xi < TEX; xi += 3) {
    x.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    x.fillRect(xi, 0, 1, TEX);
    hx.fillStyle = "rgba(255,255,255,0.25)";
    hx.fillRect(xi, 0, 1, TEX);
  }
  return { map: albedo(c), normal: heightToNormal(h, 0.5) };
}

// ------------------------------------------------------------------ ROOF TILE
function roofTile(base = "#5a2f23") {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = "#1a0e0a";
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#404040";
  hx.fillRect(0, 0, TEX, TEX);
  const rows = 16,
    rh = TEX / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (rh * 0.6);
    for (let col = -1; col < rows * 1.2; col++) {
      const px = col * rh * 1.2 + off,
        py = r * rh;
      const g = x.createLinearGradient(px, py, px, py + rh);
      const tint = shift(base, (Math.random() - 0.5) * 28);
      g.addColorStop(0, tint);
      g.addColorStop(0.7, tint);
      g.addColorStop(1, shift(base, -55));
      x.fillStyle = g;
      const hg = hx.createLinearGradient(px, py, px, py + rh);
      hg.addColorStop(0, "#d0d0d0");
      hg.addColorStop(1, "#303030");
      hx.fillStyle = hg;
      const draw = (ctx) => {
        ctx.beginPath();
        ctx.moveTo(px, py + rh);
        ctx.lineTo(px, py + rh * 0.4);
        ctx.quadraticCurveTo(px + rh * 0.6, py - rh * 0.1, px + rh * 1.2, py + rh * 0.4);
        ctx.lineTo(px + rh * 1.2, py + rh);
        ctx.closePath();
        ctx.fill();
      };
      draw(x);
      draw(hx);
    }
  }
  return { map: albedo(c), normal: heightToNormal(h, 1.2) };
}

// ------------------------------------------------------------------ RUG
function rug(rng = Math.random) {
  const palettes = [
    ["#5a1a1a", "#2a0808", "#c89060", "#1a0a08"],
    ["#1a2a4a", "#0a1428", "#b0a060", "#08101e"],
    ["#1a3a2a", "#0a1e14", "#c0a070", "#081410"],
    ["#4a2a4a", "#240f24", "#c0a0b0", "#140814"],
  ];
  const pal = palettes[Math.floor(rng() * palettes.length)];
  const c = canvas();
  const x = c.getContext("2d");
  x.fillStyle = pal[0];
  x.fillRect(0, 0, TEX, TEX);
  x.strokeStyle = pal[3];
  x.lineWidth = 18;
  x.strokeRect(20, 20, TEX - 40, TEX - 40);
  x.strokeStyle = pal[2];
  x.lineWidth = 6;
  x.strokeRect(36, 36, TEX - 72, TEX - 72);
  x.fillStyle = pal[1];
  x.fillRect(80, 80, TEX - 160, TEX - 160);
  x.fillStyle = pal[2];
  for (let i = 0; i < 6; i++) {
    const cx = TEX / 2,
      cy = 110 + i * 56;
    if (cy > TEX - 110) break;
    x.beginPath();
    x.moveTo(cx, cy - 22);
    x.lineTo(cx + 30, cy);
    x.lineTo(cx, cy + 22);
    x.lineTo(cx - 30, cy);
    x.closePath();
    x.fill();
  }
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `rgba(0,0,0,${rng() * 0.18})`;
    x.fillRect(rng() * TEX, rng() * TEX, 1, 1);
  }
  return albedo(c);
}

// ------------------------------------------------------------------ TILE (kitchen/bath)
function tile(base = "#e8e8e0", grout = "#b0ada0", n = 8) {
  const c = canvas();
  const h = canvas();
  const x = c.getContext("2d");
  const hx = h.getContext("2d");
  x.fillStyle = grout;
  x.fillRect(0, 0, TEX, TEX);
  hx.fillStyle = "#303030";
  hx.fillRect(0, 0, TEX, TEX);
  const s = TEX / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.fillStyle = shift(base, (Math.random() - 0.5) * 14);
      x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      hx.fillStyle = "#d0d0d0";
      hx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      x.fillStyle = "rgba(255,255,255,0.18)";
      x.fillRect(i * s + 2, j * s + 2, s - 4, 2);
    }
  return { map: albedo(c), normal: heightToNormal(h, 1.0) };
}

// ------------------------------------------------------------------ MARBLE / GRANITE
function stoneSlab(base = "#2a2a30", vein = "#6a6a76") {
  const c = canvas();
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    x.fillRect(Math.random() * TEX, Math.random() * TEX, 1, 1);
  }
  for (let v = 0; v < 14; v++) {
    x.strokeStyle = `rgba(${parseInt(vein.slice(1, 3), 16)},${parseInt(
      vein.slice(3, 5),
      16
    )},${parseInt(vein.slice(5, 7), 16)},${0.2 + Math.random() * 0.3})`;
    x.lineWidth = 0.5 + Math.random() * 2;
    x.beginPath();
    let px = Math.random() * TEX,
      py = 0;
    x.moveTo(px, py);
    while (py < TEX) {
      px += (Math.random() - 0.5) * 40;
      py += 10 + Math.random() * 20;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  return albedo(c);
}

// ------------------------------------------------------------------ ART
function painting(theme = "landscape", rng = Math.random) {
  const c = canvas(256);
  const x = c.getContext("2d");
  if (theme === "landscape") {
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#f3c279");
    g.addColorStop(0.5, "#d77b56");
    g.addColorStop(1, "#3a3168");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#221a2a";
    x.beginPath();
    x.moveTo(0, 180);
    for (let i = 0; i <= 256; i += 16)
      x.lineTo(i, 180 + Math.sin(i * 0.04) * 18 + rng() * 6);
    x.lineTo(256, 256);
    x.lineTo(0, 256);
    x.fill();
    x.fillStyle = "#100a18";
    x.beginPath();
    x.moveTo(0, 210);
    for (let i = 0; i <= 256; i += 16)
      x.lineTo(i, 210 + Math.sin(i * 0.06 + 1) * 14 + rng() * 4);
    x.lineTo(256, 256);
    x.lineTo(0, 256);
    x.fill();
    x.fillStyle = "#fde0a8";
    x.beginPath();
    x.arc(180, 130, 22, 0, 7);
    x.fill();
  } else if (theme === "portrait") {
    x.fillStyle = "#2a2620";
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#d8b89a";
    x.beginPath();
    x.ellipse(128, 120, 42, 54, 0, 0, 7);
    x.fill();
    x.fillStyle = "#3a2a1a";
    x.beginPath();
    x.ellipse(128, 86, 46, 30, 0, 0, 7);
    x.fill();
    x.fillStyle = "#1a2a3a";
    x.beginPath();
    x.moveTo(128, 150);
    x.lineTo(196, 256);
    x.lineTo(60, 256);
    x.fill();
  } else {
    x.fillStyle = "#1c1a22";
    x.fillRect(0, 0, 256, 256);
    const cols = ["#a83a5a", "#3a6da8", "#d7b54e", "#5ea84a", "#e8e2d2"];
    for (let i = 0; i < 9; i++) {
      x.fillStyle = cols[(rng() * cols.length) | 0];
      x.globalAlpha = 0.7;
      const w = 30 + rng() * 100,
        h = 30 + rng() * 100;
      x.fillRect(rng() * (256 - w), rng() * (256 - h), w, h);
    }
    x.globalAlpha = 1;
  }
  return albedo(c);
}

// ------------------------------------------------------------------ FRAMED WINDOW VIEW (for lit decorative windows)
function curtainGlow() {
  const c = canvas(128);
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#fff2d0");
  g.addColorStop(1, "#f0b060");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = "rgba(120,80,40,0.5)";
  for (let i = 16; i < 128; i += 28) x.fillRect(i, 0, 8, 128);
  return albedo(c);
}

// ------------------------------------------------------------------ Material library
export class MaterialLibrary {
  constructor() {
    this.cache = {};
    this.tintCache = {};
  }

  _pbr(key, fn, opts) {
    if (this.cache[key]) return this.cache[key];
    const tex = fn();
    const m = new THREE.MeshStandardMaterial({
      map: tex.map || tex,
      normalMap: tex.normal || null,
      ...opts,
    });
    if (tex.normal && opts.normalScale)
      m.normalScale = new THREE.Vector2(opts.normalScale, opts.normalScale);
    this.cache[key] = m;
    return m;
  }

  // Generic tinted standard material, cached by colour+params.
  tinted(hex, { roughness = 0.85, metalness = 0.0, emissive = null, emissiveIntensity = 1 } = {}) {
    const key = `t:${hex}:${roughness}:${metalness}:${emissive}:${emissiveIntensity}`;
    if (this.tintCache[key]) return this.tintCache[key];
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness,
      metalness,
    });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    this.tintCache[key] = m;
    return m;
  }

  get(name) {
    if (this.cache[name]) return this.cache[name];
    let m;
    switch (name) {
      // ---- brick variants
      case "brick-red":
        return this._setRepeat(this._pbr(name, () => brick("#8a3a2a"), { roughness: 0.93, metalness: 0, normalScale: 0.4 }), 2);
      case "brick-cream":
        return this._setRepeat(this._pbr(name, () => brick("#c8b094", "#5b4a3a"), { roughness: 0.9, normalScale: 0.4 }), 2);
      case "brick-grey":
        return this._setRepeat(this._pbr(name, () => brick("#6a6a6a", "#2a2a2a"), { roughness: 0.92, normalScale: 0.4 }), 2);
      case "brick-brown":
        return this._setRepeat(this._pbr(name, () => brick("#6e4632", "#241712"), { roughness: 0.92, normalScale: 0.4 }), 2);
      case "brick-buff":
        return this._setRepeat(this._pbr(name, () => brick("#b6895a", "#4a3424"), { roughness: 0.9, normalScale: 0.4 }), 2);
      // ---- wood
      case "wood-oak":
        return this._pbr(name, () => wood("#7a5530"), { roughness: 0.7, normalScale: 0.5 });
      case "wood-walnut":
        return this._pbr(name, () => wood("#3a2618"), { roughness: 0.5, normalScale: 0.5 });
      case "wood-pine":
        return this._pbr(name, () => wood("#b08a52"), { roughness: 0.65, normalScale: 0.5 });
      case "wood-floor":
        return this._setRepeat(this._pbr(name, () => wood("#8a6238", 8), { roughness: 0.4, normalScale: 0.6 }), 3);
      case "wood-floor-dark":
        return this._setRepeat(this._pbr(name, () => wood("#4a3420", 8), { roughness: 0.38, normalScale: 0.6 }), 3);
      case "wood-floor-ash":
        return this._setRepeat(this._pbr(name, () => wood("#b59a72", 8), { roughness: 0.45, normalScale: 0.6 }), 3);
      // ---- plaster / interior walls
      case "plaster":
        return this._pbr(name, () => plaster("#ece2cf"), { roughness: 0.95, normalScale: 0.4 });
      case "ceiling":
        return this._pbr(name, () => plaster("#f4efe6"), { roughness: 0.97, normalScale: 0.3 });
      // ---- wallpapers
      case "wp-cream":
        return this._setRepeat(this._tex(name, () => wallpaper("#e8d8bf", "#a06e3a", "floral"), 0.92), 2);
      case "wp-sage":
        return this._setRepeat(this._tex(name, () => wallpaper("#c6d4bd", "#5a7a4a", "damask"), 0.92), 2);
      case "wp-blush":
        return this._setRepeat(this._tex(name, () => wallpaper("#e6c8c0", "#a66060", "floral"), 0.92), 2);
      case "wp-blue":
        return this._setRepeat(this._tex(name, () => wallpaper("#c4d2e0", "#3a5a7a", "stripe"), 0.92), 2);
      case "wp-ochre":
        return this._setRepeat(this._tex(name, () => wallpaper("#e6cf9a", "#9a6a2a", "damask"), 0.92), 2);
      case "wp-slate":
        return this._setRepeat(this._tex(name, () => wallpaper("#5a5e66", "#2a2e36", "stripe"), 0.9), 2);
      // ---- ground
      case "asphalt":
        return this._setRepeat(this._pbr(name, () => asphalt(), { roughness: 0.9, normalScale: 0.4 }), 6);
      case "concrete":
        return this._setRepeat(this._tex(name, () => concrete(), 0.88), 4);
      case "concrete-dark":
        return this._setRepeat(this._tex(name, () => concrete("#5a574e"), 0.9), 4);
      case "grass":
        return this._setRepeat(this._tex(name, () => grass(), 1.0), 8);
      case "grass-dry":
        return this._setRepeat(this._tex(name, () => grass([0x6a, 0x6a, 0x32]), 1.0), 8);
      // ---- upholstery
      case "fab-navy":
        return this._setRepeat(this._pbr(name, () => fabric("#2a3a5a"), { roughness: 0.95, normalScale: 0.6 }), 2);
      case "fab-ochre":
        return this._setRepeat(this._pbr(name, () => fabric("#a86c2a"), { roughness: 0.95, normalScale: 0.6 }), 2);
      case "fab-sage":
        return this._setRepeat(this._pbr(name, () => fabric("#5a6a4a"), { roughness: 0.95, normalScale: 0.6 }), 2);
      case "fab-rust":
        return this._setRepeat(this._pbr(name, () => fabric("#8a3a2a"), { roughness: 0.95, normalScale: 0.6 }), 2);
      case "fab-grey":
        return this._setRepeat(this._pbr(name, () => fabric("#6a6a70"), { roughness: 0.95, normalScale: 0.6 }), 2);
      case "fab-cream":
        return this._setRepeat(this._pbr(name, () => fabric("#c8bca0"), { roughness: 0.95, normalScale: 0.6 }), 2);
      // ---- roofs
      case "roof-terracotta":
        return this._setRepeat(this._pbr(name, () => roofTile("#7a3a28"), { roughness: 0.78, normalScale: 1 }), 2);
      case "roof-slate":
        return this._setRepeat(this._pbr(name, () => roofTile("#2c2e36"), { roughness: 0.6, normalScale: 1 }), 2);
      case "roof-green":
        return this._setRepeat(this._pbr(name, () => roofTile("#3a5a4a"), { roughness: 0.7, normalScale: 1 }), 2);
      // ---- tile
      case "tile-white":
        return this._setRepeat(this._pbr(name, () => tile("#eef0ee", "#b0ada0", 8), { roughness: 0.35, normalScale: 0.8 }), 2);
      case "tile-check":
        return this._setRepeat(this._pbr(name, () => tile("#d8d4c8", "#3a3a3a", 6), { roughness: 0.4, normalScale: 0.8 }), 2);
      case "tile-blue":
        return this._setRepeat(this._pbr(name, () => tile("#b8cdd8", "#7a8a90", 8), { roughness: 0.35, normalScale: 0.8 }), 2);
      // ---- stone
      case "granite":
        return this._setRepeat(this._tex(name, () => stoneSlab("#2a2a30", "#7a7a86"), 0.3, 0.1), 1);
      case "marble":
        return this._setRepeat(this._tex(name, () => stoneSlab("#e8e6e0", "#b0b0b8"), 0.2, 0.0), 1);
      // ---- rugs (each call randomised → cache a few)
      case "rug":
        return this._tex(name, () => rug(), 0.98);
      // ---- glass / metal / misc
      case "glass":
        m = new THREE.MeshPhysicalMaterial({
          color: 0xaecad8,
          roughness: 0.04,
          metalness: 0,
          transmission: 0.9,
          thickness: 0.04,
          ior: 1.45,
          transparent: true,
          opacity: 0.32,
          envMapIntensity: 1.4,
        });
        break;
      case "mirror":
        m = new THREE.MeshStandardMaterial({ color: 0xc8d0d4, roughness: 0.02, metalness: 1.0, envMapIntensity: 1.5 });
        break;
      case "brass":
        m = new THREE.MeshStandardMaterial({ color: 0xc69a4c, roughness: 0.25, metalness: 0.95 });
        break;
      case "chrome":
        m = new THREE.MeshStandardMaterial({ color: 0xd8dadf, roughness: 0.1, metalness: 1.0, envMapIntensity: 1.4 });
        break;
      case "iron":
        m = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.5, metalness: 0.85 });
        break;
      case "steel":
        m = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.32, metalness: 0.9 });
        break;
      case "copper":
        m = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.35, metalness: 0.9 });
        break;
      case "lamp-warm":
        m = new THREE.MeshStandardMaterial({ color: 0xffe7b0, emissive: 0xffc070, emissiveIntensity: 3.0, roughness: 0.5 });
        break;
      case "screen-dark":
        m = new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.15, metalness: 0.4, emissive: 0x101820, emissiveIntensity: 0.4 });
        break;
      case "lit-window":
        return this._setRepeat(this._tex(name, () => curtainGlow(), 0.6, 0.0, 0x000000), 1, { emissive: 0xffd9a0, emissiveIntensity: 0.0 });
      case "water":
        m = new THREE.MeshPhysicalMaterial({ color: 0x2a4a55, roughness: 0.08, metalness: 0.0, transmission: 0.5, transparent: true, opacity: 0.8, envMapIntensity: 1.2 });
        break;
      case "hedge":
        m = new THREE.MeshStandardMaterial({ color: 0x2e4a26, roughness: 1.0 });
        break;
      case "leaf":
        m = new THREE.MeshStandardMaterial({ color: 0x3a5a30, roughness: 1.0 });
        break;
      case "bark":
        m = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.95 });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    }
    this.cache[name] = m;
    return m;
  }

  // texture-only standard material
  _tex(key, fn, roughness = 0.9, metalness = 0.0, emissive = null) {
    if (this.cache[key]) return this.cache[key];
    const t = fn();
    const opts = { map: t.map || t, roughness, metalness };
    const m = new THREE.MeshStandardMaterial(opts);
    this.cache[key] = m;
    return m;
  }

  _setRepeat(mat, r) {
    if (mat.map) mat.map.repeat.set(r, r);
    if (mat.normalMap) mat.normalMap.repeat.set(r, r);
    return mat;
  }

  // A fresh randomised rug (not shared) for per-room variety.
  freshRug(rng) {
    const t = rug(rng);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.98 });
  }

  // Painting material with a given theme (cached per theme+index).
  paintingMat(theme, rng) {
    const key = `paint:${theme}:${Math.floor(rng() * 6)}`;
    if (this.cache[key]) return this.cache[key];
    const m = new THREE.MeshStandardMaterial({ map: painting(theme, rng), roughness: 0.6 });
    this.cache[key] = m;
    return m;
  }
}

export { painting };
