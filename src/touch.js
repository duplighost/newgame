// On-screen controls for touch devices: a left thumbstick for movement,
// a right-half drag pad for looking, and buttons for jump, crouch,
// sprint and interact.  Writes into the same player it would on desktop
// (player.moveVec + player.keys + yaw/pitch), so the rest of the game
// doesn't need to know how input arrived.

export function setupTouch(player, opts = {}) {
  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `
    <div class="tc-stick" id="tcStick"><div class="tc-knob" id="tcKnob"></div></div>
    <div class="tc-look" id="tcLook"></div>
    <div class="tc-buttons">
      <button class="tc-btn" id="tcSprint" aria-label="sprint">RUN</button>
      <button class="tc-btn" id="tcCrouch" aria-label="crouch">CROUCH</button>
      <button class="tc-btn tc-jump" id="tcJump" aria-label="jump">JUMP</button>
    </div>
    <button class="tc-interact" id="tcInteract"><span class="k">E</span><span class="t">open</span></button>
  `;
  document.body.appendChild(root);

  const stick = root.querySelector("#tcStick");
  const knob = root.querySelector("#tcKnob");
  const lookPad = root.querySelector("#tcLook");
  const btnJump = root.querySelector("#tcJump");
  const btnCrouch = root.querySelector("#tcCrouch");
  const btnSprint = root.querySelector("#tcSprint");
  const btnInteract = root.querySelector("#tcInteract");

  const R = 56; // stick radius (px)
  let stickId = null;
  let stickCx = 0,
    stickCy = 0;
  let lookId = null;
  let lookX = 0,
    lookY = 0;

  player.moveVec = { x: 0, y: 0 };

  // ---- movement stick ----
  function stickStart(e) {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    stickCx = r.left + r.width / 2;
    stickCy = r.top + r.height / 2;
    stickMove(e);
  }
  function stickMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - stickCx;
      let dy = t.clientY - stickCy;
      const len = Math.hypot(dx, dy);
      const cl = Math.min(len, R);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * cl;
      const ky = Math.sin(ang) * cl;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      player.moveVec.x = kx / R;
      player.moveVec.y = -ky / R; // up = forward
      e.preventDefault();
    }
  }
  function stickEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      player.moveVec.x = 0;
      player.moveVec.y = 0;
      knob.style.transform = "translate(0,0)";
    }
  }
  stick.addEventListener("touchstart", stickStart, { passive: false });
  stick.addEventListener("touchmove", stickMove, { passive: false });
  stick.addEventListener("touchend", stickEnd);
  stick.addEventListener("touchcancel", stickEnd);

  // ---- look pad ----
  const SENS = 0.0042;
  function lookStart(e) {
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookX = t.clientX;
    lookY = t.clientY;
    e.preventDefault();
  }
  function lookMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      const dx = t.clientX - lookX;
      const dy = t.clientY - lookY;
      lookX = t.clientX;
      lookY = t.clientY;
      player.yaw -= dx * SENS;
      player.pitch -= dy * SENS;
      const lim = Math.PI / 2 - 0.02;
      player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
      e.preventDefault();
    }
  }
  function lookEnd(e) {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  }
  lookPad.addEventListener("touchstart", lookStart, { passive: false });
  lookPad.addEventListener("touchmove", lookMove, { passive: false });
  lookPad.addEventListener("touchend", lookEnd);
  lookPad.addEventListener("touchcancel", lookEnd);

  // ---- buttons ----
  const press = (el, on, off) => {
    el.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); on(); }, { passive: false });
    el.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); off && off(); });
    el.addEventListener("touchcancel", () => off && off());
  };
  // jump: momentary
  press(btnJump, () => { player.keys.Space = true; }, () => { player.keys.Space = false; });
  // crouch: toggle
  let crouch = false;
  press(btnCrouch, () => {
    crouch = !crouch;
    player.keys.KeyC = crouch;
    btnCrouch.classList.toggle("on", crouch);
  });
  // sprint: toggle
  let sprint = false;
  press(btnSprint, () => {
    sprint = !sprint;
    player.keys.ShiftLeft = sprint;
    btnSprint.classList.toggle("on", sprint);
  });
  // interact
  press(btnInteract, () => { opts.onInteract && opts.onInteract(); });

  return {
    show() { root.classList.add("on"); },
    hide() { root.classList.remove("on"); },
    setInteract(visible, label) {
      btnInteract.classList.toggle("show", !!visible);
      if (label) btnInteract.querySelector(".t").textContent = label;
    },
    // releasing crouch when standing headroom is blocked is handled by the
    // player itself; keep the toggle visual in sync if it auto-stands.
    syncCrouch(isCrouching) {
      if (crouch !== isCrouching) {
        crouch = isCrouching;
        btnCrouch.classList.toggle("on", crouch);
      }
    },
  };
}
