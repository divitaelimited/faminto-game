const keys = {};
let mouseDown = false;
let screenX = 0;
let screenY = 0;

export function initInput() {
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  window.addEventListener('mousedown', (e) => {
    mouseDown = true;
    // Convert to Three.js NDC (-1 to +1)
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
}

export function getInputDirection() {
  let x = 0, z = 0;
  if (keys['ArrowUp']    || keys['w'] || keys['W']) z -= 1;
  if (keys['ArrowDown']  || keys['s'] || keys['S']) z += 1;
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) x -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) x += 1;
  if (x !== 0 || z !== 0) {
    const len = Math.sqrt(x * x + z * z);
    return { x: x / len, z: z / len, keyboard: true, mouse: false };
  }

  if (mouseDown) {
    return { x: 0, z: 0, keyboard: false, mouse: true, screenX, screenY };
  }

  return { x: 0, z: 0, keyboard: false, mouse: false };
}