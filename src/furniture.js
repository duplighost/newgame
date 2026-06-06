// Furniture & small props.  Every builder returns a THREE.Group with
// shadows enabled.  Groups whose userData.collide === true are turned
// into collision boxes by the interior builder once placed.

import * as THREE from "three";
import { rngPick, rngRange, rngChance } from "./rng.js";

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const cyl = (rt, rb, h, mat, seg = 16) =>
  new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

function shadowize(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// ----------------------------------------------------------------- SOFA
export function sofa(mats, fabricName, rng) {
  const g = new THREE.Group();
  const f = mats.get(fabricName);
  const base = box(2.6, 0.45, 1.0, f);
  base.position.y = 0.28;
  g.add(base);
  const back = box(2.6, 0.72, 0.25, f);
  back.position.set(0, 0.66, -0.4);
  g.add(back);
  const armL = box(0.24, 0.56, 1.0, f);
  armL.position.set(-1.3, 0.52, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 1.3;
  g.add(armR);
  for (let i = -1; i <= 1; i++) {
    const c = box(0.8, 0.2, 0.82, f);
    c.position.set(i * 0.85, 0.6, 0.04);
    g.add(c);
    const bk = box(0.8, 0.34, 0.16, f);
    bk.position.set(i * 0.85, 0.78, -0.34);
    g.add(bk);
  }
  // throw pillows
  const pcols = ["#d4a566", "#8a4a4a", "#4a6a7a", "#c0b090"];
  for (let i = 0; i < 2; i++) {
    const p = box(0.34, 0.34, 0.14, mats.tinted(rngPick(rng, pcols), { roughness: 0.9 }));
    p.position.set((i ? 1 : -1) * 0.95, 0.74, 0.08);
    p.rotation.z = (i ? -1 : 1) * 0.25;
    g.add(p);
  }
  const fm = mats.get("wood-walnut");
  for (let i = 0; i < 4; i++) {
    const ft = box(0.06, 0.12, 0.06, fm);
    ft.position.set(i % 2 ? 1.2 : -1.2, 0.06, i < 2 ? 0.4 : -0.4);
    g.add(ft);
  }
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- ARMCHAIR
export function armchair(mats, fabricName) {
  const g = new THREE.Group();
  const f = mats.get(fabricName);
  const base = box(0.92, 0.45, 0.86, f);
  base.position.y = 0.28;
  g.add(base);
  const back = box(0.92, 0.74, 0.18, f);
  back.position.set(0, 0.64, -0.34);
  g.add(back);
  const cushion = box(0.76, 0.18, 0.72, f);
  cushion.position.set(0, 0.58, 0);
  g.add(cushion);
  const armL = box(0.16, 0.5, 0.86, f);
  armL.position.set(-0.38, 0.5, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(armR);
  const fm = mats.get("wood-walnut");
  for (let i = 0; i < 4; i++) {
    const ft = cyl(0.03, 0.03, 0.14, fm, 8);
    ft.position.set(i % 2 ? 0.36 : -0.36, 0.07, i < 2 ? 0.34 : -0.34);
    g.add(ft);
  }
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- COFFEE TABLE
export function coffeeTable(mats, rng) {
  const g = new THREE.Group();
  const w = mats.get(rngPick(rng, ["wood-walnut", "wood-oak"]));
  const top = box(1.3, 0.06, 0.7, w);
  top.position.y = 0.44;
  g.add(top);
  for (let i = 0; i < 4; i++) {
    const leg = box(0.06, 0.42, 0.06, w);
    leg.position.set(i % 2 ? 0.6 : -0.6, 0.22, i < 2 ? 0.3 : -0.3);
    g.add(leg);
  }
  // clutter
  const vase = cyl(0.06, 0.08, 0.22, mats.tinted("#e8e8e8", { roughness: 0.4 }));
  vase.position.set(0.3, 0.57, 0);
  g.add(vase);
  const b1 = box(0.32, 0.04, 0.22, mats.tinted("#3a4d6a", { roughness: 0.8 }));
  b1.position.set(-0.35, 0.48, 0.1);
  g.add(b1);
  const b2 = box(0.3, 0.04, 0.2, mats.tinted("#8a6a3a", { roughness: 0.8 }));
  b2.position.set(-0.35, 0.52, 0.1);
  b2.rotation.y = 0.2;
  g.add(b2);
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- SIDE TABLE
export function sideTable(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-walnut");
  const top = cyl(0.3, 0.3, 0.04, w, 24);
  top.position.y = 0.58;
  g.add(top);
  const stem = cyl(0.04, 0.04, 0.56, w, 12);
  stem.position.y = 0.28;
  g.add(stem);
  const base = cyl(0.22, 0.22, 0.04, w, 24);
  base.position.y = 0.02;
  g.add(base);
  return shadowize(g);
}

// ----------------------------------------------------------------- BOOKSHELF
export function bookshelf(mats, rng) {
  const g = new THREE.Group();
  const w = mats.get("wood-walnut");
  const frame = box(1.4, 1.9, 0.32, w);
  frame.position.y = 0.95;
  g.add(frame);
  const back = box(1.34, 1.84, 0.05, mats.tinted("#2a1e14", { roughness: 0.95 }));
  back.position.set(0, 0.95, -0.13);
  g.add(back);
  for (let i = 1; i <= 4; i++) {
    const s = box(1.34, 0.04, 0.3, w);
    s.position.y = i * 0.38 + 0.02;
    g.add(s);
  }
  const cols = [0x6a2a2a, 0x2a3a6a, 0x4a6a2a, 0x6a5a2a, 0x6a3a5a, 0x2a4a4a, 0x8a4a2a, 0x3a3a3a];
  for (let row = 0; row < 4; row++) {
    let x = -0.62;
    while (x < 0.6) {
      const bw = 0.04 + rng() * 0.06;
      const bh = 0.26 + rng() * 0.1;
      const b = box(bw, bh, 0.22, mats.tinted("#" + cols[(rng() * cols.length) | 0].toString(16).padStart(6, "0"), { roughness: 0.85 }));
      b.position.set(x + bw / 2, row * 0.38 + 0.06 + bh / 2, 0);
      if (rngChance(rng, 0.12)) {
        b.rotation.z = 0.18;
        b.position.y -= 0.02;
      }
      g.add(b);
      x += bw + 0.004;
    }
  }
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- TV UNIT + TV
export function tvUnit(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-walnut");
  const unit = box(1.8, 0.4, 0.45, w);
  unit.position.y = 0.2;
  g.add(unit);
  const stand = box(0.1, 0.18, 0.2, mats.get("iron"));
  stand.position.set(0, 0.49, 0);
  g.add(stand);
  const tv = box(1.5, 0.86, 0.05, mats.get("screen-dark"));
  tv.position.set(0, 1.05, 0);
  g.add(tv);
  const bezel = box(1.56, 0.92, 0.03, mats.tinted("#0a0a0a", { roughness: 0.4 }));
  bezel.position.set(0, 1.05, -0.02);
  g.add(bezel);
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- FIREPLACE
export function fireplace(mats) {
  const g = new THREE.Group();
  const stone = mats.get("concrete");
  const surround = box(1.8, 1.5, 0.4, stone);
  surround.position.y = 0.75;
  g.add(surround);
  const cavity = box(1.0, 0.9, 0.3, mats.tinted("#0a0808", { roughness: 1 }));
  cavity.position.set(0, 0.6, 0.12);
  g.add(cavity);
  const mantel = box(2.0, 0.12, 0.5, mats.get("wood-walnut"));
  mantel.position.y = 1.56;
  g.add(mantel);
  // glowing embers
  const fire = box(0.9, 0.3, 0.16, mats.tinted("#ff7020", { emissive: "#ff5010", emissiveIntensity: 2.5, roughness: 1 }));
  fire.position.set(0, 0.3, 0.16);
  g.add(fire);
  g.userData.collide = true;
  g.userData.fireLight = true; // interior builder adds a flickering point light
  return shadowize(g);
}

// ----------------------------------------------------------------- LAMPS
export function floorLamp(mats) {
  const g = new THREE.Group();
  const iron = mats.get("iron");
  const base = cyl(0.18, 0.2, 0.04, iron, 20);
  base.position.y = 0.02;
  g.add(base);
  const pole = cyl(0.02, 0.02, 1.6, iron, 10);
  pole.position.y = 0.84;
  g.add(pole);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.26, 0.32, 24, 1, true),
    mats.tinted("#e8d4a8", { emissive: "#ffb060", emissiveIntensity: 0.7, roughness: 0.9 })
  );
  shade.material.side = THREE.DoubleSide;
  shade.position.y = 1.74;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), mats.get("lamp-warm"));
  bulb.position.y = 1.7;
  g.add(bulb);
  const light = new THREE.PointLight(0xffb86b, 4.5, 8.5, 2.0);
  light.position.y = 1.7;
  g.add(light);
  g.userData.light = light;
  return shadowize(g);
}

export function pendantLight(mats, color = "#c89060") {
  const g = new THREE.Group();
  const cord = cyl(0.005, 0.005, 0.5, mats.tinted("#1a1a1a"), 6);
  cord.position.y = -0.25;
  g.add(cord);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.2, 24, 1, true),
    mats.tinted(color, { metalness: 0.6, roughness: 0.3 })
  );
  shade.material.side = THREE.DoubleSide;
  shade.position.y = -0.56;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), mats.get("lamp-warm"));
  bulb.position.y = -0.56;
  g.add(bulb);
  const light = new THREE.PointLight(0xffd29a, 5, 9, 2.0);
  light.position.y = -0.62;
  g.add(light);
  g.userData.light = light;
  return shadowize(g);
}

