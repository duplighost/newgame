// Outdoor props: trees, lamps, benches, cars, hydrants, mailboxes,
// fences, hedges, fountains, planters, traffic lights, bus stops.
// Builders take (mats, rng) and return a THREE.Group with shadows set.

import * as THREE from "three";
import { rngPick, rngRange, rngChance, jitterColor } from "./rng.js";

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const cyl = (rt, rb, h, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

function shadowize(g, cast = true) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
  return g;
}

// ---------------------------------------------------------------- TREE
export function tree(mats, rng) {
  const g = new THREE.Group();
  const th = rngRange(rng, 2.0, 3.4);
  const trunk = cyl(0.16, 0.24, th, mats.get("bark"), 8);
  trunk.position.y = th / 2;
  g.add(trunk);
  const hue = rngRange(rng, 0.22, 0.34);
  const sat = rngRange(rng, 0.35, 0.55);
  const lit = rngRange(rng, 0.24, 0.36);
  const foliage = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, sat, lit), roughness: 1.0 });
  const blobs = 4 + (rng() * 4) | 0;
  for (let i = 0; i < blobs; i++) {
    const r = rngRange(rng, 0.7, 1.2);
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), foliage);
    const a = rng() * 7,
      rr = rng() * 0.6;
    blob.position.set(Math.cos(a) * rr, th + rng() * 1.0, Math.sin(a) * rr);
    blob.scale.set(1 + rng() * 0.3, 0.9 + rng() * 0.3, 1 + rng() * 0.3);
    g.add(blob);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- LAMPPOST
export function lamppost(mats) {
  const g = new THREE.Group();
  const iron = mats.get("iron");
  const base = cyl(0.18, 0.22, 0.3, iron, 12);
  base.position.y = 0.15;
  g.add(base);
  const pole = cyl(0.06, 0.07, 4.2, iron, 10);
  pole.position.y = 2.4;
  g.add(pole);
  const arm = box(0.05, 0.05, 0.5, iron);
  arm.position.set(0, 4.4, 0.25);
  g.add(arm);
  const lantern = box(0.34, 0.42, 0.34, mats.tinted("#1a1a1a", { emissive: "#ffc070", emissiveIntensity: 1.8, roughness: 0.4, metalness: 0.2 }));
  lantern.position.set(0, 4.32, 0.45);
  g.add(lantern);
  const light = new THREE.PointLight(0xffb060, 10, 13, 1.8);
  light.position.set(0, 4.28, 0.45);
  g.add(light);
  g.userData.light = light;
  return shadowize(g);
}

// ---------------------------------------------------------------- BENCH
export function bench(mats) {
  const g = new THREE.Group();
  const wood = mats.get("wood-walnut");
  const iron = mats.get("iron");
  for (let i = 0; i < 4; i++) {
    const plank = box(1.6, 0.04, 0.13, wood);
    plank.position.set(0, 0.5, -0.2 + i * 0.13);
    g.add(plank);
  }
  for (let i = 0; i < 3; i++) {
    const plank = box(1.6, 0.06, 0.05, wood);
    plank.position.set(0, 0.7 + i * 0.12, -0.21);
    g.add(plank);
  }
  for (let s = -1; s <= 1; s += 2) {
    const leg = box(0.06, 0.5, 0.5, iron);
    leg.position.set(s * 0.7, 0.25, -0.05);
    g.add(leg);
    const back = box(0.04, 0.5, 0.04, iron);
    back.position.set(s * 0.7, 0.75, -0.21);
    g.add(back);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- CAR (parked)
export function car(mats, rng) {
  const g = new THREE.Group();
  const col = jitterColor(rng, rngPick(rng, ["#7a2a2a", "#2a3a6a", "#2a2a2e", "#dcdcdc", "#3a5a3a", "#6a6a70", "#b8a020"]), 0.02, 0.1, 0.05);
  const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.32, metalness: 0.5 });
  const glass = mats.get("glass");
  const L = rngRange(rng, 3.8, 4.6);
  const Wd = 1.8;
  // lower body
  const lower = box(Wd, 0.5, L, paint);
  lower.position.y = 0.55;
  g.add(lower);
  // cabin
  const cabinL = L * 0.5;
  const cabin = box(Wd - 0.1, 0.5, cabinL, paint);
  cabin.position.set(0, 1.0, -L * 0.04);
  g.add(cabin);
  // greenhouse glass
  const gh = box(Wd - 0.14, 0.42, cabinL - 0.1, glass);
  gh.position.set(0, 1.02, -L * 0.04);
  g.add(gh);
  // wheels
  const tire = mats.tinted("#0c0c0c", { roughness: 0.9 });
  const hub = mats.get("chrome");
  for (let sx = -1; sx <= 1; sx += 2)
    for (let sz = -1; sz <= 1; sz += 2) {
      const w = cyl(0.34, 0.34, 0.22, tire, 14);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * (Wd / 2), 0.34, sz * (L / 2 - 0.8));
      g.add(w);
      const cap = cyl(0.14, 0.14, 0.24, hub, 12);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(sx * (Wd / 2 + 0.005), 0.34, sz * (L / 2 - 0.8));
      g.add(cap);
    }
  // lights
  const head = box(0.3, 0.14, 0.05, mats.tinted("#fffbe0", { emissive: "#fff0c0", emissiveIntensity: 0.4, roughness: 0.3 }));
  for (let sx = -1; sx <= 1; sx += 2) {
    const h = head.clone();
    h.position.set(sx * 0.55, 0.62, L / 2 - 0.02);
    g.add(h);
    const tail = box(0.26, 0.12, 0.05, mats.tinted("#400", { emissive: "#c02020", emissiveIntensity: 0.5, roughness: 0.4 }));
    tail.position.set(sx * 0.6, 0.62, -L / 2 + 0.02);
    g.add(tail);
  }
  g.userData.collide = true;
  g.userData.size = { L, W: Wd };
  return shadowize(g);
}

