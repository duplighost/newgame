// World generation: ground, streets, buildings, enterable houses with
// furnished interiors, trees, lamps.  Returns the THREE.Group plus a
// list of solid AABBs for the player to collide against, plus a list of
// "windows" (interactive zones) used for HUD prompts.

import * as THREE from "three";
import { MaterialLibrary } from "./materials.js";

const SHADOW_DIST = 60; // beyond this, meshes don't cast shadows

let mats;

// ------------------------------------------------------------------
// Solid box helper
// ------------------------------------------------------------------
function solidBox(width, height, depth, mat, opts = {}) {
  const g = new THREE.BoxGeometry(width, height, depth);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  return m;
}

function placeAt(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
}

function aabbForMesh(mesh) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return box;
}

// Add a solid mesh into group and register collider
function addSolid(group, mesh, solids) {
  group.add(mesh);
  solids.push({ aabb: aabbForMesh(mesh), mesh });
  return mesh;
}

// ------------------------------------------------------------------
// Wall with a rectangular opening (window or door)
// Wall lies in local XY plane, faces +Z, anchor at center.
// We split into up to 4 segments around the hole.
// ------------------------------------------------------------------
function wallWithOpening(opts) {
  const {
    width,
    height,
    thickness,
    material,
    opening, // {x, y, w, h} — center of opening in wall-local coords
    group,
    solids,
    transform, // function(mesh) to position/orient resulting walls
  } = opts;

  const segments = [];

  if (opening) {
    const ox = opening.x; // center x
    const oy = opening.y; // center y
    const ow = opening.w;
    const oh = opening.h;
    const left = ox - ow / 2;
    const right = ox + ow / 2;
    const bottom = oy - oh / 2;
    const top = oy + oh / 2;

    // Below the opening
    if (bottom > -height / 2) {
      const segH = bottom - -height / 2;
      const segW = ow;
      const m = solidBox(segW, segH, thickness, material);
      m.position.set(ox, -height / 2 + segH / 2, 0);
      segments.push(m);
    }
    // Above the opening
    if (top < height / 2) {
      const segH = height / 2 - top;
      const segW = ow;
      const m = solidBox(segW, segH, thickness, material);
      m.position.set(ox, top + segH / 2, 0);
      segments.push(m);
    }
    // Left of opening
    if (left > -width / 2) {
      const segW = left - -width / 2;
      const m = solidBox(segW, height, thickness, material);
      m.position.set(-width / 2 + segW / 2, 0, 0);
      segments.push(m);
    }
    // Right of opening
    if (right < width / 2) {
      const segW = width / 2 - right;
      const m = solidBox(segW, height, thickness, material);
      m.position.set(right + segW / 2, 0, 0);
      segments.push(m);
    }
  } else {
    segments.push(solidBox(width, height, thickness, material));
  }

  const wrapper = new THREE.Group();
  segments.forEach((s) => wrapper.add(s));
  if (transform) transform(wrapper);
  group.add(wrapper);
  // After parent transform, compute AABB on each leaf
  wrapper.updateMatrixWorld(true);
  segments.forEach((s) => {
    const box = new THREE.Box3().setFromObject(s);
    solids.push({ aabb: box, mesh: s });
  });
  return wrapper;
}

// ------------------------------------------------------------------
// Window glass + frame inside the opening
// ------------------------------------------------------------------
function windowGlass(opts) {
  const { width, height, group, transform, isOpen = false } = opts;
  const wrap = new THREE.Group();
  // Glass pane
  if (!isOpen) {
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.94, height * 0.94),
      mats.get("glass")
    );
    glass.position.z = 0.0;
    wrap.add(glass);
  }
  // Frame (4 thin strips)
  const frameMat = mats.get("wood-walnut");
  const frameT = 0.06;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameT, 0.08),
    frameMat
  );
  top.position.y = height / 2 - frameT / 2;
  const bot = top.clone();
  bot.position.y = -height / 2 + frameT / 2;
  const l = new THREE.Mesh(
    new THREE.BoxGeometry(frameT, height, 0.08),
    frameMat
  );
  l.position.x = -width / 2 + frameT / 2;
  const r = l.clone();
  r.position.x = width / 2 - frameT / 2;
  // mullion
  const mh = new THREE.Mesh(
    new THREE.BoxGeometry(width, frameT * 0.6, 0.06),
    frameMat
  );
  wrap.add(top, bot, l, r, mh);
  [top, bot, l, r, mh].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  // Sill
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.2, 0.08, 0.2),
    frameMat
  );
  sill.position.y = -height / 2 - 0.04;
  sill.position.z = 0.05;
  sill.castShadow = true;
  sill.receiveShadow = true;
  wrap.add(sill);

  if (transform) transform(wrap);
  group.add(wrap);
  return wrap;
}