export function tableLamp(mats) {
  const g = new THREE.Group();
  const base = cyl(0.06, 0.09, 0.18, mats.get("brass"), 16);
  base.position.y = 0.09;
  g.add(base);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.15, 0.18, 20, 1, true),
    mats.tinted("#f0e0c0", { emissive: "#ffc070", emissiveIntensity: 0.8, roughness: 0.9 })
  );
  shade.material.side = THREE.DoubleSide;
  shade.position.y = 0.3;
  g.add(shade);
  const light = new THREE.PointLight(0xffcf90, 2.6, 5, 2.0);
  light.position.y = 0.3;
  g.add(light);
  g.userData.light = light;
  return shadowize(g);
}

// ----------------------------------------------------------------- PLANT
export function plant(mats, rng) {
  const g = new THREE.Group();
  const pot = cyl(0.22, 0.18, 0.34, mats.tinted(rngPick(rng, ["#b87a4a", "#8a8a8a", "#d8d2c4"]), { roughness: 0.7 }), 18);
  pot.position.y = 0.17;
  g.add(pot);
  const leaf = mats.get("leaf");
  const n = 8 + (rng() * 6) | 0;
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.07 + rng() * 0.05, 0.5 + rng() * 0.4, 5), leaf);
    const a = rng() * 7,
      r = rng() * 0.16;
    c.position.set(Math.cos(a) * r, 0.5 + rng() * 0.4, Math.sin(a) * r);
    c.rotation.set((rng() - 0.5) * 0.7, rng() * 7, (rng() - 0.5) * 0.7);
    g.add(c);
  }
  return shadowize(g);
}

