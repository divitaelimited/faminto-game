// ─── input.js ─────────────────────────────────────────────────────────────────
// Handles keyboard, mouse, AND touch (virtual joystick) input.

const keys = {};
let mouseDown = false;
let screenX = 0;
let screenY = 0;

// ── Virtual joystick state ─────────────────────────────────────────────────────
let joystickActive = false;
let joystickTouchId = null;
let joystickBaseX = 0;
let joystickBaseY = 0;
let joystickDX = 0;
let joystickDZ = 0;

const JOYSTICK_MAX_RADIUS = 50; // px — how far the knob travels before clamping

// ── DOM elements (created once initInput() is called) ─────────────────────────
let joystickOuter = null;
let joystickKnob  = null;

function createJoystick() {
  // Only show joystick on touch-primary devices
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const style = document.createElement('style');
  style.textContent = `
    #joystick-outer {
      position: fixed;
      bottom: 60px;
      left: 50px;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      border: 2px solid rgba(255,255,255,0.18);
      backdrop-filter: blur(4px);
      touch-action: none;
      pointer-events: all;
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #joystick-knob {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: rgba(255,255,255,0.35);
      border: 2px solid rgba(255,255,255,0.55);
      pointer-events: none;
      transition: transform 0.05s;
      will-change: transform;
    }
  `;
  document.head.appendChild(style);

  joystickOuter = document.createElement('div');
  joystickOuter.id = 'joystick-outer';

  joystickKnob = document.createElement('div');
  joystickKnob.id = 'joystick-knob';

  joystickOuter.appendChild(joystickKnob);
  document.body.appendChild(joystickOuter);

  // ── Touch handlers ─────────────────────────────────────────────────────────
  joystickOuter.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joystickActive) return; // only one finger on the stick
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickActive  = true;

    const rect = joystickOuter.getBoundingClientRect();
    joystickBaseX = rect.left + rect.width  / 2;
    joystickBaseY = rect.top  + rect.height / 2;

    updateJoystick(touch.clientX, touch.clientY);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === joystickTouchId) {
        e.preventDefault();
        updateJoystick(touch.clientX, touch.clientY);
      }
    }
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
      if (touch.identifier === joystickTouchId) {
        joystickActive  = false;
        joystickTouchId = null;
        joystickDX = 0;
        joystickDZ = 0;
        if (joystickKnob) {
          joystickKnob.style.transform = 'translate(0px, 0px)';
        }
      }
    }
  });

  window.addEventListener('touchcancel', (e) => {
    joystickActive  = false;
    joystickTouchId = null;
    joystickDX = 0;
    joystickDZ = 0;
    if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
  });
}

function updateJoystick(clientX, clientY) {
  let dx = clientX - joystickBaseX;
  let dy = clientY - joystickBaseY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > JOYSTICK_MAX_RADIUS) {
    dx = (dx / dist) * JOYSTICK_MAX_RADIUS;
    dy = (dy / dist) * JOYSTICK_MAX_RADIUS;
  }

  joystickDX = dx / JOYSTICK_MAX_RADIUS;   // -1 … +1 (world X)
  joystickDZ = dy / JOYSTICK_MAX_RADIUS;   // -1 … +1 (world Z, screen-Y maps to Z)

  if (joystickKnob) {
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initInput() {
  // Keyboard
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  // Mouse (desktop)
  window.addEventListener('mousedown', (e) => {
    mouseDown = true;
    screenX = (e.clientX / window.innerWidth)  *  2 - 1;
    screenY = (e.clientY / window.innerHeight) * -2 + 1;
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    screenX = (e.clientX / window.innerWidth)  *  2 - 1;
    screenY = (e.clientY / window.innerHeight) * -2 + 1;
  });
  window.addEventListener('mouseup',    () => { mouseDown = false; });
  window.addEventListener('mouseleave', () => { mouseDown = false; });

  // Virtual joystick (touch)
  createJoystick();
}

export function getInputDirection() {
  // 1. Keyboard
  let x = 0, z = 0;
  if (keys['ArrowUp']    || keys['w'] || keys['W']) z -= 1;
  if (keys['ArrowDown']  || keys['s'] || keys['S']) z += 1;
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) x -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) x += 1;
  if (x !== 0 || z !== 0) {
    const len = Math.sqrt(x * x + z * z);
    return { x: x / len, z: z / len, keyboard: true, mouse: false, joystick: false };
  }

  // 2. Virtual joystick
  if (joystickActive && (Math.abs(joystickDX) > 0.05 || Math.abs(joystickDZ) > 0.05)) {
    return { x: joystickDX, z: joystickDZ, keyboard: true, mouse: false, joystick: true };
    // NOTE: we use keyboard:true so game.js takes the direct x/z path (same movement logic)
  }

  // 3. Mouse click-to-move
  if (mouseDown) {
    return { x: 0, z: 0, keyboard: false, mouse: true, joystick: false, screenX, screenY };
  }

  return { x: 0, z: 0, keyboard: false, mouse: false, joystick: false };
}