// ------------------------------------------------------------------
// Decorative building (no interior, no entry)
// ------------------------------------------------------------------
function decorativeBuilding(opts) {
  const {
    x,
    z,
    width,
    depth,
    height,
    floors = Math.max(1, Math.round(height / 3.5)),
    material,
    roofColor = 0x2a2a2a,
    group,
    solids,
  } = opts;

  const b = new THREE.Group();
  b.position.set(x, 0, z);

  // The bulk (solid box)
  const bulk = solidBox(width, height, depth, material);
  bulk.position.y = height / 2;
  b.add(bulk);

  // Roof slab
  const roof = solidBox(
    width + 0.4,
    0.3,
    depth + 0.4,
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.85 })
  );
  roof.position.y = height + 0.15;
  b.add(roof);

  // Windows: just lit panes baked into surface (emissive)
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x2a2018,
    emissive: 0xffaa55,
    emissiveIntensity: 0.3,
    roughness: 0.3,
    metalness: 0.1,
  });
  const frameMat = mats.get("wood-walnut");
  for (let f = 0; f < floors; f++) {
    const fy = 1.0 + f * (height / floors);
    if (fy + 0.6 > height - 0.4) continue;
    const winsPerSideX = Math.max(2, Math.floor(width / 3));
    for (let i = 0; i < winsPerSideX; i++) {
      const px = -width / 2 + (i + 0.5) * (width / winsPerSideX);
      // front/back
      ["front", "back"].forEach((side) => {
        const z0 = side === "front" ? depth / 2 + 0.02 : -depth / 2 - 0.02;
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 1.1),
          winMat
        );
        pane.position.set(px, fy + 0.55, z0);
        if (side === "back") pane.rotation.y = Math.PI;
        b.add(pane);
        // frame
        const fr = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 1.25, 0.05),
          frameMat
        );
        fr.position.set(px, fy + 0.55, z0);
        if (side === "back") fr.rotation.y = Math.PI;
        b.add(fr);
      });
    }
    const winsPerSideZ = Math.max(2, Math.floor(depth / 3));
    for (let i = 0; i < winsPerSideZ; i++) {
      const pz = -depth / 2 + (i + 0.5) * (depth / winsPerSideZ);
      ["left", "right"].forEach((side) => {
        const x0 = side === "right" ? width / 2 + 0.02 : -width / 2 - 0.02;
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 1.1),
          winMat
        );
        pane.position.set(x0, fy + 0.55, pz);
        pane.rotation.y = side === "right" ? -Math.PI / 2 : Math.PI / 2;
        b.add(pane);
        const fr = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 1.25, 0.05),
          frameMat
        );
        fr.position.set(x0, fy + 0.55, pz);
        fr.rotation.y = side === "right" ? -Math.PI / 2 : Math.PI / 2;
        b.add(fr);
      });
    }
  }

  // Door (decorative)
  const door = solidBox(1.2, 2.2, 0.1, mats.get("wood-walnut"));
  door.position.set(0, 1.1, depth / 2 + 0.05);
  b.add(door);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    mats.get("metal-brass")
  );
  knob.position.set(0.4, 1.1, depth / 2 + 0.13);
  b.add(knob);

  // shadow flags for distant culling
  const cast = !opts.distant;
  b.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = cast;
    }
  });

  group.add(b);
  // Add a single solid AABB for the whole bulk
  bulk.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bulk);
  solids.push({ aabb: box, mesh: bulk });
}

