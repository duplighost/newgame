// Buildings: exterior shells with openings, plus the entry mechanisms
// (swinging doors, openable windows, low crawl windows, garages) and —
// for nearby "detailed" chunks — fully furnished interiors.
//
// Coordinate convention: every building is built in its own local space
// with the FRONT facing +Z.  The chunk manager positions/rotates the
// returned group.  Colliders are pushed to `solids` as { mesh, enabled };
// their world AABBs are computed by the chunk once everything is attached.

import * as THREE from "three";
import { buildInterior } from "./interiors.js";
import * as F from "./furniture.js";
import { rngPick, rngRange, rngInt, rngChance, jitterColor } from "./rng.js";

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

// A box whose UVs are scaled to world size, so a tiled material keeps a
// constant texel density no matter the segment's dimensions.  Without
// this, short wall pieces squash the brick courses into stripes.
const DENSITY = 0.45; // combines with the material's repeat (2) → ~0.9 tiles/m
function scaledBox(w, h, d, mat, density = DENSITY) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [
    [d, h], [d, h], // +X, -X
    [w, d], [w, d], // +Y, -Y
    [w, h], [w, h], // +Z, -Z
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * fw * density, uv.getY(idx) * fh * density);
    }
  }
  uv.needsUpdate = true;
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function shadowize(g, cast = true) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
  return g;
}

// ---------------------------------------------------------------- wall with arbitrary rectangular holes
function wallWithHoles(parent, solids, opts) {
  const { width, height, t, mat, holes = [], position, rotationY = 0 } = opts;
  // Vertical convention is floor-relative: the wall spans wrap-local
  // y in [0, height] and `position` sits at the floor.  Hole.y is the
  // height of the opening's centre above the floor.
  const wrap = new THREE.Group();
  wrap.position.copy(position);
  wrap.rotation.y = rotationY;
  parent.add(wrap);

  const ys = new Set([0, height]);
  for (const h of holes) {
    ys.add(Math.max(0, h.y - h.h / 2));
    ys.add(Math.min(height, h.y + h.h / 2));
  }
  const bands = [...ys].sort((a, b) => a - b);
  for (let i = 0; i < bands.length - 1; i++) {
    const y0 = bands[i],
      y1 = bands[i + 1];
    const ymid = (y0 + y1) / 2,
      bandH = y1 - y0;
    if (bandH < 0.001) continue;
    const active = holes
      .filter((h) => h.y - h.h / 2 <= ymid + 1e-4 && h.y + h.h / 2 >= ymid - 1e-4)
      .map((h) => [h.x - h.w / 2, h.x + h.w / 2])
      .sort((a, b) => a[0] - b[0]);
    let x = -width / 2;
    const addSeg = (a, b) => {
      const segW = b - a;
      if (segW < 0.001) return;
      const seg = scaledBox(segW, bandH, t, mat);
      seg.position.set((a + b) / 2, ymid, 0);
      wrap.add(seg);
      solids.push({ mesh: seg, enabled: true });
    };
    for (const [xl, xr] of active) {
      if (xl > x + 0.001) addSeg(x, xl);
      x = Math.max(x, xr);
    }
    if (x < width / 2 - 0.001) addSeg(x, width / 2);
  }
  return wrap;
}

