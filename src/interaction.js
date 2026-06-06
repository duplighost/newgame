// Interaction: pick the interactable the player is looking at, drive its
// open/close animation, and toggle its colliders.  Handles swinging
// doors, up-sliding window sashes and roll-up garage doors.

import * as THREE from "three";

const smooth = (t) => t * t * (3 - 2 * t);

export class Interaction {
  constructor() {
    this.active = []; // currently animating interactables
    this.current = null; // the one in focus
    this._to = new THREE.Vector3();
  }

  // Find the best interactable for the player's position + look direction.
  pick(playerPos, lookDir, list) {
    let best = null;
    let bestScore = Infinity;
    for (const it of list) {
      if (!it.worldPos) continue;
      this._to.copy(it.worldPos).sub(playerPos);
      const dist = this._to.length();
      if (dist > 2.6) continue;
      this._to.normalize();
      const facing = this._to.dot(lookDir); // looking toward it?
      // allow close items even if not perfectly aimed
      if (facing < 0.1 && dist > 1.4) continue;
      const score = dist - facing * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    return best;
  }

  toggle(it) {
    if (!it) return;
    it.isOpen = !it.isOpen;
    // colliders: blocker disabled while open
    for (const c of it.colliders) c.enabled = !it.isOpen;
    if (!this.active.includes(it)) this.active.push(it);
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      const a = it.anim;
      const target = it.isOpen ? 1 : 0;
      const speed = a.type === "swing" ? 3.2 : 2.6;
      a.t += (target - a.t) * Math.min(1, dt * speed);
      if (Math.abs(a.t - target) < 0.004) a.t = target;
      const e = smooth(Math.min(1, Math.max(0, a.t)));
      if (a.type === "swing") {
        it.node.rotation.y = a.from + (a.to - a.from) * e;
      } else if (a.type === "slideY") {
        it.node.position.y = (it._baseY ?? (it._baseY = it.node.position.y)) + (a.to - a.from) * e;
      }
      if (a.t === target) this.active.splice(i, 1);
    }
  }
}