// ------------------------------------------------------------------
// House with furnished interior + one openable window the player can
// crawl through.  Footprint W x D, walls H tall.
// ------------------------------------------------------------------
function buildHouse(opts) {
  const {
    x,
    z,
    rotation = 0,
    width = 9,
    depth = 7,
    height = 3.0,
    exteriorMaterial,
    roofMaterial,
    interiorStyle = "cream",
    group,
    solids,
    windows,
    lights,
  } = opts;

  const houseGroup = new THREE.Group();
  houseGroup.position.set(x, 0, z);
  houseGroup.rotation.y = rotation;

  const wallT = 0.18;
  const half = { w: width / 2, d: depth / 2 };
  const wallY = height / 2;

  // ---------- Floor ----------
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.05, 0.1, depth - 0.05),
    mats.get("wood-floor")
  );
  floor.position.y = 0.05;
  floor.receiveShadow = true;
  houseGroup.add(floor);

  // ---------- Ceiling ----------
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.08, depth),
    mats.get("plaster")
  );
  ceiling.position.y = height - 0.04;
  ceiling.receiveShadow = true;
  houseGroup.add(ceiling);

  // ---------- Walls ----------
  // Front (south, +Z), Back (-Z), Left (-X), Right (+X)
  // Opening on FRONT: low window — top at world y=1.0, so a standing
  // player can't pass.  Bottom at floor level (y=0) so we don't need
  // step-up logic in the controller.
  const windowOpen = {
    x: -width / 4,
    y: 0.5 - height / 2, // wall-local center; bottom at y=0 world
    w: 1.6,
    h: 1.0,
  };
  const doorOpen = {
    x: width / 4,
    y: 1.1 - height / 2,
    w: 1.05,
    h: 2.2,
  };

  // Front wall — TWO openings (window + door)
  // We can't do two with single helper; we split manually.
  // Easier: build left strip, between strip, right strip + above each opening.
  buildFrontWall({
    width,
    height,
    thickness: wallT,
    material: exteriorMaterial,
    windowOpen,
    doorOpen,
    group: houseGroup,
    solids,
    z: half.d,
  });

  // Back wall (with a small high decorative window — solid wall behind it)
  wallWithOpening({
    width,
    height,
    thickness: wallT,
    material: exteriorMaterial,
    opening: null,
    group: houseGroup,
    solids,
    transform: (m) => {
      m.position.set(0, wallY, -half.d);
      m.rotation.y = Math.PI;
    },
  });

  // Left wall
  wallWithOpening({
    width: depth,
    height,
    thickness: wallT,
    material: exteriorMaterial,
    opening: { x: 0, y: 1.5 - height / 2, w: 1.1, h: 1.2 },
    group: houseGroup,
    solids,
    transform: (m) => {
      m.position.set(-half.w, wallY, 0);
      m.rotation.y = -Math.PI / 2;
    },
  });
  // Right wall
  wallWithOpening({
    width: depth,
    height,
    thickness: wallT,
    material: exteriorMaterial,
    opening: { x: 0, y: 1.5 - height / 2, w: 1.1, h: 1.2 },
    group: houseGroup,
    solids,
    transform: (m) => {
      m.position.set(half.w, wallY, 0);
      m.rotation.y = Math.PI / 2;
    },
  });

  // ---------- Interior wallpaper veneer ----------
  // Apply wallpaper-coloured planes flush inside each wall.
  const wallpaper =
    interiorStyle === "sage"
      ? mats.get("wallpaper-sage")
      : interiorStyle === "blush"
      ? mats.get("wallpaper-blush")
      : mats.get("wallpaper-cream");

  // Back wall interior
  const backInner = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.4, height - 0.2),
    wallpaper
  );
  backInner.position.set(0, height / 2, -half.d + wallT / 2 + 0.005);
  backInner.receiveShadow = true;
  houseGroup.add(backInner);

  // Left wall interior
  const leftInner = new THREE.Mesh(
    new THREE.PlaneGeometry(depth - 0.4, height - 0.2),
    wallpaper
  );
  leftInner.position.set(-half.w + wallT / 2 + 0.005, height / 2, 0);
  leftInner.rotation.y = Math.PI / 2;
  leftInner.receiveShadow = true;
  houseGroup.add(leftInner);

  // Right wall interior
  const rightInner = leftInner.clone();
  rightInner.material = wallpaper;
  rightInner.position.x = half.w - wallT / 2 - 0.005;
  rightInner.rotation.y = -Math.PI / 2;
  houseGroup.add(rightInner);

  // Baseboard
  const bbMat = mats.get("wood-walnut");
  const bb1 = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.3, 0.12, 0.04),
    bbMat
  );
  bb1.position.set(0, 0.08, -half.d + wallT / 2 + 0.025);
  houseGroup.add(bb1);
  const bb2 = bb1.clone();
  bb2.geometry = new THREE.BoxGeometry(depth - 0.3, 0.12, 0.04);
  bb2.position.set(-half.w + wallT / 2 + 0.025, 0.08, 0);
  bb2.rotation.y = Math.PI / 2;
  houseGroup.add(bb2);
  const bb3 = bb2.clone();
  bb3.position.x = half.w - wallT / 2 - 0.025;
  houseGroup.add(bb3);

  // ---------- Roof (pitched) ----------
  const roofH = 1.8;
  const roofGroup = new THREE.Group();
  roofGroup.position.y = height;
  // Two angled slabs forming an A
  const slabGeom = new THREE.BoxGeometry(
    width + 0.6,
    0.18,
    Math.hypot(half.d + 0.4, roofH) * 2
  );
  const slab1 = new THREE.Mesh(slabGeom, roofMaterial);
  slab1.castShadow = true;
  slab1.receiveShadow = true;
  slab1.rotation.x = Math.atan2(roofH, half.d + 0.4);
  slab1.position.set(0, roofH / 2, 0);
  // shift so it forms a tent
  const slab1Group = new THREE.Group();
  slab1Group.add(slab1);
  slab1.position.z = (half.d + 0.4) / 2;
  slab1.position.y =
    (roofH * 0.5) -
    (Math.sin(slab1.rotation.x) * (half.d + 0.4)) / 2;
  // simpler: build using triangular prism
  // Replace with a clean prism
  roofGroup.clear();
  const prismShape = new THREE.Shape();
  prismShape.moveTo(-half.d - 0.4, 0);
  prismShape.lineTo(0, roofH);
  prismShape.lineTo(half.d + 0.4, 0);
  prismShape.lineTo(-half.d - 0.4, 0);
  const prismGeom = new THREE.ExtrudeGeometry(prismShape, {
    depth: width + 0.6,
    bevelEnabled: false,
  });
  prismGeom.translate(0, 0, -(width + 0.6) / 2);
  prismGeom.rotateY(Math.PI / 2);
  // Apply material — but the slanted faces need the tile texture
  const roofMesh = new THREE.Mesh(prismGeom, roofMaterial);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);
  houseGroup.add(roofGroup);

  // Triangular gable end caps (under the roof).  Double-sided so the
  // player sees brick from inside the house too.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-half.w - 0.3, 0);
  gableShape.lineTo(0, roofH);
  gableShape.lineTo(half.w + 0.3, 0);
  gableShape.lineTo(-half.w - 0.3, 0);
  const gableGeom = new THREE.ShapeGeometry(gableShape);
  const gableMat = exteriorMaterial.clone();
  gableMat.side = THREE.DoubleSide;
  const g1 = new THREE.Mesh(gableGeom, gableMat);
  g1.position.set(0, height, half.d + 0.4);
  houseGroup.add(g1);
  const g2 = new THREE.Mesh(gableGeom, gableMat);
  g2.position.set(0, height, -half.d - 0.4);
  g2.rotation.y = Math.PI;
  houseGroup.add(g2);

  // ---------- Window pane (open or shut) ----------
  // Front window — OPEN (so it's a hole)
  windowGlass({
    width: windowOpen.w * 0.98,
    height: windowOpen.h * 0.98,
    group: houseGroup,
    isOpen: true,
    transform: (m) => {
      m.position.set(windowOpen.x, windowOpen.y + height / 2, half.d + 0.01);
    },
  });
  // Side windows shut
  windowGlass({
    width: 1.1,
    height: 1.2,
    group: houseGroup,
    transform: (m) => {
      m.position.set(-half.w - 0.01, 1.5, 0);
      m.rotation.y = -Math.PI / 2;
    },
  });
  windowGlass({
    width: 1.1,
    height: 1.2,
    group: houseGroup,
    transform: (m) => {
      m.position.set(half.w + 0.01, 1.5, 0);
      m.rotation.y = Math.PI / 2;
    },
  });

  // ---------- Door (closed) ----------
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(doorOpen.w - 0.02, doorOpen.h - 0.02, 0.05),
    mats.get("wood-walnut")
  );
  door.position.set(doorOpen.x, doorOpen.y + height / 2, half.d + 0.02);
  door.castShadow = true;
  door.receiveShadow = true;
  houseGroup.add(door);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 10),
    mats.get("metal-brass")
  );
  knob.position.set(doorOpen.x + 0.42, doorOpen.y + height / 2, half.d + 0.07);
  houseGroup.add(knob);
  // door frame
  const dfTop = new THREE.Mesh(
    new THREE.BoxGeometry(doorOpen.w + 0.16, 0.1, 0.18),
    mats.get("wood-walnut")
  );
  dfTop.position.set(doorOpen.x, doorOpen.y + height / 2 + doorOpen.h / 2 + 0.05, half.d + 0.04);
  houseGroup.add(dfTop);
  // door is solid (close it)
  solids.push({
    aabb: (() => {
      door.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(door);
    })(),
    mesh: door,
  });

  // ---------- Curtains beside the open window ----------
  const curtainColor =
    interiorStyle === "sage"
      ? 0xa8b89a
      : interiorStyle === "blush"
      ? 0xd6b0a8
      : 0xe6c896;
  const curtainMat = new THREE.MeshStandardMaterial({
    color: curtainColor,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1;
    const c = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, windowOpen.h + 0.6),
      curtainMat
    );
    c.position.set(
      windowOpen.x + sign * (windowOpen.w / 2 + 0.15),
      windowOpen.y + height / 2 + 0.3,
      half.d - 0.05
    );
    c.castShadow = true;
    c.receiveShadow = true;
    houseGroup.add(c);
  }

  // ---------- Interior furniture ----------
  furnishHouse(houseGroup, {
    width,
    depth,
    height,
    style: interiorStyle,
    lights,
  });

  // ---------- Interactive "window" marker ----------
  // World-space center of the openable window:
  const localPos = new THREE.Vector3(windowOpen.x, windowOpen.y + height / 2, half.d);
  const worldPos = localPos.clone().applyEuler(new THREE.Euler(0, rotation, 0));
  worldPos.add(new THREE.Vector3(x, 0, z));
  windows.push({
    pos: worldPos,
    radius: 1.6,
    label: "crawl through window",
    needsCrouch: true,
  });

  // ---------- Apply shadow flags ----------
  houseGroup.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  group.add(houseGroup);
  return houseGroup;
}