// ---------------------------------------------------------------- window dressing
// Adds frame + sill (+ glass if closed) into a wall `wrap` at local (x,y).
// If openable, registers an interactable that slides the sash up.
function addWindow(wrap, mats, ctx, o) {
  const { x, y, w, h, openable = false, crawl = false } = o;
  const frameMat = mats.get("wood-walnut");
  const ft = 0.06;
  const frame = new THREE.Group();
  const top = box(w + ft, ft, 0.1, frameMat);
  top.position.set(x, y + h / 2, 0);
  const bot = top.clone();
  bot.position.set(x, y - h / 2, 0);
  const l = box(ft, h, 0.1, frameMat);
  l.position.set(x - w / 2, y, 0);
  const r = l.clone();
  r.position.set(x + w / 2, y, 0);
  frame.add(top, bot, l, r);
  // sill
  const sill = box(w + 0.2, 0.07, 0.18, frameMat);
  sill.position.set(x, y - h / 2 - 0.02, 0.06);
  frame.add(sill);
  shadowize(frame);
  wrap.add(frame);

  if (crawl) {
    // always-open: no glass, register a crawl hint
    ctx.windows.push({ group: wrap, local: new THREE.Vector3(x, y, 0), radius: 1.7 });
    return;
  }

  // sash (glass + muntin) — a moving node for openable windows
  const sash = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.94), mats.get("glass"));
  sash.add(glass);
  const muntinV = box(0.03, h * 0.94, 0.04, frameMat);
  const muntinH = box(w * 0.94, 0.03, 0.04, frameMat);
  sash.add(muntinV, muntinH);
  sash.position.set(x, y, 0.02);
  shadowize(sash, false);
  wrap.add(sash);

  if (openable) {
    // collider blocking the opening while shut
    const blocker = box(w, h, 0.06, mats.get("glass"));
    blocker.visible = false;
    blocker.position.set(x, y, 0);
    wrap.add(blocker);
    const rec = { mesh: blocker, enabled: true };
    ctx.solids.push(rec);
    ctx.interactables.push({
      kind: "window",
      group: wrap,
      local: new THREE.Vector3(x, y, 0),
      facing: new THREE.Vector3(0, 0, 1),
      prompt: "open window",
      isOpen: false,
      node: sash,
      anim: { type: "slideY", from: 0, to: h * 0.9, t: 0 },
      colliders: [rec],
    });
  }
}

// ---------------------------------------------------------------- swinging door
function addDoor(wrap, mats, ctx, o) {
  const { x, w, h, kind = "door", backwards = false } = o;
  const frameMat = mats.get("wood-walnut");
  // frame
  const top = box(w + 0.18, 0.1, 0.2, frameMat);
  top.position.set(x, h + 0.04, 0);
  const l = box(0.09, h + 0.08, 0.2, frameMat);
  l.position.set(x - w / 2 - 0.04, (h + 0.08) / 2, 0);
  const r = l.clone();
  r.position.set(x + w / 2 + 0.04, (h + 0.08) / 2, 0);
  wrap.add(top, l, r);
  shadowize(wrap);

  // hinge group at the left jamb; leaf offset so it swings
  const hinge = new THREE.Group();
  hinge.position.set(x - w / 2, 0, 0);
  const leafMat = kind === "garage" ? mats.get("steel") : mats.get(rngChance(ctx.rng, 0.5) ? "wood-walnut" : "wood-oak");
  const leaf = box(w - 0.04, h - 0.04, 0.06, leafMat);
  leaf.position.set(w / 2, h / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  hinge.add(leaf);
  // panels + knob detail
  if (kind !== "garage") {
    const panel = box(w * 0.6, h * 0.36, 0.02, mats.tinted("#000", { roughness: 0.7 }));
    panel.material = leafMat;
    const p1 = box(w * 0.62, h * 0.34, 0.07, leafMat);
    p1.position.set(w / 2, h * 0.7, 0);
    const p2 = p1.clone();
    p2.position.set(w / 2, h * 0.32, 0);
    hinge.add(p1, p2);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), mats.get("brass"));
    knob.position.set(w - 0.12, h * 0.5, 0.06);
    hinge.add(knob);
  } else {
    // garage roll-up ribs
    for (let i = 0; i < 4; i++) {
      const rib = box(w - 0.06, h / 4 - 0.04, 0.02, mats.tinted("#9aa0a6", { metalness: 0.5, roughness: 0.5 }));
      rib.position.set(w / 2, h / 8 + (i * h) / 4, 0.04);
      hinge.add(rib);
    }
  }
  wrap.add(hinge);

  // collider across the closed doorway
  const blocker = box(w, h, 0.08, leafMat);
  blocker.visible = false;
  blocker.position.set(x, h / 2, 0);
  wrap.add(blocker);
  const rec = { mesh: blocker, enabled: true };
  ctx.solids.push(rec);

  const swing = backwards ? -Math.PI * 0.62 : Math.PI * 0.62;
  const anim =
    kind === "garage"
      ? { type: "slideY", from: 0, to: h * 0.95, t: 0 }
      : { type: "swing", from: 0, to: swing, t: 0 };
  ctx.interactables.push({
    kind,
    group: wrap,
    local: new THREE.Vector3(x, h / 2, 0),
    facing: new THREE.Vector3(0, 0, 1),
    prompt: kind === "garage" ? "open garage" : "open door",
    isOpen: false,
    node: hinge,
    anim,
    colliders: [rec],
  });
}

