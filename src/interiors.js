// Furnished, multi-room interiors.
//
// Given a house's interior rectangle (centred on origin in house-local
// space, floor at y=0, ceiling at y=H), this lays out partition walls
// with doorways, floors, baseboards, lighting and per-room furniture.
//
// Collider meshes are pushed to `solids` as { mesh }.  The chunk manager
// computes their world AABBs after the whole chunk is attached.
// Lights are pushed to `lights` as { light }.

import * as THREE from "three";
import * as F from "./furniture.js";
import { rngPick, rngRange, rngChance, rngInt } from "./rng.js";

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

function addSolid(group, mesh, solids) {
  group.add(mesh);
  solids.push({ mesh });
  return mesh;
}

// A thin partition wall along an axis with one doorway gap.
// center: [x,z] of wall midpoint; length along `axis`; t = thickness.
function partitionWall(group, solids, opts) {
  const { cx, cz, length, axis, H, t, mat, doorOffset = 0, doorW = 1.0, doorH = 2.05 } = opts;
  const half = length / 2;
  const dLeft = doorOffset - doorW / 2;
  const dRight = doorOffset + doorW / 2;

  // segments along the wall on each side of the doorway
  const makeSeg = (a0, a1) => {
    const segLen = a1 - a0;
    if (segLen <= 0.02) return;
    const center = (a0 + a1) / 2;
    let m;
    if (axis === "x") {
      m = box(segLen, H, t, mat);
      m.position.set(cx + center, H / 2, cz);
    } else {
      m = box(t, H, segLen, mat);
      m.position.set(cx, H / 2, cz + center);
    }
    addSolid(group, m, solids);
  };
  makeSeg(-half, dLeft);
  makeSeg(dRight, half);
  // header above the doorway
  const headH = H - doorH;
  if (headH > 0.05) {
    let m;
    if (axis === "x") {
      m = box(doorW, headH, t, mat);
      m.position.set(cx + doorOffset, doorH + headH / 2, cz);
    } else {
      m = box(t, headH, doorW, mat);
      m.position.set(cx, doorH + headH / 2, cz + doorOffset);
    }
    addSolid(group, m, solids);
  }
  // doorway trim
  const trim = F.interiorDoorway(opts.matsRef, doorW, doorH);
  if (axis === "x") {
    trim.position.set(cx + doorOffset, 0, cz);
  } else {
    trim.position.set(cx, 0, cz + doorOffset);
    trim.rotation.y = Math.PI / 2;
  }
  group.add(trim);
}

// Interior wallpaper veneer on a partition or shell wall (visual only).
function veneer(group, mat, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  group.add(m);
}

function baseboard(group, mats, w, x, z, ry = 0) {
  const m = box(w, 0.12, 0.04, mats.get("wood-walnut"));
  m.position.set(x, 0.07, z);
  m.rotation.y = ry;
  group.add(m);
}

// ---------------------------------------------------------------- ROOMS
function furnishLiving(group, solids, lights, mats, rng, room, H) {
  const { x0, z0, w, d } = room; // room rect: center cx,cz with size w,d
  const cx = x0,
    cz = z0;
  const wpName = rngPick(rng, ["wp-cream", "wp-sage", "wp-blush", "wp-ochre", "wp-blue"]);
  paintRoom(group, mats, room, H, "wood-floor", wpName);

  // rug
  const rug = F.rugMesh(mats, rng, Math.min(w - 1.4, 3.6), Math.min(d - 1.4, 2.4));
  rug.position.set(cx, 0.012, cz);
  group.add(rug);

  // sofa against the back wall (−d side)
  const fabric = rngPick(rng, ["fab-navy", "fab-ochre", "fab-sage", "fab-rust", "fab-grey"]);
  const sofa = F.sofa(mats, fabric, rng);
  sofa.position.set(cx, 0, cz - d / 2 + 0.7);
  placeCollide(group, solids, sofa);

  // coffee table
  const ct = F.coffeeTable(mats, rng);
  ct.position.set(cx, 0, cz);
  placeCollide(group, solids, ct);

  // armchair to one side
  const chair = F.armchair(mats, fabric);
  chair.position.set(cx + w / 2 - 0.8, 0, cz + 0.4);
  chair.rotation.y = -Math.PI / 2 - 0.3;
  placeCollide(group, solids, chair);

  // tv unit or fireplace on the front-facing wall (+d side)
  if (rngChance(rng, 0.5)) {
    const tv = F.tvUnit(mats);
    tv.position.set(cx, 0, cz + d / 2 - 0.3);
    tv.rotation.y = Math.PI;
    placeCollide(group, solids, tv);
  } else {
    const fp = F.fireplace(mats);
    fp.position.set(cx, 0, cz + d / 2 - 0.25);
    fp.rotation.y = Math.PI;
    placeCollide(group, solids, fp);
    addFire(group, lights, fp);
  }

  // bookshelf on a side wall
  const shelf = F.bookshelf(mats, rng);
  shelf.position.set(cx - w / 2 + 0.2, 0, cz - 0.3);
  shelf.rotation.y = Math.PI / 2;
  placeCollide(group, solids, shelf);

  // floor lamp + plant
  const lamp = F.floorLamp(mats);
  lamp.position.set(cx - w / 2 + 0.7, 0, cz + d / 2 - 0.7);
  group.add(lamp);
  lights.push({ light: lamp.userData.light });
  const pl = F.plant(mats, rng);
  pl.position.set(cx + w / 2 - 0.6, 0, cz - d / 2 + 0.6);
  group.add(pl);

  // paintings on back wall
  const art = F.painting(mats, rng, 1.0, 0.78);
  art.position.set(cx, 1.7, cz - d / 2 + 0.06);
  group.add(art);

  ceilingPendant(group, lights, mats, cx, cz, H);
}

