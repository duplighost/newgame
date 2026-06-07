// Quality presets + device detection.  One place that decides how hard
// we push the GPU: pixel ratio, shadows, post-processing, streaming
// radius and light budget.  The chosen tier persists in localStorage.

export const IS_TOUCH =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0);

export const IS_MOBILE =
  IS_TOUCH &&
  (Math.min(window.innerWidth, window.innerHeight) < 820 ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

export const PRESETS = {
  low: {
    label: "Low",
    pixelRatio: 1.0,
    renderScale: 0.8,
    shadows: false,
    shadowMap: 1024,
    bloom: false,
    smaa: false,
    loadR: 2,
    detailR: 1,
    maxLights: 4,
    fog: 0.0085,
    far: 320,
  },
  medium: {
    label: "Medium",
    pixelRatio: 1.25,
    renderScale: 1.0,
    shadows: true,
    shadowMap: 1024,
    bloom: true,
    smaa: false,
    loadR: 2,
    detailR: 1,
    maxLights: 6,
    fog: 0.0072,
    far: 480,
  },
  high: {
    label: "High",
    pixelRatio: 1.5,
    renderScale: 1.0,
    shadows: true,
    shadowMap: 2048,
    bloom: true,
    smaa: true,
    loadR: 3,
    detailR: 1,
    maxLights: 9,
    fog: 0.0072,
    far: 600,
  },
};

const KEY = "qh-quality";

export function defaultTier() {
  return IS_MOBILE ? "low" : "high";
}

export function getTier() {
  const saved = (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })();
  if (saved && PRESETS[saved]) return saved;
  return defaultTier();
}

export function setTier(tier) {
  if (!PRESETS[tier]) return;
  try {
    localStorage.setItem(KEY, tier);
  } catch {}
}

export function getSettings() {
  const tier = getTier();
  return { tier, ...PRESETS[tier] };
}

// Effective device pixel ratio for a tier.
export function effectivePR(s) {
  return Math.max(0.6, Math.min(window.devicePixelRatio || 1, s.pixelRatio) * s.renderScale);
}