// ---------------------------------------------------------------- pitched roof
function addRoof(group, mats, W, D, H, roofMat, rng) {
  const roofH = rngRange(rng, 1.4, 2.1);
  const overhang = 0.45;
  const shape = new THREE.Shape();
  shape.moveTo(-D / 2 - overhang, 0);
  shape.lineTo(0, roofH);
  shape.lineTo(D / 2 + overhang, 0);
  shape.lineTo(-D / 2 - overhang, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(W + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(geo, roofMat);
  roof.position.y = H;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  // gable end caps
  const gableMat = group.userData.extMat.clone();
  gableMat.side = THREE.DoubleSide;
  const gs = new THREE.Shape();
  gs.moveTo(-W / 2 - overhang, 0);
  gs.lineTo(0, roofH);
  gs.lineTo(W / 2 + overhang, 0);
  gs.lineTo(-W / 2 - overhang, 0);
  const gg = new THREE.ShapeGeometry(gs);
  const g1 = new THREE.Mesh(gg, gableMat);
  g1.position.set(0, H, D / 2 + overhang);
  const g2 = new THREE.Mesh(gg, gableMat);
  g2.position.set(0, H, -D / 2 - overhang);
  g2.rotation.y = Math.PI;
  group.add(g1, g2);
  // chimney sometimes
  if (rngChance(rng, 0.5)) {
    const ch = box(0.5, 1.4, 0.5, group.userData.extMat);
    ch.position.set(rngRange(rng, -W / 4, W / 4), H + roofH * 0.7, rngRange(rng, -D / 5, D / 5));
    ch.castShadow = true;
    group.add(ch);
  }
}

// ---------------------------------------------------------------- DETACHED HOUSE
export function buildDetachedHouse(ctx) {
  const { mats, rng, detail } = ctx;
  const g = new THREE.Group();
  const W = rngRange(rng, 7.5, 11);
  const D = rngRange(rng, 6.5, 9);
  const H = rngRange(rng, 2.9, 3.3);
  const t = 0.2;
  const twoStory = rngChance(rng, 0.4) && detail;

  const extName = rngPick(rng, ["brick-red", "brick-cream", "brick-brown", "brick-buff", "brick-grey"]);
  const extMat = mats.get(extName);
  const roofMat = mats.get(rngPick(rng, ["roof-terracotta", "roof-slate", "roof-green"]));
  g.userData.extMat = extMat;

  // foundation slab
  const found = box(W + 0.4, 0.3, D + 0.4, mats.get("concrete-dark"));
  found.position.y = -0.15;
  found.receiveShadow = true;
  g.add(found);

  if (!detail) {
    // sealed shell with lit decorative windows
    sealedShell(g, mats, rng, W, D, H, extMat, twoStory);
    addRoof(g, mats, W, D, H, roofMat, rng);
    shadowize(g);
    g.userData.size = { W, D, H };
    return g;
  }

  // --- detailed: openings + portals + interior ---
  // FRONT (+Z): door + a crawl window + a normal window
  const doorX = rngRange(rng, W / 6, W / 3);
  const crawlX = -rngRange(rng, W / 6, W / 3);
  const frontHoles = [
    { x: doorX, y: 1.05, w: 1.0, h: 2.1 }, // door (to floor)
    { x: crawlX, y: 0.5, w: 1.5, h: 1.0 }, // crawl window (to floor)
  ];
  // maybe an extra openable window
  let frontOpenable = null;
  if (rngChance(rng, 0.6)) {
    frontOpenable = { x: 0, y: 1.3, w: 1.1, h: 1.2 };
    frontHoles.push(frontOpenable);
  }
  const frontWrap = wallWithHoles(g, ctx.solids, {
    width: W, height: H, t, mat: extMat, holes: frontHoles,
    position: new THREE.Vector3(0, 0, D / 2 + t / 2),
  });
  addDoor(frontWrap, mats, ctx, { x: doorX, w: 1.0, h: 2.1, kind: "door" });
  addWindow(frontWrap, mats, ctx, { x: crawlX, y: 0.5, w: 1.5, h: 1.0, crawl: true });
  if (frontOpenable) addWindow(frontWrap, mats, ctx, { x: 0, y: 1.3, w: 1.1, h: 1.2, openable: true });

  // BACK (−Z): solid wall + optional back door (openable)
  const backHoles = [];
  const hasBackDoor = rngChance(rng, 0.55);
  if (hasBackDoor) backHoles.push({ x: rngRange(rng, -W / 4, W / 4), y: 1.05, w: 1.0, h: 2.1 });
  // a window
  backHoles.push({ x: rngRange(rng, -W / 4, W / 4), y: 1.5, w: 1.1, h: 1.2 });
  const backWrap = wallWithHoles(g, ctx.solids, {
    width: W, height: H, t, mat: extMat, holes: backHoles,
    position: new THREE.Vector3(0, 0, -D / 2 - t / 2), rotationY: Math.PI,
  });
  if (hasBackDoor) addDoor(backWrap, mats, ctx, { x: -backHoles[0].x, w: 1.0, h: 2.1, kind: "door", backwards: true });
  addWindow(backWrap, mats, ctx, { x: -backHoles[backHoles.length - 1].x, y: 1.5, w: 1.1, h: 1.2, openable: false });

  // LEFT (−X): a low openable window you can climb through
  const leftWin = { x: rngRange(rng, -D / 4, D / 4), y: 0.95, w: 1.1, h: 1.25 };
  const leftWrap = wallWithHoles(g, ctx.solids, {
    width: D, height: H, t, mat: extMat, holes: [leftWin],
    position: new THREE.Vector3(-W / 2 - t / 2, 0, 0), rotationY: -Math.PI / 2,
  });
  addWindow(leftWrap, mats, ctx, { x: leftWin.x, y: leftWin.y, w: leftWin.w, h: leftWin.h, openable: true });

  // RIGHT (+X): closed window
  const rightWin = { x: rngRange(rng, -D / 4, D / 4), y: 1.5, w: 1.1, h: 1.2 };
  const rightWrap = wallWithHoles(g, ctx.solids, {
    width: D, height: H, t, mat: extMat, holes: [rightWin],
    position: new THREE.Vector3(W / 2 + t / 2, 0, 0), rotationY: Math.PI / 2,
  });
  addWindow(rightWrap, mats, ctx, { x: rightWin.x, y: rightWin.y, w: rightWin.w, h: rightWin.h, openable: false });

  addRoof(g, mats, W, D, H + (twoStory ? 0.0 : 0), roofMat, rng);

  // interior
  buildInterior({
    mats, rng, group: g, solids: ctx.solids, lights: ctx.lights,
    W: W - t, D: D - t, H: twoStory ? Math.max(H, 3.2) : H, twoStory,
  });

  // a little stoop at the front door
  const stoop = box(1.6, 0.16, 0.8, mats.get("concrete"));
  stoop.position.set(doorX, 0.0, D / 2 + 0.4);
  stoop.receiveShadow = true;
  g.add(stoop);

  shadowize(g);
  g.userData.size = { W, D, H };
  return g;
}

// sealed shell for distant houses: solid walls + emissive window panes
function sealedShell(g, mats, rng, W, D, H, extMat, twoStory) {
  const t = 0.2;
  const walls = [
    { w: W, pos: new THREE.Vector3(0, H / 2, D / 2 + t / 2), ry: 0 },
    { w: W, pos: new THREE.Vector3(0, H / 2, -D / 2 - t / 2), ry: Math.PI },
    { w: D, pos: new THREE.Vector3(-W / 2 - t / 2, H / 2, 0), ry: -Math.PI / 2 },
    { w: D, pos: new THREE.Vector3(W / 2 + t / 2, H / 2, 0), ry: Math.PI / 2 },
  ];
  const litMat = mats.tinted("#1a1410", { emissive: "#ffb258", emissiveIntensity: rngRange(rng, 0.2, 0.5), roughness: 0.4 });
  for (const wl of walls) {
    const wall = scaledBox(wl.w, H, t, extMat);
    const wrap = new THREE.Group();
    wrap.position.copy(wl.pos);
    wrap.rotation.y = wl.ry;
    wrap.add(wall);
    g.add(wrap);
    const n = Math.max(2, Math.floor(wl.w / 2.6));
    for (let i = 0; i < n; i++) {
      const pane = box(0.9, 1.1, 0.04, litMat);
      pane.position.set(-wl.w / 2 + (i + 0.5) * (wl.w / n), 1.4, t / 2 + 0.02);
      wrap.add(pane);
      const fr = box(1.04, 1.24, 0.05, mats.get("wood-walnut"));
      fr.position.set(-wl.w / 2 + (i + 0.5) * (wl.w / n), 1.4, t / 2 + 0.0);
      wrap.add(fr);
    }
  }
}

// ---------------------------------------------------------------- TOWNHOUSE (narrow, in a row)
export function buildTownhouse(ctx, W) {
  const { mats, rng, detail } = ctx;
  const g = new THREE.Group();
  W = W || rngRange(rng, 5.0, 6.0);
  const D = rngRange(rng, 6.5, 8);
  const floors = rngInt(rng, 2, 3);
  const H = floors * 2.7;
  const t = 0.2;
  const extName = rngPick(rng, ["brick-red", "brick-brown", "brick-buff", "brick-grey"]);
  const extMat = mats.get(extName);
  g.userData.extMat = extMat;

  const found = box(W + 0.1, 0.3, D + 0.3, mats.get("concrete-dark"));
  found.position.y = -0.15;
  g.add(found);

  // flat-ish roof parapet
  const roof = box(W + 0.2, 0.4, D + 0.2, mats.get("concrete-dark"));
  roof.position.y = H + 0.2;
  g.add(roof);

  if (!detail) {
    sealedShellMultiFloor(g, mats, rng, W, D, H, extMat, floors);
    shadowize(g);
    g.userData.size = { W, D, H };
    return g;
  }

  // detailed: ground floor enterable (door + crawl window); upper floors lit
  const doorX = -W / 4;
  const frontHoles = [
    { x: doorX, y: 1.05, w: 0.95, h: 2.1 },
    { x: W / 5, y: 0.55, w: 1.3, h: 1.1 }, // crawl window
  ];
  const groundH = 2.7;
  const frontWrap = wallWithHoles(g, ctx.solids, {
    width: W, height: groundH, t, mat: extMat, holes: frontHoles,
    position: new THREE.Vector3(0, 0, D / 2 + t / 2),
  });
  addDoor(frontWrap, mats, ctx, { x: doorX, w: 0.95, h: 2.1, kind: "door" });
  addWindow(frontWrap, mats, ctx, { x: W / 5, y: 0.55, w: 1.3, h: 1.1, crawl: true });

  // other three ground walls solid
  for (const wl of [
    { w: W, pos: new THREE.Vector3(0, 0, -D / 2 - t / 2), ry: Math.PI },
    { w: D, pos: new THREE.Vector3(-W / 2 - t / 2, 0, 0), ry: -Math.PI / 2 },
    { w: D, pos: new THREE.Vector3(W / 2 + t / 2, 0, 0), ry: Math.PI / 2 },
  ]) {
    wallWithHoles(g, ctx.solids, { width: wl.w, height: groundH, t, mat: extMat, holes: [], position: wl.pos, rotationY: wl.ry });
  }
  // upper floors: solid block with lit windows
  const upper = scaledBox(W, H - groundH, D, extMat);
  upper.position.y = groundH + (H - groundH) / 2;
  g.add(upper);
  litWindows(g, mats, rng, W, D, groundH, H, t, floors - 1);

  // ceiling over ground floor
  const ceil = box(W, 0.1, D, mats.get("ceiling"));
  ceil.position.y = groundH - 0.05;
  g.add(ceil);

  // single-room interior on the ground floor
  buildInterior({
    mats, rng, group: g, solids: ctx.solids, lights: ctx.lights,
    W: W - t, D: D - t, H: groundH, twoStory: false,
  });

  shadowize(g);
  g.userData.size = { W, D, H };
  return g;
}

function sealedShellMultiFloor(g, mats, rng, W, D, H, extMat, floors) {
  const bulk = scaledBox(W, H, D, extMat);
  bulk.position.y = H / 2;
  g.add(bulk);
  litWindows(g, mats, rng, W, D, 0, H, 0.2, floors);
}

function litWindows(g, mats, rng, W, D, y0, H, t, floors) {
  const litMat = mats.tinted("#1a1410", { emissive: "#ffb258", emissiveIntensity: rngRange(rng, 0.2, 0.55), roughness: 0.4 });
  for (const side of ["front", "back", "left", "right"]) {
    placeLit(g, litMat, mats, W, D, y0, H, floors, side);
  }
}

function placeLit(g, litMat, mats, W, D, y0, H, floors, side) {
  const fh = (H - y0) / floors;
  const along = side === "front" || side === "back" ? W : D;
  const n = Math.max(2, Math.floor(along / 2.4));
  for (let f = 0; f < floors; f++) {
    const yy = y0 + f * fh + fh * 0.55;
    for (let i = 0; i < n; i++) {
      const p = -along / 2 + (i + 0.5) * (along / n);
      const pane = box(0.85, 1.05, 0.04, litMat);
      const fr = box(0.98, 1.18, 0.05, mats.get("wood-walnut"));
      if (side === "front") {
        pane.position.set(p, yy, D / 2 + 0.03);
        fr.position.set(p, yy, D / 2 + 0.01);
      } else if (side === "back") {
        pane.position.set(p, yy, -D / 2 - 0.03);
        fr.position.set(p, yy, -D / 2 - 0.01);
      } else if (side === "left") {
        pane.position.set(-W / 2 - 0.03, yy, p);
        pane.rotation.y = Math.PI / 2;
        fr.position.set(-W / 2 - 0.01, yy, p);
        fr.rotation.y = Math.PI / 2;
      } else {
        pane.position.set(W / 2 + 0.03, yy, p);
        pane.rotation.y = Math.PI / 2;
        fr.position.set(W / 2 + 0.01, yy, p);
        fr.rotation.y = Math.PI / 2;
      }
      g.add(pane, fr);
    }
  }
}

// ---------------------------------------------------------------- APARTMENT / TOWER (decorative, tall)
export function buildTower(ctx, opts = {}) {
  const { mats, rng } = ctx;
  const g = new THREE.Group();
  const W = opts.W || rngRange(rng, 10, 15);
  const D = opts.D || rngRange(rng, 10, 14);
  const floors = opts.floors || rngInt(rng, 5, 12);
  const H = floors * 3.0;
  const extMat = mats.get(rngPick(rng, ["brick-grey", "brick-red", "brick-brown"]));
  const bulk = scaledBox(W, H, D, extMat);
  bulk.position.y = H / 2;
  g.add(bulk);
  const roof = box(W + 0.4, 0.4, D + 0.4, mats.get("concrete-dark"));
  roof.position.y = H + 0.2;
  g.add(roof);
  // rooftop units
  if (rngChance(rng, 0.6)) {
    const hvac = box(rngRange(rng, 1, 2), 0.8, rngRange(rng, 1, 2), mats.get("steel"));
    hvac.position.set(rngRange(rng, -W / 4, W / 4), H + 0.6, rngRange(rng, -D / 4, D / 4));
    g.add(hvac);
  }
  litWindows(g, mats, rng, W, D, 0, H, 0.2, floors);
  shadowize(g);
  g.userData.size = { W, D, H };
  return g;
}

// ---------------------------------------------------------------- SHOP (storefront + simple interior)
export function buildShop(ctx) {
  const { mats, rng, detail } = ctx;
  const g = new THREE.Group();
  const W = rngRange(rng, 7, 9);
  const D = rngRange(rng, 6, 8);
  const H = 3.4;
  const t = 0.2;
  const extMat = mats.get(rngPick(rng, ["brick-red", "brick-buff", "concrete"]));
  g.userData.extMat = extMat;
  const found = box(W + 0.3, 0.3, D + 0.3, mats.get("concrete-dark"));
  found.position.y = -0.15;
  g.add(found);
  // awning colour
  const awningCol = jitterColor(rng, rngPick(rng, ["#8a3a3a", "#3a6a5a", "#3a5a8a", "#8a6a2a"]), 0.03, 0.1, 0.06);

  if (!detail) {
    const bulk = scaledBox(W, H, D, extMat);
    bulk.position.y = H / 2;
    g.add(bulk);
    const glass = box(W * 0.7, 1.8, 0.1, mats.get("screen-dark"));
    glass.position.set(0, 1.2, D / 2 + 0.06);
    g.add(glass);
    addAwning(g, mats, awningCol, W, D);
    shadowize(g);
    g.userData.size = { W, D, H };
    return g;
  }

  // storefront: big window + door
  const doorX = W / 3;
  const frontHoles = [
    { x: doorX, y: 1.1, w: 1.0, h: 2.2 },
    { x: -W / 6, y: 1.2, w: W * 0.5, h: 2.0 }, // big shop window
  ];
  const frontWrap = wallWithHoles(g, ctx.solids, {
    width: W, height: H, t, mat: extMat, holes: frontHoles,
    position: new THREE.Vector3(0, 0, D / 2 + t / 2),
  });
  addDoor(frontWrap, mats, ctx, { x: doorX, w: 1.0, h: 2.2, kind: "door" });
  // big fixed glass
  const bigGlass = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5 * 0.96, 2.0 * 0.96), mats.get("glass"));
  bigGlass.position.set(-W / 6, 1.2, D / 2 + t / 2 + 0.02);
  g.add(bigGlass);
  // a crawl-under gap at the side of the big window (low transom) → make it crawlable
  ctx.windows.push({ group: g, local: new THREE.Vector3(-W / 6, 0.5, D / 2 + t / 2), radius: 1.8 });

  // other walls solid
  for (const wl of [
    { w: W, pos: new THREE.Vector3(0, 0, -D / 2 - t / 2), ry: Math.PI },
    { w: D, pos: new THREE.Vector3(-W / 2 - t / 2, 0, 0), ry: -Math.PI / 2 },
    { w: D, pos: new THREE.Vector3(W / 2 + t / 2, 0, 0), ry: Math.PI / 2 },
  ]) {
    wallWithHoles(g, ctx.solids, { width: wl.w, height: H, t, mat: extMat, holes: [], position: wl.pos, rotationY: wl.ry });
  }
  const ceil = box(W, 0.1, D, mats.get("ceiling"));
  ceil.position.y = H - 0.05;
  g.add(ceil);
  const floor = box(W - t, 0.04, D - t, mats.get("tile-check"));
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  g.add(floor);
  // interior: counter + shelves
  const counter = F.kitchenCounter(mats, 2.4);
  counter.position.set(0, 0, -D / 2 + 0.8);
  g.add(counter);
  ctx.solids.push({ mesh: counter, furniture: true });
  for (let i = 0; i < 3; i++) {
    const sh = F.bookshelf(mats, rng);
    sh.position.set(-W / 2 + 0.8 + i * 1.2, 0, -1);
    sh.rotation.y = Math.PI / 2;
    g.add(sh);
    ctx.solids.push({ mesh: sh, furniture: true });
  }
  const p = F.pendantLight(mats, "#d8d8d0");
  p.position.set(0, H - 0.05, 0);
  g.add(p);
  ctx.lights.push({ light: p.userData.light });

  addAwning(g, mats, awningCol, W, D);
  shadowize(g);
  g.userData.size = { W, D, H };
  return g;
}

function addAwning(g, mats, col, W, D) {
  const awn = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.06, 1.0), new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.8 }));
  awn.position.set(0, 2.7, D / 2 + 0.5);
  awn.rotation.x = -0.25;
  awn.castShadow = true;
  g.add(awn);
  // stripes underside
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9 / 6 - 0.04, 0.062, 1.0), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : new THREE.Color(col), roughness: 0.8 }));
    s.position.set(-W * 0.45 + (i + 0.5) * (W * 0.9 / 6), 2.7, D / 2 + 0.5);
    s.rotation.x = -0.25;
    g.add(s);
  }
}
