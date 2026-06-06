// Deterministic seeded random helpers.  mulberry32 is small, fast,
// and good enough for procedural generation.

export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash of two integers → 32-bit seed.
export function chunkSeed(cx, cz, salt = 0) {
  let h = 0x811c9dc5 ^ salt;
  h = Math.imul(h ^ ((cx + 0x80000000) | 0), 0x01000193);
  h = Math.imul(h ^ ((cz + 0x80000000) | 0), 0x01000193);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

export const rngRange = (rng, lo, hi) => lo + (hi - lo) * rng();
export const rngInt = (rng, lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
export const rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const rngChance = (rng, p) => rng() < p;

export function rngWeighted(rng, items) {
  // items = [[item, weight], ...]
  let total = 0;
  for (const it of items) total += it[1];
  let pick = rng() * total;
  for (const it of items) {
    pick -= it[1];
    if (pick <= 0) return it[0];
  }
  return items[items.length - 1][0];
}

// Slight color jitter (HSL).  Useful for varying a base color per
// instance: each cottage gets its own brick tint, each shutter its own
// paint.
export function jitterColor(rng, hex, hSpread = 0.02, sSpread = 0.1, lSpread = 0.06) {
  const c = hexToHsl(hex);
  c[0] = (c[0] + (rng() - 0.5) * hSpread + 1) % 1;
  c[1] = Math.max(0, Math.min(1, c[1] + (rng() - 0.5) * sSpread));
  c[2] = Math.max(0, Math.min(1, c[2] + (rng() - 0.5) * lSpread));
  return hslToHex(c[0], c[1], c[2]);
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255;
  let g = ((n >> 8) & 255) / 255;
  let b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}