// ----------------------------------------------------------------- PAINTING
export function painting(mats, rng, w = 1.0, h = 0.78) {
  const g = new THREE.Group();
  const theme = rngPick(rng, ["landscape", "abstract", "portrait", "landscape"]);
  const frame = box(w + 0.1, h + 0.1, 0.04, mats.get(rngChance(rng, 0.5) ? "wood-walnut" : "brass"));
  g.add(frame);
  const canvasM = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.paintingMat(theme, rng));
  canvasM.position.z = 0.025;
  g.add(canvasM);
  return shadowize(g);
}

// ----------------------------------------------------------------- BED
export function bed(mats, rng, size = "double") {
  const g = new THREE.Group();
  const w = size === "double" ? 1.6 : 1.0;
  const frameM = mats.get("wood-walnut");
  const frame = box(w + 0.1, 0.35, 2.1, frameM);
  frame.position.y = 0.2;
  g.add(frame);
  const head = box(w + 0.1, 0.7, 0.1, frameM);
  head.position.set(0, 0.5, -1.05);
  g.add(head);
  const mattress = box(w, 0.22, 1.95, mats.tinted("#e8e2d4", { roughness: 0.95 }));
  mattress.position.y = 0.48;
  g.add(mattress);
  // duvet
  const duvet = box(w + 0.06, 0.16, 1.4, mats.tinted(rngPick(rng, ["#8a4a4a", "#3a5a6a", "#5a6a4a", "#6a5a7a"]), { roughness: 0.9 }));
  duvet.position.set(0, 0.6, 0.25);
  g.add(duvet);
  // pillows
  for (let i = 0; i < (size === "double" ? 2 : 1); i++) {
    const p = box(0.6, 0.16, 0.36, mats.tinted("#f4efe6", { roughness: 0.95 }));
    p.position.set(size === "double" ? (i ? 0.42 : -0.42) : 0, 0.64, -0.7);
    g.add(p);
  }
  g.userData.collide = true;
  return shadowize(g);
}