// ---------------------------------------------------------------- HYDRANT
export function hydrant(mats, rng) {
  const g = new THREE.Group();
  const m = mats.tinted(rngPick(rng, ["#b03020", "#c8a020", "#3060a0"]), { roughness: 0.5, metalness: 0.3 });
  const body = cyl(0.12, 0.14, 0.5, m, 12);
  body.position.y = 0.25;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), m);
  cap.position.y = 0.5;
  g.add(cap);
  for (let s = -1; s <= 1; s += 2) {
    const nut = cyl(0.05, 0.05, 0.1, m, 8);
    nut.rotation.z = Math.PI / 2;
    nut.position.set(s * 0.14, 0.32, 0);
    g.add(nut);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- MAILBOX
export function mailbox(mats, rng) {
  const g = new THREE.Group();
  const post = box(0.08, 1.0, 0.08, mats.get("wood-walnut"));
  post.position.y = 0.5;
  g.add(post);
  const m = mats.tinted(rngPick(rng, ["#2a4a6a", "#6a2a2a", "#2a2a2a", "#3a6a4a"]), { roughness: 0.5, metalness: 0.3 });
  const body = box(0.24, 0.22, 0.4, m);
  body.position.y = 1.0;
  g.add(body);
  const roundTop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 12, 1, false, 0, Math.PI), m);
  roundTop.rotation.z = Math.PI / 2;
  roundTop.position.set(0, 1.11, 0);
  g.add(roundTop);
  return shadowize(g);
}

// ---------------------------------------------------------------- FENCE (picket run)
export function fence(mats, rng, length, vertical = false) {
  const g = new THREE.Group();
  const m = mats.tinted(rngPick(rng, ["#e8e4d8", "#d8d4c8", "#caa078"]), { roughness: 0.7 });
  const n = Math.max(2, Math.round(length / 0.22));
  for (let i = 0; i <= n; i++) {
    const p = -length / 2 + (i / n) * length;
    const picket = box(0.06, 0.9, 0.03, m);
    // pointed top via a small prism — approximate with a thin cap
    picket.position.set(vertical ? 0 : p, 0.45, vertical ? p : 0);
    g.add(picket);
  }
  // two rails
  for (const yy of [0.3, 0.7]) {
    const rail = vertical ? box(0.04, 0.05, length, m) : box(length, 0.05, 0.04, m);
    rail.position.set(0, yy, 0);
    g.add(rail);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- HEDGE
export function hedge(mats, length, vertical = false, height = 1.0) {
  const m = mats.get("hedge");
  const w = vertical ? 0.6 : length;
  const d = vertical ? length : 0.6;
  const g = new THREE.Group();
  const body = box(w, height, d, m);
  body.position.y = height / 2;
  g.add(body);
  // bumpy top
  const n = Math.max(2, Math.round(length / 0.5));
  for (let i = 0; i < n; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), m);
    const p = -length / 2 + (i + 0.5) * (length / n);
    blob.position.set(vertical ? 0 : p, height, vertical ? p : 0);
    blob.scale.y = 0.6;
    g.add(blob);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- PLANTER
export function planter(mats, rng) {
  const g = new THREE.Group();
  const m = mats.tinted(rngPick(rng, ["#8a6a4a", "#9a9a9a", "#6a4a3a"]), { roughness: 0.8 });
  const body = box(1.0, 0.4, 0.4, m);
  body.position.y = 0.2;
  g.add(body);
  const soil = box(0.92, 0.05, 0.32, mats.tinted("#2a1c12", { roughness: 1 }));
  soil.position.y = 0.4;
  g.add(soil);
  const leaf = mats.get("leaf");
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 5), leaf);
    f.position.set(-0.4 + i * 0.16, 0.65, 0);
    f.rotation.z = (rng() - 0.5) * 0.4;
    g.add(f);
  }
  // flowers
  const fl = mats.tinted(rngPick(rng, ["#d04060", "#e0a020", "#c060c0", "#e06030"]), { roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), fl);
    b.position.set(-0.35 + i * 0.18, 0.74, (rng() - 0.5) * 0.1);
    g.add(b);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- FOUNTAIN