function furnishKitchen(group, solids, lights, mats, rng, room, H) {
  const { x0, z0, w, d } = room;
  const cx = x0,
    cz = z0;
  paintRoom(group, mats, room, H, "tile-check", "tile-white");

  // counter run along back wall
  const counterLen = Math.min(w - 0.6, 2.8);
  const counter = F.kitchenCounter(mats, counterLen);
  counter.position.set(cx, 0, cz - d / 2 + 0.35);
  placeCollide(group, solids, counter);
  const uppers = F.upperCabinets(mats, counterLen);
  uppers.position.set(cx, 1.65, cz - d / 2 + 0.2);
  group.add(uppers);

  // stove + fridge flanking
  const stove = F.stove(mats);
  stove.position.set(cx - counterLen / 2 + 0.4, 0, cz - d / 2 + 0.35);
  placeCollide(group, solids, stove);
  const hood = F.rangeHood(mats);
  hood.position.set(cx - counterLen / 2 + 0.4, 1.7, cz - d / 2 + 0.3);
  group.add(hood);
  const fr = F.fridge(mats);
  fr.position.set(cx + w / 2 - 0.45, 0, cz - d / 2 + 0.45);
  placeCollide(group, solids, fr);

  // island or dining table depending on room size
  if (w > 4 && d > 4) {
    const island = F.kitchenCounter(mats, 1.6);
    island.position.set(cx, 0, cz + 0.3);
    placeCollide(group, solids, island);
    for (let i = 0; i < 2; i++) {
      const st = F.barStool(mats);
      st.position.set(cx - 0.4 + i * 0.8, 0, cz + 0.95);
      group.add(st);
    }
  } else {
    const table = F.diningTable(mats);
    table.position.set(cx, 0, cz + d / 2 - 1.1);
    placeCollide(group, solids, table);
    for (let i = 0; i < 4; i++) {
      const ch = F.diningChair(mats);
      const ax = i < 2 ? -0.6 : 0.6;
      const az = i % 2 ? 0.5 : -0.5;
      ch.position.set(cx + ax, 0, cz + d / 2 - 1.1 + az);
      ch.rotation.y = ax < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(ch);
    }
  }

  ceilingPendant(group, lights, mats, cx, cz, H, "#d8d8d0");
}

