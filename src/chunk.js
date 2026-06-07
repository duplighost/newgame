// Infinite, deterministic, chunk-streamed world.
//
// The plane is tiled into square chunks.  Each chunk's contents are
// generated from a hash of its (cx, cz) coords, so the same place always
// looks the same and the city extends forever.  Chunks within LOAD_R of
// the player are built; those within DETAIL_R get furnished interiors
// and working doors/windows, the rest get cheap sealed shells.  Chunks
// that drift out of range are disposed.

import * as THREE from "three";
import { mulberry32, chunkSeed, rngPick, rngRange, rngInt, rngChance } from "./rng.js";
import * as B from "./buildings.js";
import * as P from "./props.js";

export const CHUNK = 46;
const ROAD = 9;
const BLOCK = CHUNK - ROAD; // inner buildable square side

const _box = new THREE.Box3();
function worldAABB(obj) {
  // works for single meshes and whole groups (cars, furniture, …);
  // setFromObject ignores visibility, so invisible blockers still count.
  return new THREE.Box3().setFromObject(obj);
}

export class ChunkManager {
  constructor(scene, mats, opts = {}) {
    this.scene = scene;
    this.mats = mats;
    this.loadR = opts.loadR ?? 3;
    this.detailR = opts.detailR ?? 1;
    this.chunks = new Map(); // key -> chunk
    this.curKey = null;
    this._tmp = new THREE.Vector3();
  }

  key(cx, cz) {
    return cx + "," + cz;
  }

  worldToChunk(x, z) {
    return [Math.round(x / CHUNK), Math.round(z / CHUNK)];
  }

  update(playerPos) {
    const [pcx, pcz] = this.worldToChunk(playerPos.x, playerPos.z);

    // desired set
    const want = new Map();
    for (let dx = -this.loadR; dx <= this.loadR; dx++) {
      for (let dz = -this.loadR; dz <= this.loadR; dz++) {
        const cx = pcx + dx,
          cz = pcz + dz;
        const detail = Math.abs(dx) <= this.detailR && Math.abs(dz) <= this.detailR;
        want.set(this.key(cx, cz), { cx, cz, detail });
      }
    }

    // unload chunks no longer wanted
    for (const [k, ch] of this.chunks) {
      if (!want.has(k)) {
        this.disposeChunk(ch);
        this.chunks.delete(k);
      }
    }

    // load / upgrade. Limit builds per frame to avoid hitches.
    let budget = 2;
    for (const [k, w] of want) {
      const existing = this.chunks.get(k);
      if (!existing) {
        if (budget <= 0) continue;
        this.chunks.set(k, this.buildChunk(w.cx, w.cz, w.detail));
        budget--;
      } else if (existing.detail !== w.detail) {
        if (budget <= 0) continue;
        this.disposeChunk(existing);
        this.chunks.set(k, this.buildChunk(w.cx, w.cz, w.detail));
        budget--;
      }
    }
  }