export function nightstand(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-walnut");
  const body = box(0.46, 0.5, 0.4, w);
  body.position.y = 0.25;
  g.add(body);
  const drawer = box(0.4, 0.16, 0.02, mats.tinted("#2a1c12", { roughness: 0.6 }));
  drawer.position.set(0, 0.34, 0.2);
  g.add(drawer);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mats.get("brass"));
  knob.position.set(0, 0.34, 0.22);
  g.add(knob);
  g.userData.collide = true;
  return shadowize(g);
}

export function wardrobe(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-walnut");
  const body = box(1.2, 2.0, 0.6, w);
  body.position.y = 1.0;
  g.add(body);
  for (let i = 0; i < 2; i++) {
    const door = box(0.56, 1.9, 0.03, mats.get("wood-oak"));
    door.position.set(i ? 0.3 : -0.3, 1.0, 0.31);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), mats.get("brass"));
    knob.position.set(i ? 0.05 : -0.05, 1.0, 0.34);
    g.add(knob);
  }
  g.userData.collide = true;
  return shadowize(g);
}

export function dresser(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-walnut");
  const body = box(1.1, 0.9, 0.5, w);
  body.position.y = 0.45;
  g.add(body);
  for (let r = 0; r < 3; r++) {
    const d = box(1.0, 0.24, 0.02, mats.get("wood-oak"));
    d.position.set(0, 0.2 + r * 0.27, 0.26);
    g.add(d);
    for (let i = 0; i < 2; i++) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mats.get("brass"));
      knob.position.set(i ? 0.22 : -0.22, 0.2 + r * 0.27, 0.28);
      g.add(knob);
    }
  }
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- DINING
export function diningTable(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-oak");
  const top = box(1.8, 0.07, 0.95, w);
  top.position.y = 0.75;
  g.add(top);
  for (let i = 0; i < 4; i++) {
    const leg = box(0.08, 0.72, 0.08, w);
    leg.position.set(i % 2 ? 0.8 : -0.8, 0.36, i < 2 ? 0.4 : -0.4);
    g.add(leg);
  }
  // centrepiece
  const bowl = cyl(0.14, 0.1, 0.08, mats.tinted("#c8a060", { roughness: 0.4 }), 18);
  bowl.position.y = 0.82;
  g.add(bowl);
  g.userData.collide = true;
  return shadowize(g);
}

export function diningChair(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-oak");
  const seat = box(0.44, 0.06, 0.44, w);
  seat.position.y = 0.46;
  g.add(seat);
  const back = box(0.44, 0.5, 0.05, w);
  back.position.set(0, 0.72, -0.2);
  g.add(back);
  for (let i = 0; i < 4; i++) {
    const leg = box(0.05, 0.46, 0.05, w);
    leg.position.set(i % 2 ? 0.18 : -0.18, 0.23, i < 2 ? 0.18 : -0.18);
    g.add(leg);
  }
  return shadowize(g);
}

// ----------------------------------------------------------------- KITCHEN
export function kitchenCounter(mats, len = 2.4) {
  const g = new THREE.Group();
  const cab = mats.tinted("#e4e0d6", { roughness: 0.5 });
  const body = box(len, 0.86, 0.62, cab);
  body.position.y = 0.43;
  g.add(body);
  const top = box(len + 0.04, 0.06, 0.66, mats.get("granite"));
  top.position.y = 0.89;
  g.add(top);
  // doors
  const n = Math.max(2, Math.round(len / 0.6));
  for (let i = 0; i < n; i++) {
    const d = box(len / n - 0.04, 0.7, 0.02, mats.tinted("#d8d4c8", { roughness: 0.5 }));
    d.position.set(-len / 2 + (i + 0.5) * (len / n), 0.45, 0.32);
    g.add(d);
    const knob = cyl(0.01, 0.01, 0.06, mats.get("steel"), 8);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(-len / 2 + (i + 0.5) * (len / n) + 0.2, 0.62, 0.34);
    g.add(knob);
  }
  g.userData.collide = true;
  return shadowize(g);
}