function furnishBedroom(group, solids, lights, mats, rng, room, H) {
  const { x0, z0, w, d } = room;
  const cx = x0,
    cz = z0;
  const wp = rngPick(rng, ["wp-blue", "wp-sage", "wp-blush", "wp-ochre"]);
  paintRoom(group, mats, room, H, rngPick(rng, ["wood-floor", "wood-floor-ash"]), wp);

  const size = w > 3.4 ? "double" : "single";
  const bed = F.bed(mats, rng, size);
  bed.position.set(cx, 0, cz - d / 2 + 1.2);
  placeCollide(group, solids, bed);

  // rug under bed foot
  const rug = F.rugMesh(mats, rng, Math.min(w - 1, 2.6), 1.8);
  rug.position.set(cx, 0.012, cz + 0.4);
  group.add(rug);

  // nightstands
  const bw = size === "double" ? 1.6 : 1.0;
  for (let i = 0; i < (size === "double" ? 2 : 1); i++) {
    const ns = F.nightstand(mats);
    ns.position.set(cx + (i ? 1 : -1) * (bw / 2 + 0.3), 0, cz - d / 2 + 0.5);
    placeCollide(group, solids, ns);
    const tl = F.tableLamp(mats);
    tl.position.set(cx + (i ? 1 : -1) * (bw / 2 + 0.3), 0.5, cz - d / 2 + 0.5);
    group.add(tl);
    lights.push({ light: tl.userData.light });
  }

  // wardrobe + dresser
  const wr = F.wardrobe(mats);
  wr.position.set(cx - w / 2 + 0.32, 0, cz + d / 2 - 0.9);
  wr.rotation.y = Math.PI / 2;
  placeCollide(group, solids, wr);
  if (w > 3) {
    const dr = F.dresser(mats);
    dr.position.set(cx + w / 2 - 0.28, 0, cz + 0.2);
    dr.rotation.y = -Math.PI / 2;
    placeCollide(group, solids, dr);
    const mir = F.mirror(mats, 0.6, 0.9);
    mir.position.set(cx + w / 2 - 0.08, 1.4, cz + 0.2);
    mir.rotation.y = -Math.PI / 2;
    group.add(mir);
  }

  const art = F.painting(mats, rng, 0.8, 0.62);
  art.position.set(cx, 1.8, cz - d / 2 + 0.06);
  group.add(art);

  ceilingPendant(group, lights, mats, cx, cz, H, "#c0a0b0");
}

function furnishBath(group, solids, lights, mats, rng, room, H) {
  const { x0, z0, w, d } = room;
  const cx = x0,
    cz = z0;
  paintRoom(group, mats, room, H, "tile-white", "tile-blue");
  const tub = F.bathtub(mats);
  tub.position.set(cx, 0, cz - d / 2 + 0.45);
  tub.rotation.y = 0;
  placeCollide(group, solids, tub);
  const toi = F.toilet(mats);
  toi.position.set(cx + w / 2 - 0.35, 0, cz + d / 2 - 0.4);
  toi.rotation.y = Math.PI;
  placeCollide(group, solids, toi);
  const van = F.vanity(mats);
  van.position.set(cx - w / 2 + 0.4, 0, cz + d / 2 - 0.35);
  van.rotation.y = Math.PI;
  placeCollide(group, solids, van);
  const mir = F.mirror(mats, 0.5, 0.7);
  mir.position.set(cx - w / 2 + 0.08, 1.5, cz + d / 2 - 0.1);
  mir.rotation.y = Math.PI / 2;
  group.add(mir);
  ceilingPendant(group, lights, mats, cx, cz, H, "#d8d8d0");
}

function furnishStudy(group, solids, lights, mats, rng, room, H) {
  const { x0, z0, w, d } = room;
  const cx = x0,
    cz = z0;
  paintRoom(group, mats, room, H, "wood-floor-dark", rngPick(rng, ["wp-slate", "wp-ochre"]));
  const desk = F.desk(mats);
  desk.position.set(cx, 0, cz - d / 2 + 0.5);
  placeCollide(group, solids, desk);
  const chair = F.diningChair(mats);
  chair.position.set(cx, 0, cz - d / 2 + 1.1);
  group.add(chair);
  const shelf = F.bookshelf(mats, rng);
  shelf.position.set(cx - w / 2 + 0.2, 0, cz);
  shelf.rotation.y = Math.PI / 2;
  placeCollide(group, solids, shelf);
  const ch = F.armchair(mats, rngPick(rng, ["fab-rust", "fab-navy"]));
  ch.position.set(cx + w / 2 - 0.7, 0, cz + d / 2 - 0.8);
  ch.rotation.y = -Math.PI / 2;
  placeCollide(group, solids, ch);
  const lamp = F.floorLamp(mats);
  lamp.position.set(cx + w / 2 - 0.6, 0, cz - 0.5);
  group.add(lamp);
  lights.push({ light: lamp.userData.light });
  ceilingPendant(group, lights, mats, cx, cz, H);
}