// ------------------------------------------------------------------
// Front wall builder with TWO openings (window + door)
// ------------------------------------------------------------------
function buildFrontWall(opts) {
  const {
    width,
    height,
    thickness,
    material,
    windowOpen,
    doorOpen,
    group: parentGroup,
    solids,
    z,
  } = opts;

  // All segments live in a sub-group so we can express positions in
  // "wall-local" coordinates (y centered on wall).
  const group = new THREE.Group();
  group.position.set(0, height / 2, z);
  parentGroup.add(group);

  const halfW = width / 2;
  const halfH = height / 2;

  // Convert openings from "wall-local" to world-local of the wall plane (y centered)
  // windowOpen: {x, y, w, h}, y is wall-local (centered)
  const w1 = { x: windowOpen.x, y: windowOpen.y, w: windowOpen.w, h: windowOpen.h };
  const d1 = { x: doorOpen.x, y: doorOpen.y, w: doorOpen.w, h: doorOpen.h };

  // We will produce horizontal strips: bottom strip (below both),
  // middle strip(s) between openings, top strip (above both).
  // Then within middle strip(s), vertical segments to the side of openings.

  // Simpler approach: assume window and door don't overlap in X.
  // Strip 1: y from -halfH to min(bottom of both openings) = bottom of window since door starts at y=1.1-halfH and window at 0.85-halfH-0.5= 0.35-halfH
  const wBot = w1.y - w1.h / 2;
  const wTop = w1.y + w1.h / 2;
  const dBot = d1.y - d1.h / 2;
  const dTop = d1.y + d1.h / 2;

  function addSegment(w, h, posX, posY) {
    const m = solidBox(w, h, thickness, material);
    m.position.set(posX, posY, 0);
    group.add(m);
    m.updateMatrixWorld(true);
    solids.push({ aabb: new THREE.Box3().setFromObject(m), mesh: m });
  }

  // Bottom strip: from -halfH to min(wBot, dBot)
  const sBotEnd = Math.min(wBot, dBot);
  if (sBotEnd > -halfH) {
    const sH = sBotEnd - -halfH;
    addSegment(width, sH, 0, -halfH + sH / 2);
  }

  // Top strip: from max(wTop, dTop) to halfH
  const sTopStart = Math.max(wTop, dTop);
  if (sTopStart < halfH) {
    const sH = halfH - sTopStart;
    addSegment(width, sH, 0, sTopStart + sH / 2);
  }

  // For each opening, segments above/below within window's own y range:
  function addOpeningSurround(op) {
    const top = op.y + op.h / 2;
    const bot = op.y - op.h / 2;
    if (bot > sBotEnd + 0.001) {
      const sH = bot - sBotEnd;
      addSegment(op.w, sH, op.x, sBotEnd + sH / 2);
    }
    if (top < sTopStart - 0.001) {
      const sH = sTopStart - top;
      addSegment(op.w, sH, op.x, top + sH / 2);
    }
  }
  addOpeningSurround(w1);
  addOpeningSurround(d1);

  // Vertical segments BETWEEN the openings (in the middle band).
  const w1Right = w1.x + w1.w / 2;
  const d1Left = d1.x - d1.w / 2;
  if (d1Left > w1Right) {
    const sW = d1Left - w1Right;
    const sH = sTopStart - sBotEnd;
    addSegment(sW, sH, (w1Right + d1Left) / 2, sBotEnd + sH / 2);
  }
  if (-halfW < w1.x - w1.w / 2) {
    const sW = w1.x - w1.w / 2 - -halfW;
    const sH = sTopStart - sBotEnd;
    addSegment(sW, sH, -halfW + sW / 2, sBotEnd + sH / 2);
  }
  if (halfW > d1.x + d1.w / 2) {
    const sW = halfW - (d1.x + d1.w / 2);
    const sH = sTopStart - sBotEnd;
    addSegment(sW, sH, d1.x + d1.w / 2 + sW / 2, sBotEnd + sH / 2);
  }
}