export function upperCabinets(mats, len = 2.4) {
  const g = new THREE.Group();
  const body = box(len, 0.7, 0.34, mats.tinted("#e4e0d6", { roughness: 0.5 }));
  body.position.y = 0;
  g.add(body);
  const n = Math.max(2, Math.round(len / 0.6));
  for (let i = 0; i < n; i++) {
    const d = box(len / n - 0.04, 0.64, 0.02, mats.tinted("#d8d4c8", { roughness: 0.5 }));
    d.position.set(-len / 2 + (i + 0.5) * (len / n), 0, 0.18);
    g.add(d);
  }
  return shadowize(g);
}

export function fridge(mats) {
  const g = new THREE.Group();
  const body = box(0.7, 1.8, 0.7, mats.get("steel"));
  body.position.y = 0.9;
  g.add(body);
  const seam = box(0.72, 0.02, 0.02, mats.tinted("#888", { metalness: 0.6, roughness: 0.4 }));
  seam.position.set(0, 1.1, 0.35);
  g.add(seam);
  const h1 = box(0.04, 0.5, 0.04, mats.get("chrome"));
  h1.position.set(0.28, 1.4, 0.37);
  g.add(h1);
  const h2 = h1.clone();
  h2.position.y = 0.7;
  g.add(h2);
  g.userData.collide = true;
  return shadowize(g);
}

export function stove(mats) {
  const g = new THREE.Group();
  const body = box(0.7, 0.86, 0.62, mats.get("steel"));
  body.position.y = 0.43;
  g.add(body);
  const top = box(0.7, 0.04, 0.62, mats.tinted("#1a1a1a", { roughness: 0.3 }));
  top.position.y = 0.88;
  g.add(top);
  for (let i = 0; i < 4; i++) {
    const burner = cyl(0.09, 0.09, 0.01, mats.tinted("#0a0a0a", { roughness: 0.5 }), 16);
    burner.position.set(i % 2 ? 0.16 : -0.16, 0.91, i < 2 ? 0.14 : -0.14);
    g.add(burner);
  }
  const oven = box(0.56, 0.4, 0.02, mats.get("screen-dark"));
  oven.position.set(0, 0.4, 0.32);
  g.add(oven);
  g.userData.collide = true;
  return shadowize(g);
}

export function rangeHood(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.36, 0.4, 4),
    mats.get("steel")
  );
  body.rotation.y = Math.PI / 4;
  g.add(body);
  return shadowize(g);
}

export function barStool(mats) {
  const g = new THREE.Group();
  const seat = cyl(0.18, 0.18, 0.06, mats.tinted("#3a2a1a", { roughness: 0.6 }), 18);
  seat.position.y = 0.72;
  g.add(seat);
  const pole = cyl(0.03, 0.03, 0.72, mats.get("steel"), 10);
  pole.position.y = 0.36;
  g.add(pole);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 18), mats.get("steel"));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.28;
  g.add(ring);
  return shadowize(g);
}

// ----------------------------------------------------------------- BATHROOM
export function bathtub(mats) {
  const g = new THREE.Group();
  const m = mats.tinted("#f4f2ee", { roughness: 0.25 });
  const body = box(1.7, 0.6, 0.78, m);
  body.position.y = 0.3;
  g.add(body);
  const inner = box(1.5, 0.4, 0.6, mats.tinted("#e8e6e0", { roughness: 0.2 }));
  inner.position.y = 0.45;
  g.add(inner);
  g.userData.collide = true;
  return shadowize(g);
}

export function toilet(mats) {
  const g = new THREE.Group();
  const m = mats.tinted("#f6f4f0", { roughness: 0.2 });
  const bowl = cyl(0.2, 0.24, 0.4, m, 18);
  bowl.position.y = 0.2;
  g.add(bowl);
  const seat = cyl(0.24, 0.24, 0.06, m, 18);
  seat.position.y = 0.42;
  g.add(seat);
  const tank = box(0.5, 0.4, 0.18, m);
  tank.position.set(0, 0.6, -0.22);
  g.add(tank);
  g.userData.collide = true;
  return shadowize(g);
}

export function vanity(mats) {
  const g = new THREE.Group();
  const body = box(0.7, 0.8, 0.45, mats.get("wood-walnut"));
  body.position.y = 0.4;
  g.add(body);
  const top = box(0.74, 0.06, 0.49, mats.get("marble"));
  top.position.y = 0.83;
  g.add(top);
  const basin = cyl(0.16, 0.13, 0.1, mats.tinted("#f4f2ee", { roughness: 0.2 }), 18);
  basin.position.y = 0.88;
  g.add(basin);
  const tap = cyl(0.012, 0.012, 0.12, mats.get("chrome"), 8);
  tap.position.set(0, 0.92, -0.12);
  g.add(tap);
  g.userData.collide = true;
  return shadowize(g);
}