// ---------------------------------------------------------------- helpers
function paintRoom(group, mats, room, H, floorName, wallName) {
  const { x0, z0, w, d } = room;
  const floor = box(w, 0.04, d, mats.get(floorName));
  floor.position.set(x0, 0.02, z0);
  floor.receiveShadow = true;
  group.add(floor);
  // wallpaper veneers on the four room edges (inward-facing)
  const wp = mats.get(wallName);
  veneer(group, wp, w, H - 0.1, x0, H / 2, z0 - d / 2 + 0.03);
  veneer(group, wp, w, H - 0.1, x0, H / 2, z0 + d / 2 - 0.03, Math.PI);
  veneer(group, wp, d, H - 0.1, x0 - w / 2 + 0.03, H / 2, z0, Math.PI / 2);
  veneer(group, wp, d, H - 0.1, x0 + w / 2 - 0.03, H / 2, z0, -Math.PI / 2);
  baseboard(group, mats, w, x0, z0 - d / 2 + 0.04);
  baseboard(group, mats, w, x0, z0 + d / 2 - 0.04);
  baseboard(group, mats, d, x0 - w / 2 + 0.04, z0, Math.PI / 2);
  baseboard(group, mats, d, x0 + w / 2 - 0.04, z0, Math.PI / 2);
}

function ceilingPendant(group, lights, mats, cx, cz, H, color = "#c89060") {
  const p = F.pendantLight(mats, color);
  p.position.set(cx, H - 0.02, cz);
  group.add(p);
  lights.push({ light: p.userData.light });
}

function addFire(group, lights, fp) {
  const l = new THREE.PointLight(0xff6020, 6, 6, 2.0);
  l.position.copy(fp.position).add(new THREE.Vector3(0, 0.4, 0.3));
  group.add(l);
  lights.push({ light: l, flicker: true });
}

let _aabb = new THREE.Box3();
function placeCollide(group, solids, obj) {
  group.add(obj);
  if (obj.userData.collide) solids.push({ mesh: obj, furniture: true });
}

// ---------------------------------------------------------------- main
// rooms layout for a footprint of interior size W×D.
// entrySide: which exterior wall the entry is on ('south'|'north'|'east'|'west')
export function buildInterior(opts) {
  const { mats, rng, group, solids, lights, W, D, H, twoStory } = opts;
  const t = 0.12;

  // ceiling
  const ceil = box(W + 0.2, 0.08, D + 0.2, mats.get("ceiling"));
  ceil.position.y = H - 0.04;
  ceil.receiveShadow = true;
  group.add(ceil);

  // Decide layout: 2 or 4 rooms depending on size.
  const fourRoom = W >= 6.5 && D >= 6.5;
  const rooms = [];
  if (fourRoom) {
    const halfW = W / 2,
      halfD = D / 2;
    // 2x2 grid; rooms centred in each quadrant
    const quad = (sx, sz) => ({
      x0: (sx * W) / 4,
      z0: (sz * D) / 4,
      w: halfW - t,
      d: halfD - t,
    });
    const r00 = quad(-1, 1); // front-left  (+z front)
    const r10 = quad(1, 1); // front-right
    const r01 = quad(-1, -1); // back-left
    const r11 = quad(1, -1); // back-right
    // assign types: front-left = living (entry), others vary
    const types = rng() < 0.5 ? ["living", "kitchen", "bedroom", "bath"] : ["living", "study", "bedroom", "kitchen"];
    rooms.push({ ...r00, type: "living" });
    rooms.push({ ...r10, type: types[1] });
    rooms.push({ ...r01, type: types[2] });
    rooms.push({ ...r11, type: types[3] });

    // partition walls: cross at center with doorways in each arm
    const wp = mats.get("plaster");
    // vertical wall (along Z) at x=0, two arms split by horizontal wall
    partitionWall(group, solids, { matsRef: mats, cx: 0, cz: D / 4, length: D / 2 - t, axis: "z", H, t, mat: wp, doorOffset: 0, doorW: 1.0 });
    partitionWall(group, solids, { matsRef: mats, cx: 0, cz: -D / 4, length: D / 2 - t, axis: "z", H, t, mat: wp, doorOffset: 0, doorW: 1.0 });
    // horizontal wall (along X) at z=0, two arms split by vertical wall
    partitionWall(group, solids, { matsRef: mats, cx: -W / 4, cz: 0, length: W / 2 - t, axis: "x", H, t, mat: wp, doorOffset: 0, doorW: 1.0 });
    partitionWall(group, solids, { matsRef: mats, cx: W / 4, cz: 0, length: W / 2 - t, axis: "x", H, t, mat: wp, doorOffset: 0, doorW: 1.0 });
  } else {
    // 2 rooms split along Z (front room = living, back = bedroom/kitchen)
    const front = { x0: 0, z0: D / 4, w: W - t, d: D / 2 - t, type: "living" };
    const back = { x0: 0, z0: -D / 4, w: W - t, d: D / 2 - t, type: rng() < 0.5 ? "bedroom" : "kitchen" };
    rooms.push(front, back);
    const wp = mats.get("plaster");
    partitionWall(group, solids, { matsRef: mats, cx: 0, cz: 0, length: W - t, axis: "x", H, t, mat: wp, doorOffset: rngRange(rng, -W / 5, W / 5), doorW: 1.0 });
  }

  // furnish each room
  for (const room of rooms) {
    switch (room.type) {
      case "living":
        furnishLiving(group, solids, lights, mats, rng, room, H);
        break;
      case "kitchen":
        furnishKitchen(group, solids, lights, mats, rng, room, H);
        break;
      case "bedroom":
        furnishBedroom(group, solids, lights, mats, rng, room, H);
        break;
      case "bath":
        furnishBath(group, solids, lights, mats, rng, room, H);
        break;
      case "study":
        furnishStudy(group, solids, lights, mats, rng, room, H);
        break;
    }
  }

  // ---- optional loft over the back half ----
  if (twoStory) {
    buildLoft(opts, t);
  }

  return rooms;
}