// ------------------------------------------------------------------
// Furniture for a house interior
// ------------------------------------------------------------------
function furnishHouse(group, opts) {
  const { width, depth, height, style, lights } = opts;

  const halfW = width / 2;
  const halfD = depth / 2;

  // Pick an accent fabric per style
  const fabric =
    style === "sage"
      ? mats.get("fabric-sage")
      : style === "blush"
      ? mats.get("fabric-ochre")
      : mats.get("fabric-navy");

  // ---- Rug ----
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.02, 2.4),
    mats.get("rug")
  );
  rug.position.set(-0.5, 0.11, 0.3);
  rug.receiveShadow = true;
  group.add(rug);

  // ---- Sofa ----
  const sofa = makeSofa(fabric);
  sofa.position.set(0, 0, -halfD + 1.0);
  sofa.rotation.y = 0;
  group.add(sofa);

  // ---- Coffee table ----
  const table = makeCoffeeTable();
  table.position.set(0, 0, 0.3);
  group.add(table);

  // ---- Armchair ----
  const chair = makeArmchair(fabric);
  chair.position.set(halfW - 1.2, 0, halfD - 1.6);
  chair.rotation.y = -Math.PI / 2 - 0.3;
  group.add(chair);

  // ---- Floor lamp ----
  const lamp = makeFloorLamp();
  lamp.position.set(halfW - 0.8, 0, -halfD + 0.8);
  group.add(lamp);
  lights.push({ light: lamp.userData.light });

  // ---- Bookshelf ----
  const shelf = makeBookshelf();
  shelf.position.set(-halfW + 0.25, 0, -halfD + 1.4);
  shelf.rotation.y = Math.PI / 2;
  group.add(shelf);

  // ---- Painting on back wall ----
  const painting = makePainting(Math.random() < 0.5 ? "landscape" : "abstract");
  painting.position.set(0.0, 1.9, -halfD + 0.1);
  group.add(painting);

  // ---- Ceiling pendant ----
  const pendant = makePendantLight();
  pendant.position.set(-0.5, height - 0.05, 0.3);
  group.add(pendant);
  lights.push({ light: pendant.userData.light });

  // ---- Small side table near sofa ----
  const sideT = makeSideTable();
  sideT.position.set(-halfW + 1.2, 0, -halfD + 1.0);
  group.add(sideT);
  // book on it
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.04, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x88333a, roughness: 0.85 })
  );
  book.position.set(-halfW + 1.2, 0.62, -halfD + 1.0);
  book.rotation.y = 0.2;
  group.add(book);

  // ---- Plant in corner ----
  const plant = makePlant();
  plant.position.set(halfW - 0.6, 0, halfD - 0.6);
  group.add(plant);
}

