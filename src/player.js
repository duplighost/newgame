// First-person player controller with smooth motion, sprint, jump,
// and a crouch/crawl mechanic.  Collision is AABB-based against
// solid boxes provided by the world.

import * as THREE from "three";

const STAND_EYE = 1.65;
const CROUCH_EYE = 0.55;
const PLAYER_RADIUS = 0.32;
const STAND_HEIGHT = 1.85;
const CROUCH_HEIGHT = 0.85;

const WALK = 4.2;
const SPRINT = 7.6;
const CROUCH_SPEED = 1.7;
const ACCEL = 60;
const DAMP = 11;
const AIR_DAMP = 1.2;
const GRAVITY = -28;
const JUMP_VEL = 8.0;

const MOUSE_SENS = 0.0022;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    // body position is at feet
    this.position = new THREE.Vector3(0, 0, 12);
    this.velocity = new THREE.Vector3();
    this.onGround = false;

    // yaw / pitch
    this.yaw = 0;
    this.pitch = 0;

    // stance
    this.crouching = false;
    this.eye = STAND_EYE;
    this.targetEye = STAND_EYE;
    this.height = STAND_HEIGHT;

    // head bob
    this.bob = 0;

    // input
    this.keys = {};
    this.locked = false;

    // collision colliders provided externally
    this.solids = [];

    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this._bindEvents();
  }

  setSolids(arr) {
    this.solids = arr;
  }

  _bindEvents() {
    const onMouseMove = (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * MOUSE_SENS;
      this.pitch -= e.movementY * MOUSE_SENS;
      const lim = Math.PI / 2 - 0.02;
      if (this.pitch > lim) this.pitch = lim;
      if (this.pitch < -lim) this.pitch = -lim;
    };
    document.addEventListener("mousemove", onMouseMove);

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
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }

  isMoving() {
    return (
      this.keys["KeyW"] ||
      this.keys["KeyA"] ||
      this.keys["KeyS"] ||
      this.keys["KeyD"]
    );
  }

  stance() {
    if (this.crouching) return "crouching";
    if (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) {
      if (this.isMoving()) return "sprinting";
    }
    return this.isMoving() ? "walking" : "standing";
  }

  update(dt) {
    // crouch toggle: hold C or Ctrl
    const wantCrouch =
      this.keys["KeyC"] || this.keys["ControlLeft"] || this.keys["ControlRight"];
    this.crouching = wantCrouch;
    this.targetEye = wantCrouch ? CROUCH_EYE : STAND_EYE;
    this.height = wantCrouch ? CROUCH_HEIGHT : STAND_HEIGHT;

    // smooth eye-height
    this.eye += (this.targetEye - this.eye) * Math.min(1, dt * 14);

    // forward / right based on yaw only (XZ plane)
    const sy = Math.sin(this.yaw),
      cy = Math.cos(this.yaw);
    this._fwd.set(-sy, 0, -cy);
    this._right.set(cy, 0, -sy);

    // wish dir
    let wx = 0,
      wz = 0;
    if (this.keys["KeyW"]) {
      wx += this._fwd.x;
      wz += this._fwd.z;
    }
    if (this.keys["KeyS"]) {
      wx -= this._fwd.x;
      wz -= this._fwd.z;
    }
    if (this.keys["KeyD"]) {
      wx += this._right.x;
      wz += this._right.z;
    }
    if (this.keys["KeyA"]) {
      wx -= this._right.x;
      wz -= this._right.z;
    }
    const wlen = Math.hypot(wx, wz);
    if (wlen > 0) {
      wx /= wlen;
      wz /= wlen;
    }

    const sprinting =
      (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) && !this.crouching;
    const targetSpeed = this.crouching
      ? CROUCH_SPEED
      : sprinting
      ? SPRINT
      : WALK;

    // accelerate toward target horizontal velocity
    const targetVx = wx * targetSpeed;
    const targetVz = wz * targetSpeed;

    const accel = this.onGround ? ACCEL : ACCEL * 0.3;
    this.velocity.x += (targetVx - this.velocity.x) * Math.min(1, dt * accel * 0.1);
    this.velocity.z += (targetVz - this.velocity.z) * Math.min(1, dt * accel * 0.1);

    // damping when no input
    if (wlen === 0) {
      const d = this.onGround ? DAMP : AIR_DAMP;
      const factor = Math.max(0, 1 - d * dt);
      this.velocity.x *= factor;
      this.velocity.z *= factor;
    }

    // jump
    if (this.keys["Space"] && this.onGround && !this.crouching) {
      this.velocity.y = JUMP_VEL;
      this.onGround = false;
    }

    // gravity
    this.velocity.y += GRAVITY * dt;

    // ---- integrate with collision (axis-separated) ----
    this._moveAxis(0, this.velocity.x * dt);
    this._moveAxis(2, this.velocity.z * dt);
    this._moveAxis(1, this.velocity.y * dt);

    // ground floor
    if (this.position.y <= 0) {
      this.position.y = 0;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    }

    // ---- head bob ----
    const moving = (Math.abs(this.velocity.x) + Math.abs(this.velocity.z)) > 0.5;
    const targetBobFreq = sprinting ? 12 : this.crouching ? 5 : 8;
    if (moving && this.onGround) {
      this.bob += dt * targetBobFreq;
    } else {
      this.bob *= 1 - Math.min(1, dt * 6);
    }
    const bobAmt = this.crouching ? 0.015 : sprinting ? 0.06 : 0.035;
    const bobY = Math.sin(this.bob) * bobAmt;
    const bobX = Math.cos(this.bob * 0.5) * bobAmt * 0.5;

    // ---- update camera ----
    this.camera.position.set(
      this.position.x + bobX,
      this.position.y + this.eye + bobY,
      this.position.z
    );
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")
    );
    this.camera.quaternion.copy(q);
  }

  _moveAxis(axis, delta) {
    if (delta === 0) return;
    const p = this.position;
    const old =
      axis === 0 ? p.x : axis === 1 ? p.y : p.z;
    const next = old + delta;

    // candidate AABB
    const min = new THREE.Vector3(
      p.x - PLAYER_RADIUS,
      p.y,
      p.z - PLAYER_RADIUS
    );
    const max = new THREE.Vector3(
      p.x + PLAYER_RADIUS,
      p.y + this.height,
      p.z + PLAYER_RADIUS
    );
    if (axis === 0) {
      min.x = Math.min(p.x, next) - PLAYER_RADIUS;
      max.x = Math.max(p.x, next) + PLAYER_RADIUS;
    } else if (axis === 1) {
      min.y = Math.min(p.y, next);
      max.y = Math.max(p.y, next) + this.height;
    } else {
      min.z = Math.min(p.z, next) - PLAYER_RADIUS;
      max.z = Math.max(p.z, next) + PLAYER_RADIUS;
    }

    // we'll move freely along this axis then resolve
    if (axis === 0) p.x = next;
    else if (axis === 1) p.y = next;
    else p.z = next;

    for (const s of this.solids) {
      if (!s.aabb) continue;
      // current player AABB
      const pMin = new THREE.Vector3(
        p.x - PLAYER_RADIUS,
        p.y,
        p.z - PLAYER_RADIUS
      );
      const pMax = new THREE.Vector3(
        p.x + PLAYER_RADIUS,
        p.y + this.height,
        p.z + PLAYER_RADIUS
      );

      const a = s.aabb;
      const overlap =
        pMin.x < a.max.x &&
        pMax.x > a.min.x &&
        pMin.y < a.max.y &&
        pMax.y > a.min.y &&
        pMin.z < a.max.z &&
        pMax.z > a.min.z;
      if (!overlap) continue;

      // resolve along the moving axis
      if (axis === 0) {
        if (delta > 0) p.x = a.min.x - PLAYER_RADIUS - 0.001;
        else p.x = a.max.x + PLAYER_RADIUS + 0.001;
        this.velocity.x = 0;
      } else if (axis === 1) {
        if (delta > 0) {
          p.y = a.min.y - this.height - 0.001;
          this.velocity.y = 0;
        } else {
          p.y = a.max.y + 0.001;
          this.velocity.y = 0;
          this.onGround = true;
        }
      } else {
        if (delta > 0) p.z = a.min.z - PLAYER_RADIUS - 0.001;
        else p.z = a.max.z + PLAYER_RADIUS + 0.001;
        this.velocity.z = 0;
      }
    }

    if (axis === 1 && delta < 0 && !this.onGround) {
      // not resolved by collision; on ground only if at y==0
      if (p.y > 0.001) this.onGround = false;
    }
  }
}