  disposeChunk(ch) {
    this.scene.remove(ch.group);
    ch.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose?.();
      }
      if (o.isLight) o.dispose?.();
    });
  }

  // gather active colliders near a world position (3x3 chunk neighborhood)
  collectSolids(x, z, out) {
    out.length = 0;
    const [pcx, pcz] = this.worldToChunk(x, z);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(this.key(pcx + dx, pcz + dz));
        if (!ch) continue;
        for (const s of ch.solids) out.push(s);
      }
    return out;
  }

  // active interactables/windows/lights for chunks near the player
  collectActive(x, z) {
    const [pcx, pcz] = this.worldToChunk(x, z);
    const interact = [];
    const windows = [];
    const lights = [];
    for (let dx = -this.detailR; dx <= this.detailR; dx++)
      for (let dz = -this.detailR; dz <= this.detailR; dz++) {
        const ch = this.chunks.get(this.key(pcx + dx, pcz + dz));
        if (!ch) continue;
        for (const it of ch.interactables) interact.push(it);
        for (const w of ch.windows) windows.push(w);
      }
    // lights from full load radius (for culling)
    for (const ch of this.chunks.values()) for (const l of ch.lights) lights.push(l);
    return { interact, windows, lights };
  }

  // ---------------------------------------------------------------- build
  buildChunk(cx, cz, detail) {
    const mats = this.mats;
    const group = new THREE.Group();
    const ox = cx * CHUNK,
      oz = cz * CHUNK;
    group.position.set(ox, 0, oz);

    const solids = [];
    const lights = [];
    const interactables = [];
    const windows = [];
    const rng = mulberry32(chunkSeed(cx, cz));

    // ---- ground tile ----
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), mats.get(rngChance(rng, 0.15) ? "grass-dry" : "grass"));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    group.add(grass);

    // ---- roads on south & west edges (shared grid) ----
    const road = mats.get("asphalt");
    const rS = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, ROAD), road);
    rS.rotation.x = -Math.PI / 2;
    rS.position.set(0, 0.01, -CHUNK / 2);
    rS.receiveShadow = true;
    group.add(rS);
    const rW = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CHUNK), road);
    rW.rotation.x = -Math.PI / 2;
    rW.position.set(-CHUNK / 2, 0.01, 0);
    rW.receiveShadow = true;
    group.add(rW);
    this.addStripes(group, mats);

    // ---- sidewalk ring + inner grass ----
    const swSide = BLOCK - 1;
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(swSide, swSide), mats.get("concrete"));
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(ROAD / 2, 0.02, ROAD / 2); // shift away from the two roads
    sw.receiveShadow = true;
    group.add(sw);
    const innerSide = swSide - 6;
    const ig = new THREE.Mesh(new THREE.PlaneGeometry(innerSide, innerSide), mats.get("grass"));
    ig.rotation.x = -Math.PI / 2;
    ig.position.set(ROAD / 2, 0.03, ROAD / 2);
    ig.receiveShadow = true;
    group.add(ig);

    // ---- corner lamppost near the SW intersection ----
    const lamp = P.lamppost(mats);
    lamp.position.set(-CHUNK / 2 + ROAD / 2 + 0.5, 0, -CHUNK / 2 + ROAD / 2 + 0.5);
    group.add(lamp);
    lights.push({ light: lamp.userData.light });

    // ---- pick a block archetype (spawn chunk is always houses) ----
    const type =
      cx === 0 && cz === 0
        ? "houses"
        : rngPick(rng, ["houses", "houses", "townrow", "apartments", "park", "shops", "mixed"]);

    const bctx = { mats, rng, detail, solids: [], lights: [], interactables: [], windows: [] };

    // a little local helper to place a building group with collision/light/portal merge
    const place = (bgroup, x, z, yaw) => {
      bgroup.position.set(x, 0, z);
      bgroup.rotation.y = yaw;
      group.add(bgroup);
    };

    if (type === "houses" || type === "mixed") {
      this.genHouses(group, bctx, rng, type === "mixed");
    } else if (type === "townrow") {
      this.genTownrow(group, bctx, rng);
    } else if (type === "apartments") {
      this.genApartments(group, bctx, rng);
    } else if (type === "shops") {
      this.genShops(group, bctx, rng);
    } else if (type === "park") {
      this.genPark(group, bctx, rng);
    }

    // merge building-context arrays
    for (const s of bctx.solids) solids.push(s);
    for (const l of bctx.lights) lights.push(l);
    for (const it of bctx.interactables) interactables.push(it);
    for (const w of bctx.windows) windows.push(w);

    // ---- scatter trees on the inner lawn (deterministic) ----
    const nTrees = rngInt(rng, 1, 4);
    for (let i = 0; i < nTrees; i++) {
      const tx = ROAD / 2 + rngRange(rng, -innerSide / 2 + 1, innerSide / 2 - 1);
      const tz = ROAD / 2 + rngRange(rng, -innerSide / 2 + 1, innerSide / 2 - 1);
      const tr = P.tree(mats, rng);
      tr.position.set(tx, 0, tz);
      tr.rotation.y = rng() * 7;
      group.add(tr);
      // slim trunk collider
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), mats.get("bark"));
      trunk.visible = false;
      trunk.position.set(tx, 1.2, tz);
      group.add(trunk);
      solids.push({ mesh: trunk });
    }

    // ---- attach + compute world AABBs ----
    this.scene.add(group);
    group.updateMatrixWorld(true);
    for (const s of solids) {
      if (s.mesh) s.box = worldAABB(s.mesh);
    }
    // precompute interactable world transforms
    for (const it of interactables) {
      it.worldPos = it.group.localToWorld(it.local.clone());
      it.worldDir = it.facing.clone().transformDirection(it.group.matrixWorld).normalize();
    }
    for (const w of windows) {
      w.worldPos = w.group.localToWorld(w.local.clone());
    }

    return { group, solids, lights, interactables, windows, detail, cx, cz };
  }

  addStripes(group, mats) {
    const stripe = mats.tinted("#e8c050", { roughness: 0.6 });
    for (let x = -CHUNK / 2 + 2; x < CHUNK / 2; x += 4) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.14), stripe);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.02, -CHUNK / 2);
      group.add(s);
    }
    for (let z = -CHUNK / 2 + 2; z < CHUNK / 2; z += 4) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 2), stripe);
      s.rotation.x = -Math.PI / 2;
      s.position.set(-CHUNK / 2, 0.02, z);
      group.add(s);
    }
  }

  // place a row of detached houses along the south edge facing south,
  // and (sometimes) a row along the north edge facing north.
  genHouses(group, bctx, rng, mixed) {
    const { mats } = bctx;
    const edgeZ = -BLOCK / 2 + 1.5; // near south sidewalk
    const setbackInner = BLOCK / 2 - 1.5;

    const rowFront = (z, yaw) => {
      let x = -BLOCK / 2 + 3 + ROAD / 2;
      const xMax = BLOCK / 2 - 3 + ROAD / 2;
      let placed = 0;
      while (x < xMax && placed < 3) {
        if (mixed && placed === 1) {
          const shop = B.buildShop(bctx);
          const W = shop.userData.size.W;
          shop.position.set(x + W / 2, 0, z);
          shop.rotation.y = yaw;
          group.add(shop);
          x += W + rngRange(rng, 1.5, 3);
        } else {
          const h = B.buildDetachedHouse(bctx);
          const W = h.userData.size.W;
          if (x + W / 2 > xMax) break;
          h.position.set(x + W / 2, 0, z);
          h.rotation.y = yaw;
          group.add(h);
          // garden fence + mailbox out front
          if (rngChance(rng, 0.6)) {
            const mb = P.mailbox(mats, rng);
            const front = new THREE.Vector3(0, 0, yaw === Math.PI ? -1 : 1);
            mb.position.set(x + W / 2 - W / 2 + 0.5, 0, z + (yaw === Math.PI ? -h.userData.size.D / 2 - 1.5 : h.userData.size.D / 2 + 1.5));
            group.add(mb);
          }
          x += W + rngRange(rng, 2.5, 4.5);
          placed++;
        }
      }
    };

    rowFront(ROAD / 2 - BLOCK / 2 + 2.0, Math.PI); // south row faces -Z (south)
    if (rngChance(rng, 0.7)) rowFront(ROAD / 2 + BLOCK / 2 - 2.0, 0); // north row faces +Z

    // a parked car or two by the south curb
    if (rngChance(rng, 0.7)) {
      const c = P.car(mats, rng);
      c.position.set(rngRange(rng, -BLOCK / 4, BLOCK / 4) + ROAD / 2, 0, -CHUNK / 2 + ROAD / 2 + 0.5);
      c.rotation.y = Math.PI / 2;
      group.add(c);
      bctx.solids.push({ mesh: c, furniture: true });
    }
    // hydrant
    if (rngChance(rng, 0.4)) {
      const hy = P.hydrant(mats, rng);
      hy.position.set(-BLOCK / 2 + ROAD / 2 + 1, 0, -CHUNK / 2 + ROAD / 2 + 1.5);
      group.add(hy);
    }
  }

  genTownrow(group, bctx, rng) {
    const { mats } = bctx;
    const z = ROAD / 2 - BLOCK / 2 + 2.5;
    let x = -BLOCK / 2 + 2.5 + ROAD / 2;
    const xMax = BLOCK / 2 - 2 + ROAD / 2;
    const W = rngRange(rng, 5.0, 5.8);
    while (x + W < xMax) {
      const th = B.buildTownhouse(bctx, W);
      th.position.set(x + W / 2, 0, z);
      th.rotation.y = Math.PI;
      group.add(th);
      x += W; // shared walls — abut
    }
    // stoops/planters
    for (let i = 0; i < 3; i++) {
      const pl = P.planter(mats, rng);
      pl.position.set(-BLOCK / 4 + i * (BLOCK / 4) + ROAD / 2, 0, -CHUNK / 2 + ROAD / 2 + 1.2);
      group.add(pl);
      bctx.solids.push({ mesh: pl });
    }
    if (rngChance(rng, 0.8)) {
      const c = P.car(mats, rng);
      c.position.set(rngRange(rng, -BLOCK / 4, BLOCK / 4) + ROAD / 2, 0, -CHUNK / 2 + ROAD / 2 + 0.5);
      c.rotation.y = Math.PI / 2;
      group.add(c);
      bctx.solids.push({ mesh: c, furniture: true });
    }
  }

  genApartments(group, bctx, rng) {
    const { mats } = bctx;
    const big = B.buildTower(bctx, { W: rngRange(rng, 11, 14), D: rngRange(rng, 11, 14), floors: rngInt(rng, 5, 11) });
    big.position.set(ROAD / 2, 0, ROAD / 2);
    big.rotation.y = rngInt(rng, 0, 3) * (Math.PI / 2);
    group.add(big);
    bctx.solids.push({ mesh: big.children[0], furniture: false }); // bulk collider
    // surrounding props
    for (let i = 0; i < 2; i++) {
      const c = P.car(mats, rng);
      c.position.set(rngRange(rng, -BLOCK / 3, BLOCK / 3) + ROAD / 2, 0, -CHUNK / 2 + ROAD / 2 + 0.5);
      c.rotation.y = Math.PI / 2;
      group.add(c);
      bctx.solids.push({ mesh: c, furniture: true });
    }
    const bin = P.trashBin(mats, rng);
    bin.position.set(-BLOCK / 2 + ROAD / 2 + 1.5, 0, -BLOCK / 2 + ROAD / 2 + 1.5);
    group.add(bin);
    bctx.solids.push({ mesh: bin });
    const bs = P.busStop(mats);
    bs.position.set(ROAD / 2, 0, -CHUNK / 2 + ROAD / 2 + 1.2);
    group.add(bs);
  }

  genShops(group, bctx, rng) {
    const { mats } = bctx;
    const z = ROAD / 2 - BLOCK / 2 + 2.5;
    let x = -BLOCK / 2 + 2.5 + ROAD / 2;
    const xMax = BLOCK / 2 - 2 + ROAD / 2;
    while (x < xMax) {
      const shop = B.buildShop(bctx);
      const W = shop.userData.size.W;
      if (x + W > xMax) break;
      shop.position.set(x + W / 2, 0, z);
      shop.rotation.y = Math.PI;
      group.add(shop);
      const pl = P.planter(mats, rng);
      pl.position.set(x + W / 2, 0, -CHUNK / 2 + ROAD / 2 + 1.0);
      group.add(pl);
      bctx.solids.push({ mesh: pl });
      x += W + rngRange(rng, 0.5, 1.5);
    }
    const tl = P.trafficLight(mats);
    tl.position.set(-BLOCK / 2 + ROAD / 2, 0, -CHUNK / 2 + ROAD / 2);
    group.add(tl);
  }

  genPark(group, bctx, rng) {
    const { mats } = bctx;
    const cx = ROAD / 2,
      cz = ROAD / 2;
    const f = P.fountain(mats);
    f.position.set(cx, 0, cz);
    group.add(f);
    bctx.solids.push({ mesh: f.children[0] });
    // ring of benches + lampposts
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const b = P.bench(mats);
      b.position.set(cx + Math.cos(a) * 4, 0, cz + Math.sin(a) * 4);
      b.rotation.y = -a + Math.PI / 2;
      group.add(b);
      bctx.solids.push({ mesh: b });
    }
    for (let i = 0; i < 2; i++) {
      const lp = P.lamppost(mats);
      const a = (i / 2) * Math.PI * 2 + 0.8;
      lp.position.set(cx + Math.cos(a) * 7, 0, cz + Math.sin(a) * 7);
      group.add(lp);
      bctx.lights.push({ light: lp.userData.light });
    }
    // hedges around the perimeter
    const half = BLOCK / 2 - 2;
    bctx; // (hedges are decorative; collide so you wander the paths)
    const h1 = P.hedge(mats, BLOCK - 8, false, 0.9);
    h1.position.set(cx, 0, cz - half + 1);
    group.add(h1);
    bctx.solids.push({ mesh: h1.children[0] });
    const h2 = P.hedge(mats, BLOCK - 8, false, 0.9);
    h2.position.set(cx, 0, cz + half - 1);
    group.add(h2);
    bctx.solids.push({ mesh: h2.children[0] });
  }
}