// ------------------------------------------------------------------
// Furniture pieces
// ------------------------------------------------------------------
function makeSofa(fabricMat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.45, 1.0),
    fabricMat
  );
  base.position.y = 0.25;
  g.add(base);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.7, 0.25),
    fabricMat
  );
  back.position.set(0, 0.6, -0.4);
  g.add(back);
  // arm rests
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.55, 1.0),
    fabricMat
  );
  armL.position.set(-1.3, 0.5, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 1.3;
  g.add(armR);
  // cushions
  for (let i = -1; i <= 1; i++) {
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.18, 0.8),
      fabricMat
    );
    cushion.position.set(i * 0.85, 0.55, 0.05);
    g.add(cushion);
  }
  // throw pillow
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xd4a566, roughness: 0.9 })
  );
  pillow.position.set(-1.0, 0.65, 0.05);
  pillow.rotation.y = 0.3;
  g.add(pillow);
  // feet
  const footMat = mats.get("wood-walnut");
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.06), footMat);
    f.position.set(i % 2 ? 1.2 : -1.2, 0.05, i < 2 ? 0.4 : -0.4);
    g.add(f);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeCoffeeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.05, 0.7),
    mats.get("wood-walnut")
  );
  top.position.y = 0.45;
  g.add(top);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.42, 0.06),
      mats.get("wood-walnut")
    );
    leg.position.set(i % 2 ? 0.6 : -0.6, 0.22, i < 2 ? 0.3 : -0.3);
    g.add(leg);
  }
  // a small vase
  const vase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.22, 16),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 })
  );
  vase.position.set(0, 0.58, 0);
  g.add(vase);
  // book stack
  const b1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.04, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x3a4d6a, roughness: 0.85 })
  );
  b1.position.set(-0.35, 0.49, 0.1);
  g.add(b1);
  const b2 = b1.clone();
  b2.material = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.85 });
  b2.position.y = 0.53;
  b2.rotation.y = 0.2;
  g.add(b2);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeArmchair(fabricMat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.45, 0.85),
    fabricMat
  );
  base.position.y = 0.25;
  g.add(base);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.7, 0.18),
    fabricMat
  );
  back.position.set(0, 0.6, -0.34);
  g.add(back);
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.5, 0.85),
    fabricMat
  );
  armL.position.set(-0.37, 0.5, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.37;
  g.add(armR);
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.74, 0.16, 0.7),
    fabricMat
  );
  cushion.position.set(0, 0.55, 0);
  g.add(cushion);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeFloorLamp() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, 0.04, 24),
    mats.get("metal-iron")
  );
  base.position.y = 0.02;
  g.add(base);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.6, 12),
    mats.get("metal-iron")
  );
  pole.position.y = 0.84;
  g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.26, 0.32, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xe8d4a8,
      emissive: 0xffb060,
      emissiveIntensity: 0.7,
      roughness: 0.9,
      side: THREE.DoubleSide,
    })
  );
  shade.position.y = 1.75;
  g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 16),
    mats.get("lamp-warm")
  );
  bulb.position.y = 1.7;
  g.add(bulb);

  const light = new THREE.PointLight(0xffb86b, 0.9, 7.5, 1.6);
  light.castShadow = false;
  light.position.y = 1.7;
  g.add(light);
  g.userData.light = light;

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeBookshelf() {
  const g = new THREE.Group();
  const wood = mats.get("wood-walnut");
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.8, 0.32),
    wood
  );
  frame.position.y = 0.9;
  g.add(frame);
  // hollow it visually with a slightly inset back
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.34, 1.74, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 0.95 })
  );
  back.position.set(0, 0.9, -0.13);
  g.add(back);
  // shelves
  for (let i = 1; i <= 3; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.04, 0.3),
      wood
    );
    s.position.y = i * 0.42;
    g.add(s);
  }
  // books
  const bookColors = [
    0x6a2a2a, 0x2a3a6a, 0x4a6a2a, 0x6a5a2a, 0x6a3a5a, 0x2a4a4a, 0x8a4a2a,
  ];
  for (let row = 0; row < 4; row++) {
    let x = -0.6;
    while (x < 0.6) {
      const w = 0.04 + Math.random() * 0.06;
      const h = 0.28 + Math.random() * 0.1;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.22),
        new THREE.MeshStandardMaterial({
          color: bookColors[Math.floor(Math.random() * bookColors.length)],
          roughness: 0.85,
        })
      );
      b.position.set(x + w / 2, row * 0.42 + 0.05 + h / 2, 0);
      g.add(b);
      x += w + 0.005;
    }
  }
  // a horizontal book
  const hb = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.08, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.85 })
  );
  hb.position.set(0.4, 1.32, 0);
  g.add(hb);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makePainting(theme) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.85, 0.04),
    mats.get("wood-walnut")
  );
  g.add(frame);
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.75),
    new THREE.MeshStandardMaterial({
      map: paintingTextureRef(theme),
      roughness: 0.7,
    })
  );
  canvas.position.z = 0.022;
  g.add(canvas);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// lazy require: we don't want circular import; inline
import { paintingTexture } from "./materials.js";
function paintingTextureRef(theme) {
  return paintingTexture(theme);
}

function makePendantLight() {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  );
  cord.position.y = -0.25;
  g.add(cord);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.18, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xc89060,
      metalness: 0.7,
      roughness: 0.3,
      side: THREE.DoubleSide,
    })
  );
  shade.position.y = -0.55;
  g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    mats.get("lamp-warm")
  );
  bulb.position.y = -0.55;
  g.add(bulb);
  const light = new THREE.PointLight(0xffd29a, 1.2, 8, 1.5);
  light.position.y = -0.6;
  light.castShadow = false;
  g.add(light);
  g.userData.light = light;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeSideTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24),
    mats.get("wood-walnut")
  );
  top.position.y = 0.58;
  g.add(top);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.56, 12),
    mats.get("wood-walnut")
  );
  stem.position.y = 0.28;
  g.add(stem);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24),
    mats.get("wood-walnut")
  );
  base.position.y = 0.02;
  g.add(base);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makePlant() {
  const g = new THREE.Group();
  // pot
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.18, 0.32, 20),
    new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.7 })
  );
  pot.position.y = 0.16;
  g.add(pot);
  // foliage — bunch of cones
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3a5a32,
    roughness: 0.9,
  });
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 + Math.random() * 0.05, 0.5 + Math.random() * 0.3, 6),
      leafMat
    );
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.18;
    c.position.set(Math.cos(a) * r, 0.5 + Math.random() * 0.4, Math.sin(a) * r);
    c.rotation.set(
      (Math.random() - 0.5) * 0.6,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.6
    );
    g.add(c);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// ------------------------------------------------------------------