function buildLoft(opts, t) {
  const { mats, rng, group, solids, lights, W, D, H } = opts;
  const loftY = 2.5;
  const loftD = D * 0.45;
  const loftZ = -D / 2 + loftD / 2;

  // platform slab
  const slab = box(W - 0.1, 0.16, loftD, mats.get("wood-floor"));
  slab.position.set(0, loftY, loftZ);
  slab.receiveShadow = true;
  addSolid(group, slab, solids);

  // railing along the open (front) edge
  const railZ = loftZ + loftD / 2;
  const rail = box(W - 0.4, 0.06, 0.06, mats.get("wood-walnut"));
  rail.position.set(0, loftY + 0.9, railZ);
  group.add(rail);
  for (let i = 0; i <= 8; i++) {
    const spindle = box(0.04, 0.86, 0.04, mats.get("wood-walnut"));
    spindle.position.set(-W / 2 + 0.3 + (i / 8) * (W - 0.6), loftY + 0.5, railZ);
    group.add(spindle);
  }

  // furnish loft as a bedroom
  furnishLoftBedroom(group, solids, lights, mats, rng, { x0: 0, z0: loftZ, w: W - 0.4, d: loftD - 0.3 }, loftY, H);

  // stairs up a side wall, from ground to loft
  const st = F.stairs(mats, 11, loftY / 11, 0.27, 1.0);
  const side = rngChance(rng, 0.5) ? -1 : 1;
  st.position.set(side * (W / 2 - 0.6), 0, -D / 2 + 0.3 + 11 * 0.27);
  st.rotation.y = side > 0 ? 0 : Math.PI;
  group.add(st);
  // step colliders (coarse) so the player can climb
  const s = st.userData.stairs;
  for (let i = 0; i < s.steps; i++) {
    const stepBox = box(s.width, s.rise + 0.02, s.run, mats.get("wood-oak"));
    const lz = -i * s.run;
    const local = new THREE.Vector3(0, s.rise / 2 + i * s.rise, lz).applyEuler(st.rotation);
    stepBox.position.copy(st.position).add(local);
    stepBox.visible = false;
    addSolid(group, stepBox, solids);
  }
}

function furnishLoftBedroom(group, solids, lights, mats, rng, room, baseY, H) {
  const { x0, z0, w, d } = room;
  // floor already the slab; add a rug + bed + nightstand + lamp
  const rug = F.rugMesh(mats, rng, Math.min(w - 1, 2.6), Math.min(d - 0.6, 1.8));
  rug.position.set(x0, baseY + 0.1, z0);
  group.add(rug);
  const bed = F.bed(mats, rng, "double");
  bed.position.set(x0, baseY + 0.08, z0 - d / 2 + 1.2);
  group.add(bed);
  if (bed.userData.collide) solids.push({ mesh: bed, furniture: true });
  const ns = F.nightstand(mats);
  ns.position.set(x0 - 1.1, baseY + 0.08, z0 - d / 2 + 0.5);
  group.add(ns);
  const tl = F.tableLamp(mats);
  tl.position.set(x0 - 1.1, baseY + 0.58, z0 - d / 2 + 0.5);
  group.add(tl);
  lights.push({ light: tl.userData.light });
  // pendant
  const p = F.pendantLight(mats, "#c0a0b0");
  p.position.set(x0, H - 0.02, z0);
  group.add(p);
  lights.push({ light: p.userData.light });
}