export function fountain(mats) {
  const g = new THREE.Group();
  const stone = mats.get("concrete");
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.5, 24), stone);
  basin.position.y = 0.25;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 0.1, 24), mats.get("water"));
  water.position.y = 0.46;
  g.add(water);
  const pedestal = cyl(0.2, 0.3, 0.9, stone, 16);
  pedestal.position.y = 0.7;
  g.add(pedestal);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.2, 0.3, 16), stone);
  bowl.position.y = 1.2;
  g.add(bowl);
  const topWater = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), mats.get("water"));
  topWater.position.y = 1.32;
  g.add(topWater);
  g.userData.collide = true;
  g.userData.radius = 1.9;
  return shadowize(g);
}

// ---------------------------------------------------------------- TRAFFIC LIGHT
export function trafficLight(mats) {
  const g = new THREE.Group();
  const iron = mats.get("iron");
  const pole = cyl(0.08, 0.1, 3.2, iron, 10);
  pole.position.y = 1.6;
  g.add(pole);
  const arm = box(0.06, 0.06, 1.4, iron);
  arm.position.set(0, 3.1, 0.7);
  g.add(arm);
  const head = box(0.22, 0.6, 0.18, mats.tinted("#1a1a1a", { roughness: 0.6 }));
  head.position.set(0, 3.0, 1.3);
  g.add(head);
  const cols = [
    ["#3a0000", "#c02020"],
    ["#3a3000", "#d0a020"],
    ["#003a10", "#20c040"],
  ];
  for (let i = 0; i < 3; i++) {
    const on = i === 2;
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 10),
      mats.tinted(cols[i][on ? 1 : 0], { emissive: on ? cols[i][1] : "#000", emissiveIntensity: on ? 1.5 : 0, roughness: 0.4 })
    );
    lens.position.set(0, 3.18 - i * 0.18, 1.4);
    g.add(lens);
  }
  return shadowize(g);
}

// ---------------------------------------------------------------- TRASH BIN
export function trashBin(mats, rng) {
  const g = new THREE.Group();
  const m = mats.tinted(rngPick(rng, ["#2a4a3a", "#3a3a3a", "#2a3a5a"]), { roughness: 0.6, metalness: 0.2 });
  const body = cyl(0.26, 0.22, 0.7, m, 12);
  body.position.y = 0.35;
  g.add(body);
  const lid = cyl(0.28, 0.28, 0.06, m, 12);
  lid.position.y = 0.72;
  g.add(lid);
  g.userData.collide = true;
  return shadowize(g);
}

// ---------------------------------------------------------------- BUS STOP
export function busStop(mats) {
  const g = new THREE.Group();
  const iron = mats.get("iron");
  const glass = mats.get("glass");
  const roof = box(2.6, 0.08, 1.2, iron);
  roof.position.y = 2.2;
  g.add(roof);
  for (let s = -1; s <= 1; s += 2) {
    const post = cyl(0.05, 0.05, 2.2, iron, 8);
    post.position.set(s * 1.2, 1.1, -0.5);
    g.add(post);
  }
  const back = box(2.5, 1.6, 0.04, glass);
  back.position.set(0, 1.2, -0.55);
  g.add(back);
  const bench = box(2.2, 0.06, 0.4, mats.get("wood-walnut"));
  bench.position.set(0, 0.5, -0.35);
  g.add(bench);
  return shadowize(g);
}