// Trees & lamps & benches
// ------------------------------------------------------------------
function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.95 })
  );
  trunk.position.y = 1.1;
  g.add(trunk);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.28 + Math.random() * 0.05, 0.45, 0.32),
    roughness: 1.0,
  });
  for (let i = 0; i < 5; i++) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.3, 1),
      foliageMat
    );
    const a = Math.random() * Math.PI * 2;
    const r = 0.4 + Math.random() * 0.4;
    blob.position.set(
      Math.cos(a) * r,
      2.0 + Math.random() * 0.8,
      Math.sin(a) * r
    );
    blob.scale.set(
      1 + Math.random() * 0.3,
      0.9 + Math.random() * 0.3,
      1 + Math.random() * 0.3
    );
    g.add(blob);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeLamppost() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.3, 16),
    mats.get("metal-iron")
  );
  base.position.y = 0.15;
  g.add(base);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 4.2, 10),
    mats.get("metal-iron")
  );
  pole.position.y = 2.4;
  g.add(pole);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.4),
    mats.get("metal-iron")
  );
  arm.position.set(0, 4.4, 0.2);
  g.add(arm);
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.4, 0.32),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      emissive: 0xffc070,
      emissiveIntensity: 1.6,
      roughness: 0.4,
      metalness: 0.2,
    })
  );
  lantern.position.set(0, 4.35, 0.4);
  g.add(lantern);

  const light = new THREE.PointLight(0xffb060, 1.4, 12, 1.7);
  light.position.set(0, 4.3, 0.4);
  light.castShadow = false;
  g.add(light);
  g.userData.light = light;

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function makeBench() {
  const g = new THREE.Group();
  const wood = mats.get("wood-walnut");
  const iron = mats.get("metal-iron");
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.04, 0.13),
      wood
    );
    plank.position.set(0, 0.5, -0.2 + i * 0.13);
    g.add(plank);
  }
  // back planks
  for (let i = 0; i < 3; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.06, 0.05),
      wood
    );
    plank.position.set(0, 0.7 + i * 0.12, -0.21);
    g.add(plank);
  }
  // legs
  for (let s = -1; s <= 1; s += 2) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.5, 0.5),
      iron
    );
    leg.position.set(s * 0.7, 0.25, -0.05);
    g.add(leg);
    // back support
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.5, 0.04),
      iron
    );
    back.position.set(s * 0.7, 0.75, -0.21);
    g.add(back);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// ------------------------------------------------------------------