export function mirror(mats, w = 0.7, h = 0.9) {
  const g = new THREE.Group();
  const frame = box(w + 0.06, h + 0.06, 0.03, mats.get("wood-walnut"));
  g.add(frame);
  const glass = box(w, h, 0.01, mats.get("mirror"));
  glass.position.z = 0.02;
  g.add(glass);
  return shadowize(g);
}

// ----------------------------------------------------------------- DESK
export function desk(mats) {
  const g = new THREE.Group();
  const w = mats.get("wood-oak");
  const top = box(1.3, 0.05, 0.62, w);
  top.position.y = 0.74;
  g.add(top);
  const side = box(0.5, 0.7, 0.58, w);
  side.position.set(-0.38, 0.37, 0);
  g.add(side);
  for (let i = 0; i < 2; i++) {
    const leg = box(0.05, 0.72, 0.05, mats.get("iron"));
    leg.position.set(0.6, 0.36, i ? 0.26 : -0.26);
    g.add(leg);
  }
  g.userData.collide = true;
  return shadowize(g);
}

// ----------------------------------------------------------------- RUG MESH
export function rugMesh(mats, rng, w = 3.4, d = 2.3) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mats.freshRug(rng));
  m.position.y = 0.012;
  m.receiveShadow = true;
  return m;
}

// ----------------------------------------------------------------- CURTAINS
export function curtains(mats, rng, w, h) {
  const g = new THREE.Group();
  const col = rngPick(rng, ["#e6c896", "#a8b89a", "#d6b0a8", "#b0c0d0", "#c8b0a0"]);
  const m = mats.tinted(col, { roughness: 0.95 });
  m.side = THREE.DoubleSide;
  for (let i = 0; i < 2; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, h), m);
    c.position.set((i ? 1 : -1) * (w * 0.32), 0, 0.04);
    g.add(c);
  }
  // valance
  const val = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.05, 0.18), m);
  val.position.set(0, h / 2 - 0.06, 0.05);
  g.add(val);
  return shadowize(g);
}

// ----------------------------------------------------------------- INTERIOR DOOR (decorative, open frame)
export function interiorDoorway(mats, w = 0.95, h = 2.05) {
  const g = new THREE.Group();
  const trim = mats.get("wood-oak");
  const top = box(w + 0.16, 0.08, 0.16, trim);
  top.position.y = h;
  g.add(top);
  const l = box(0.08, h, 0.16, trim);
  l.position.set(-w / 2 - 0.04, h / 2, 0);
  g.add(l);
  const r = l.clone();
  r.position.x = w / 2 + 0.04;
  g.add(r);
  return shadowize(g);
}

// ----------------------------------------------------------------- STAIRS
export function stairs(mats, steps = 12, rise = 0.2, run = 0.26, width = 1.0) {
  const g = new THREE.Group();
  const w = mats.get("wood-oak");
  for (let i = 0; i < steps; i++) {
    const step = box(width, rise, run, w);
    step.position.set(0, rise / 2 + i * rise, -i * run);
    g.add(step);
    const riser = box(width, rise, 0.02, mats.tinted("#3a2a1a", { roughness: 0.6 }));
    riser.position.set(0, i * rise, -i * run + run / 2);
    g.add(riser);
  }
  g.userData.collide = true; // a ramp collider is added separately
  g.userData.stairs = { steps, rise, run, width };
  return shadowize(g);
}

// ----------------------------------------------------------------- CLUTTER
export function mug(mats, rng) {
  return shadowize(cyl(0.04, 0.035, 0.08, mats.tinted(rngPick(rng, ["#d8d8d8", "#8a4a4a", "#3a5a6a"]), { roughness: 0.4 }), 12));
}

export function bookStack(mats, rng) {
  const g = new THREE.Group();
  const cols = ["#6a2a2a", "#2a3a6a", "#4a6a2a", "#6a5a2a"];
  let y = 0;
  for (let i = 0; i < 2 + ((rng() * 3) | 0); i++) {
    const h = 0.035;
    const b = box(0.2 + rng() * 0.06, h, 0.26, mats.tinted(rngPick(rng, cols), { roughness: 0.8 }));
    b.position.y = y + h / 2;
    b.rotation.y = (rng() - 0.5) * 0.2;
    g.add(b);
    y += h;
  }
  return shadowize(g);
}
