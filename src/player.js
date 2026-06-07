// First-person controller: smooth motion, sprint, jump, crouch/crawl,
// head-bob, AABB collision with sliding, and step-up "mantling" so the
// player can climb through windowsills and onto low objects.
//
// Colliders are supplied each frame by the chunk manager as records of
// { box: THREE.Box3, enabled?: bool }.  Disabled colliders (an open door
// or window) are ignored.

import * as THREE from "three";

const STAND_EYE = 1.62;
const CROUCH_EYE = 0.6;
const RADIUS = 0.3;
const STAND_H = 1.8;
const CROUCH_H = 0.9;

const WALK = 4.2;
const SPRINT = 7.4;
const CROUCH_SPEED = 1.8;
const GRAVITY = -26;
const JUMP_VEL = 7.6;
const STEP_MAX = 1.15; // how high you can mantle

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.eye = STAND_EYE;
    this.height = STAND_H;
    this.bob = 0;
    this.keys = {};
    this.locked = false;
    this.moveVec = { x: 0, y: 0 }; // analog input (touch): x=strafe, y=forward
    this.solids = [];
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._bind();
  }

  setSolids(arr) {
    this.solids = arr;
  }

  _bind() {
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      const lim = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.dom;
    });
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "Space") e.preventDefault();
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });
  }

  requestLock() {
    this.dom.requestPointerLock?.();
  }

  isMoving() {
    return (
      this.keys.KeyW ||
      this.keys.KeyA ||
      this.keys.KeyS ||
      this.keys.KeyD ||
      Math.abs(this.moveVec.x) > 0.1 ||
      Math.abs(this.moveVec.y) > 0.1
    );
  }

  stance() {
    if (this.crouching) return "crouching";
    if ((this.keys.ShiftLeft || this.keys.ShiftRight) && this.isMoving()) return "sprinting";
    return this.isMoving() ? "walking" : "standing";
  }

  lookDir(out) {
    out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
    return out;
  }

  update(dt) {
    const p = this.position;

    // ---- stance (with headroom check before standing) ----
    const wantCrouch = this.keys.KeyC || this.keys.ControlLeft || this.keys.ControlRight;
    if (wantCrouch) {
      this.crouching = true;
    } else if (this.crouching) {
      // only stand if there's room
      if (!this._column(p.x, p.z, p.y, STAND_H)) this.crouching = false;
    }
    this.height = this.crouching ? CROUCH_H : STAND_H;
    const targetEye = this.crouching ? CROUCH_EYE : STAND_EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 14);

    // ---- desired horizontal velocity ----
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    this._fwd.set(-sy, 0, -cy);
    this._right.set(cy, 0, -sy);
    let wx = 0,
      wz = 0;
    if (this.keys.KeyW) (wx += this._fwd.x), (wz += this._fwd.z);
    if (this.keys.KeyS) (wx -= this._fwd.x), (wz -= this._fwd.z);
    if (this.keys.KeyD) (wx += this._right.x), (wz += this._right.z);
    if (this.keys.KeyA) (wx -= this._right.x), (wz -= this._right.z);
    // analog stick (touch)
    wx += this._fwd.x * this.moveVec.y + this._right.x * this.moveVec.x;
    wz += this._fwd.z * this.moveVec.y + this._right.z * this.moveVec.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) (wx /= wl), (wz /= wl); // allow analog magnitudes < 1 (slow walk)

    const sprinting = (this.keys.ShiftLeft || this.keys.ShiftRight) && !this.crouching;
    const speed = this.crouching ? CROUCH_SPEED : sprinting ? SPRINT : WALK;
    const tvx = wx * speed,
      tvz = wz * speed;
    const accel = this.onGround ? 12 : 4;
    this.velocity.x += (tvx - this.velocity.x) * Math.min(1, dt * accel);
    this.velocity.z += (tvz - this.velocity.z) * Math.min(1, dt * accel);

    if (this.keys.Space && this.onGround && !this.crouching) {
      this.velocity.y = JUMP_VEL;
      this.onGround = false;
    }
    this.velocity.y += GRAVITY * dt;

    // ---- horizontal move with sliding + step-up ----
    const sx = p.x,
      sz = p.z,
      syy = p.y;
    const dx = this.velocity.x * dt,
      dz = this.velocity.z * dt;
    this._moveX(dx);
    this._moveZ(dz);

    const wanted = Math.hypot(dx, dz);
    const moved = Math.hypot(p.x - sx, p.z - sz);
    if (this.onGround && wanted > 1e-4 && moved < wanted * 0.72) {
      // blocked — attempt to mantle up onto the obstacle
      for (const step of [0.35, 0.7, STEP_MAX]) {
        p.x = sx;
        p.z = sz;
        p.y = syy + step;
        if (this._column(p.x, p.z, p.y, this.height)) continue; // no room at raised feet
        this._moveX(dx);
        this._moveZ(dz);
        const moved2 = Math.hypot(p.x - sx, p.z - sz);
        if (moved2 > moved + 0.03 && !this._column(p.x, p.z, p.y, this.height)) {
          this.velocity.y = Math.max(this.velocity.y, 0);
          this.onGround = false;
          break;
        }
        p.x = sx;
        p.z = sz;
        p.y = syy;
      }
    }

    // ---- vertical move ----
    this._moveY(this.velocity.y * dt);
    if (p.y <= 0) {
      p.y = 0;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    }

    // ---- head bob + camera ----
    const moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.6 && this.onGround;
    const freq = sprinting ? 12 : this.crouching ? 6 : 8.5;
    if (moving) this.bob += dt * freq;
    else this.bob *= 1 - Math.min(1, dt * 6);
    const amp = this.crouching ? 0.018 : sprinting ? 0.06 : 0.034;
    const bobY = Math.sin(this.bob) * amp;
    const bobX = Math.cos(this.bob * 0.5) * amp * 0.6;

    this.camera.position.set(p.x + bobX, p.y + this.eye + bobY, p.z);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  }

  // does the player's column overlap any enabled solid?
  _column(x, z, feetY, h) {
    const minx = x - RADIUS,
      maxx = x + RADIUS,
      minz = z - RADIUS,
      maxz = z + RADIUS;
    const miny = feetY + 0.02,
      maxy = feetY + h;
    for (const s of this.solids) {
      if (s.enabled === false || !s.box) continue;
      const a = s.box;
      if (minx < a.max.x && maxx > a.min.x && miny < a.max.y && maxy > a.min.y && minz < a.max.z && maxz > a.min.z)
        return true;
    }
    return false;
  }

  _moveX(d) {
    if (d === 0) return;
    const p = this.position;
    p.x += d;
    for (const s of this.solids) {
      if (s.enabled === false || !s.box) continue;
      const a = s.box;
      if (
        p.x - RADIUS < a.max.x &&
        p.x + RADIUS > a.min.x &&
        p.y + 0.02 < a.max.y &&
        p.y + this.height > a.min.y &&
        p.z - RADIUS < a.max.z &&
        p.z + RADIUS > a.min.z
      ) {
        p.x = d > 0 ? a.min.x - RADIUS - 0.001 : a.max.x + RADIUS + 0.001;
        this.velocity.x = 0;
      }
    }
  }

  _moveZ(d) {
    if (d === 0) return;
    const p = this.position;
    p.z += d;
    for (const s of this.solids) {
      if (s.enabled === false || !s.box) continue;
      const a = s.box;
      if (
        p.x - RADIUS < a.max.x &&
        p.x + RADIUS > a.min.x &&
        p.y + 0.02 < a.max.y &&
        p.y + this.height > a.min.y &&
        p.z - RADIUS < a.max.z &&
        p.z + RADIUS > a.min.z
      ) {
        p.z = d > 0 ? a.min.z - RADIUS - 0.001 : a.max.z + RADIUS + 0.001;
        this.velocity.z = 0;
      }
    }
  }

  _moveY(d) {
    if (d === 0) return;
    const p = this.position;
    p.y += d;
    this.onGround = false;
    for (const s of this.solids) {
      if (s.enabled === false || !s.box) continue;
      const a = s.box;
      if (
        p.x - RADIUS < a.max.x &&
        p.x + RADIUS > a.min.x &&
        p.z - RADIUS < a.max.z &&
        p.z + RADIUS > a.min.z &&
        p.y < a.max.y &&
        p.y + this.height > a.min.y
      ) {
        if (d > 0) {
          p.y = a.min.y - this.height - 0.001;
          this.velocity.y = 0;
        } else {
          p.y = a.max.y + 0.001;
          this.velocity.y = 0;
          this.onGround = true;
        }
      }
    }
  }
}