// Main world builder
// ------------------------------------------------------------------
export function buildWorld(scene, sunVec, sunLight, onProgress) {
  mats = new MaterialLibrary();

  const root = new THREE.Group();
  const solids = []; // {aabb, mesh}
  const windows = []; // [{pos,radius,label}]
  const lights = []; // [{pos,light,parent}] for culling

  // ---------- Ground plane ----------
  onProgress(0.1, "paving the streets");
  const groundSize = 320;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    mats.get("grass")
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // ---------- Streets (asphalt) ----------
  const BLOCK = 26;
  const ROAD = 9;
  const GRID = 4;
  const total = GRID * BLOCK + (GRID + 1) * ROAD;
  const half = total / 2;

  // Horizontal & vertical roads using big planes
  const asphalt = mats.get("asphalt");
  for (let i = 0; i <= GRID; i++) {
    // horizontal road (along X)
    const yPos = -half + ROAD / 2 + i * (BLOCK + ROAD);
    const r1 = new THREE.Mesh(
      new THREE.PlaneGeometry(total, ROAD),
      asphalt
    );
    r1.rotation.x = -Math.PI / 2;
    r1.position.set(0, 0.005, yPos);
    r1.receiveShadow = true;
    root.add(r1);
    // vertical road (along Z)
    const xPos = yPos;
    const r2 = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD, total),
      asphalt
    );
    r2.rotation.x = -Math.PI / 2;
    r2.position.set(xPos, 0.005, 0);
    r2.receiveShadow = true;
    root.add(r2);
  }

  // Lane markings (dashed yellow)
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xe8c050,
    roughness: 0.6,
  });
  for (let i = 0; i <= GRID; i++) {
    const yPos = -half + ROAD / 2 + i * (BLOCK + ROAD);
    for (let x = -half + 2; x < half; x += 4) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 0.12),
        stripeMat
      );
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.012, yPos);
      root.add(s);
      // and the vertical road
      const s2 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 2),
        stripeMat
      );
      s2.rotation.x = -Math.PI / 2;
      s2.position.set(yPos, 0.012, x);
      root.add(s2);
    }
  }

  // ---------- Sidewalks (each block gets a perimeter) ----------
  onProgress(0.25, "laying sidewalks");
  function blockCenter(i, j) {
    return new THREE.Vector3(
      -half + ROAD + BLOCK / 2 + i * (BLOCK + ROAD),
      0,
      -half + ROAD + BLOCK / 2 + j * (BLOCK + ROAD)
    );
  }
  const concrete = mats.get("concrete");
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const c = blockCenter(i, j);
      const sw = new THREE.Mesh(
        new THREE.PlaneGeometry(BLOCK + 2, BLOCK + 2),
        concrete
      );
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(c.x, 0.008, c.z);
      sw.receiveShadow = true;
      root.add(sw);
      // inner grass patch (smaller — leaves a sidewalk margin)
      const grassPatch = new THREE.Mesh(
        new THREE.PlaneGeometry(BLOCK - 4, BLOCK - 4),
        mats.get("grass")
      );
      grassPatch.rotation.x = -Math.PI / 2;
      grassPatch.position.set(c.x, 0.012, c.z);
      grassPatch.receiveShadow = true;
      root.add(grassPatch);
    }
  }

  // ---------- Buildings & houses ----------
  onProgress(0.5, "raising the buildings");

  // Decide which blocks are houses (4) vs apartment buildings vs parks
  // 4x4 grid:
  const blockPlan = [
    // i=0
    ["house-cream", "apt", "park", "house-sage"],
    // i=1
    ["apt", "tower", "house-blush", "apt"],
    // i=2
    ["park", "house-walnut", "tower", "apt"],
    // i=3
    ["apt", "park", "apt", "tower"],
  ];

  const exteriorByStyle = {
    "house-cream": {
      ext: mats.get("brick-cream"),
      roof: mats.get("roof-terracotta"),
      interior: "cream",
    },
    "house-sage": {
      ext: mats.get("brick-cream"),
      roof: mats.get("roof-slate"),
      interior: "sage",
    },
    "house-blush": {
      ext: mats.get("brick-red"),
      roof: mats.get("roof-terracotta"),
      interior: "blush",
    },
    "house-walnut": {
      ext: mats.get("brick-grey"),
      roof: mats.get("roof-slate"),
      interior: "cream",
    },
  };

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const c = blockCenter(i, j);
      const type = blockPlan[i][j];
      const rot = (Math.PI / 2) * Math.floor(Math.random() * 4) * 0; // keep oriented
      // Houses face the road towards the south (+z from block center => towards road at j-side)
      // Actually we'll just face all houses with their front to +Z
      if (type.startsWith("house-")) {
        const cfg = exteriorByStyle[type];
        buildHouse({
          x: c.x,
          z: c.z - 3, // shift towards the front (+Z front means front faces south)
          rotation: 0,
          width: 9,
          depth: 7,
          height: 3.0,
          exteriorMaterial: cfg.ext,
          roofMaterial: cfg.roof,
          interiorStyle: cfg.interior,
          group: root,
          solids,
          windows,
          lights,
        });
        // Garden bits
        const tree = makeTree();
        tree.position.set(c.x - 5, 0, c.z + 6);
        root.add(tree);
        const tree2 = makeTree();
        tree2.position.set(c.x + 5, 0, c.z + 6);
        root.add(tree2);
      } else if (type === "apt") {
        decorativeBuilding({
          x: c.x,
          z: c.z,
          width: 12 + Math.random() * 4,
          depth: 10 + Math.random() * 3,
          height: 9 + Math.random() * 4,
          floors: 3,
          material: Math.random() < 0.5 ? mats.get("brick-red") : mats.get("brick-cream"),
          roofColor: 0x1f1f1f,
          group: root,
          solids,
        });
      } else if (type === "tower") {
        decorativeBuilding({
          x: c.x,
          z: c.z,
          width: 14,
          depth: 12,
          height: 22 + Math.random() * 8,
          floors: 7,
          material: mats.get("brick-grey"),
          roofColor: 0x111111,
          group: root,
          solids,
        });
      } else if (type === "park") {
        // small park: trees + bench + lamppost
        for (let t = 0; t < 7; t++) {
          const tx = c.x + (Math.random() - 0.5) * (BLOCK - 6);
          const tz = c.z + (Math.random() - 0.5) * (BLOCK - 6);
          const tr = makeTree();
          tr.position.set(tx, 0, tz);
          tr.rotation.y = Math.random() * Math.PI;
          root.add(tr);
        }
        const b = makeBench();
        b.position.set(c.x - 2, 0, c.z);
        root.add(b);
        const b2 = makeBench();
        b2.position.set(c.x + 2, 0, c.z);
        b2.rotation.y = Math.PI;
        root.add(b2);
        const l = makeLamppost();
        l.position.set(c.x, 0, c.z + 4);
        root.add(l);
        lights.push({ light: l.userData.light });
      }
    }
  }

  // ---------- Street lamps at intersections ----------
  onProgress(0.8, "lighting the lamps");
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const xPos = -half + ROAD / 2 + i * (BLOCK + ROAD);
      const zPos = -half + ROAD / 2 + j * (BLOCK + ROAD);
      // skip extremes outside city
      if (i === 0 && j === 0) continue;
      if (i === GRID && j === GRID) continue;
      const l = makeLamppost();
      l.position.set(xPos + ROAD / 2 + 0.5, 0, zPos + ROAD / 2 + 0.5);
      root.add(l);
      lights.push({ light: l.userData.light });
    }
  }

  // ---------- Sky-edge buildings (distant silhouettes) ----------
  onProgress(0.9, "filling the horizon");
  for (let k = 0; k < 22; k++) {
    const angle = (k / 22) * Math.PI * 2;
    const dist = 130 + Math.random() * 40;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const h = 14 + Math.random() * 20;
    decorativeBuilding({
      x,
      z,
      width: 10 + Math.random() * 8,
      depth: 10 + Math.random() * 8,
      height: h,
      floors: Math.max(3, Math.round(h / 3.5)),
      material: mats.get("brick-grey"),
      roofColor: 0x111111,
      group: root,
      solids,
      distant: true,
    });
  }

  // Aim sun to look at city center
  sunLight.target.position.set(0, 0, 0);

  scene.add(root);

  // Now that every collider is attached to the scene graph, refresh
  // each AABB from its mesh's actual world matrix.  Some were computed
  // earlier while parent groups still had stale matrices.
  root.updateMatrixWorld(true);
  for (const s of solids) {
    if (s.mesh) s.aabb = new THREE.Box3().setFromObject(s.mesh);
  }

  onProgress(1.0, "stepping outside");
  return { root, solids, windows, lights };
}
