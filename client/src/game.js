import * as THREE from 'three';
import { initInput, getInputDirection } from './input.js';
import {
  initNetwork, sendPosition, sendName,
  playSolo, createRoom, joinRoom,
  myId, otherHoles,
  updateTimerUI, updateLeaderboardUI, registerLeaderboardSource,
  sendAbsorb
} from './network.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 130);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 20, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(30, 50, 30);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

const groundCanvas = document.createElement('canvas');
groundCanvas.width = 512; groundCanvas.height = 512;
const ctx = groundCanvas.getContext('2d');
const TILE = 64;
for (let row = 0; row < 512 / TILE; row++) {
  for (let col = 0; col < 512 / TILE; col++) {
    ctx.fillStyle = (row + col) % 2 === 0 ? '#5DBB5D' : '#52A852';
    ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
  }
}
const groundTex = new THREE.CanvasTexture(groundCanvas);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(10, 10);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(110, 110),
  new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const wallMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
[[0,1,-55,110,2,2],[0,1,55,110,2,2],[-55,1,0,2,2,110],[55,1,0,2,2,110]].forEach(([x,y,z,w,h,d]) => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat);
  wall.position.set(x,y,z);
  scene.add(wall);
});

export const worldObjects = [];
const BUILDING_COLORS  = [0xE74C3C,0x3498DB,0xF39C12,0x9B59B6,0x1ABC9C,0xE67E22,0xF1C40F,0x2ECC71];
const SMALL_OBJ_COLORS = [0xA0522D,0x8B4513,0xD2691E,0xCD853F];

function addBox(x, z, w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.size = Math.max(w, d);
  mesh.userData.height = h;
  mesh.userData.absorbed = false;
  mesh.userData.originalY = h / 2;
  scene.add(mesh);
  worldObjects.push(mesh);
}

function spawnObjects() {
  for (let i = 0; i < 40; i++) {
    const w = 1.5 + Math.random() * 2.5;
    const h = 2 + Math.random() * 5;
    const d = 1.5 + Math.random() * 2.5;
    addBox((Math.random()-0.5)*90, (Math.random()-0.5)*90, w, h, d,
      BUILDING_COLORS[Math.floor(Math.random()*BUILDING_COLORS.length)]);
  }
  for (let i = 0; i < 60; i++) {
    const s = 0.6 + Math.random() * 1.2;
    addBox((Math.random()-0.5)*90, (Math.random()-0.5)*90, s, s*(0.5+Math.random()), s,
      BUILDING_COLORS[Math.floor(Math.random()*BUILDING_COLORS.length)]);
  }
  for (let i = 0; i < 100; i++) {
    const s = 0.3 + Math.random() * 0.5;
    addBox((Math.random()-0.5)*88, (Math.random()-0.5)*88, s, s, s,
      SMALL_OBJ_COLORS[Math.floor(Math.random()*SMALL_OBJ_COLORS.length)]);
  }
}
spawnObjects();

let holeRadius = 1.5;
let holeX = 0;
let holeZ = 0;
let roundOver = false;
let gameStarted = false;
let playerName = 'Player';
let isSoloMode = false;

const holeMesh = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48),
  new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false })
);
holeMesh.rotation.x = -Math.PI / 2;
holeMesh.position.y = 0.03;
scene.add(holeMesh);

const ringMesh = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.1, 48),
  new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, depthWrite: false })
);
ringMesh.rotation.x = -Math.PI / 2;
ringMesh.position.y = 0.04;
scene.add(ringMesh);

const HOLE_SPEED = 7;
const MAP_LIMIT = 50;
const absorbingObjects = [];

function resetObjects() {
  for (const obj of worldObjects) {
    obj.userData.absorbed = false;
    obj.scale.set(1, 1, 1);
    obj.position.y = obj.userData.originalY;
    obj.visible = true;
    if (!scene.children.includes(obj)) scene.add(obj);
  }
}

function checkAbsorption() {
  for (const obj of worldObjects) {
    if (obj.userData.absorbed) continue;
    const dx = holeX - obj.position.x;
    const dz = holeZ - obj.position.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    const footprint = obj.userData.size * 0.5;
    const objSize = obj.userData.size;
    if (horizDist - footprint < holeRadius && objSize < holeRadius * 1.8) {
      obj.userData.absorbed = true;
      absorbingObjects.push({ mesh: obj, timer: 0 });
      holeRadius += objSize * 0.06 / (1 + holeRadius * 0.15);
      holeRadius = Math.min(holeRadius, 28);
    }
  }
}

const recentlyAbsorbed = new Set();

function checkPlayerAbsorption() {
  if (isSoloMode || roundOver) return;
  for (const [id, data] of Object.entries(otherHoles)) {
    if (recentlyAbsorbed.has(id)) continue;
    const dx = holeX - data.mesh.position.x;
    const dz = holeZ - data.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const theirRadius = data.radius || data.mesh.scale.x;
    if (holeRadius > theirRadius * 1.2 && dist < holeRadius * 0.85) {
      holeRadius += theirRadius * 0.15;
      holeRadius = Math.min(holeRadius, 28);
      sendAbsorb(id);
      recentlyAbsorbed.add(id);
      setTimeout(() => recentlyAbsorbed.delete(id), 3000);
    }
  }
}

function animateAbsorbing(delta) {
  const target = new THREE.Vector3(holeX, 0, holeZ);
  for (let i = absorbingObjects.length - 1; i >= 0; i--) {
    const entry = absorbingObjects[i];
    entry.timer += delta;
    const t = Math.min(entry.timer / 0.4, 1);
    entry.mesh.position.lerp(target, delta * 10);
    entry.mesh.scale.setScalar(Math.max(1 - t * t, 0.01));
    entry.mesh.position.y = t * -0.5;
    if (entry.timer > 0.4) {
      scene.remove(entry.mesh);
      absorbingObjects.splice(i, 1);
    }
  }
}

function showEndScreen(title, size) {
  roundOver = true;
  const el = document.getElementById('round-end');
  if (!el) return;
  el.classList.remove('hidden');
  el.style.pointerEvents = 'all';
  el.innerHTML =
    '<h2>' + title + '</h2>' +
    '<div class="lb-item" style="margin:12px 0">Final size: ' + size + '</div>' +
    '<div style="display:flex;gap:16px;margin-top:24px">' +
      '<button id="btnContinue" style="padding:12px 28px;font-size:18px;border-radius:8px;' +
        'border:none;background:#2196F3;color:#fff;cursor:pointer">Play Again</button>' +
      '<button id="btnEnd" style="padding:12px 28px;font-size:18px;border-radius:8px;' +
        'border:none;background:#e53935;color:#fff;cursor:pointer">End Game</button>' +
    '</div>';

  document.getElementById('btnContinue').addEventListener('click', () => {
    el.classList.add('hidden');
    el.style.pointerEvents = 'none';
    roundOver = false;
    holeRadius = 1.5;
    holeX = (Math.random() - 0.5) * 60;
    holeZ = (Math.random() - 0.5) * 60;
    resetObjects();
  });

  document.getElementById('btnEnd').addEventListener('click', () => {
    location.reload();
  });
}

function checkRoundOver() {
  if (roundOver) return;
  const remaining = worldObjects.filter(o => !o.userData.absorbed);
  if (remaining.length === 0 && worldObjects.length > 0) {
    showEndScreen('You ate everything!', holeRadius.toFixed(1));
  }
}

registerLeaderboardSource(() => {
  const entries = [{ name: playerName, radius: holeRadius.toFixed(1), isMe: true }];
  for (const [id, data] of Object.entries(otherHoles)) {
    entries.push({
      name: data.name || 'Opponent',
      radius: (data.mesh ? data.mesh.scale.x : data.radius || 0).toFixed(1),
      isMe: false
    });
  }
  return entries.sort((a, b) => parseFloat(b.radius) - parseFloat(a.radius)).slice(0, 5);
});

let lastTime = performance.now();

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (gameStarted) {
    const dir = getInputDirection();

    if (dir.keyboard) {
      holeX += dir.x * HOLE_SPEED * delta;
      holeZ += dir.z * HOLE_SPEED * delta;
    } else if (dir.mouse) {
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(dir.screenX, dir.screenY);
      raycaster.setFromCamera(mouse, camera);
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const worldTarget = new THREE.Vector3();
      raycaster.ray.intersectPlane(groundPlane, worldTarget);
      if (worldTarget) {
        const dx = worldTarget.x - holeX;
        const dz = worldTarget.z - holeZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.5) {
          const step = Math.min(HOLE_SPEED * delta, dist);
          holeX += (dx / dist) * step;
          holeZ += (dz / dist) * step;
        }
      }
    }

    holeX = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, holeX));
    holeZ = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, holeZ));

    holeMesh.position.x = holeX;
    holeMesh.position.z = holeZ;
    holeMesh.scale.setScalar(holeRadius);
    ringMesh.position.x = holeX;
    ringMesh.position.z = holeZ;
    ringMesh.scale.setScalar(holeRadius);

    camera.position.x += (holeX - camera.position.x) * 0.1;
    camera.position.z += (holeZ + 12 - camera.position.z) * 0.1;
    camera.position.y = 14 + holeRadius * 1.8;
    camera.lookAt(holeX, 0, holeZ);

    checkAbsorption();
    checkPlayerAbsorption();
    checkRoundOver();
    animateAbsorbing(delta);

    document.getElementById('sizeDisplay').textContent = holeRadius.toFixed(1);
    sendPosition({ x: holeX, z: holeZ, radius: holeRadius });
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(gameLoop);

// ─── UI Handlers ─────────────────────────────────────────────────────────────

function getNameInput() {
  return document.getElementById('nameInput').value.trim() || 'Player';
}

export function startGameUI() {
  document.getElementById('overlay').classList.add('hidden');
  gameStarted = true;
  initInput();
}

document.getElementById('btnSolo').addEventListener('click', () => {
  playerName = getNameInput();
  isSoloMode = true;
  playSolo(playerName);
  startGameUI();
});

document.getElementById('btnCreate').addEventListener('click', () => {
  playerName = getNameInput();
  isSoloMode = false;
  createRoom(playerName);
});

document.getElementById('btnJoin').addEventListener('click', () => {
  const jp = document.getElementById('join-panel');
  jp.style.display = jp.style.display === 'flex' ? 'none' : 'flex';
  document.getElementById('error-msg').textContent = '';
});

document.getElementById('btnJoinConfirm').addEventListener('click', () => {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return;
  playerName = getNameInput();
  isSoloMode = false;
  document.getElementById('error-msg').textContent = '';
  joinRoom(code, playerName);
});

document.getElementById('roomCodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnJoinConfirm').click();
});

document.getElementById('btnStartRoom').addEventListener('click', () => {
  startGameUI();
});

document.getElementById('nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btnSolo').click();
});

// ─── Map Editor button ────────────────────────────────────────────────────────
document.getElementById('btnEditor').addEventListener('click', () => {
  window.open('/map-editor.html', '_blank');
});

// ─── Network Init ─────────────────────────────────────────────────────────────

initNetwork({
  scene,
  THREE,
  onInit: ({ timer, roundActive, solo }) => {
    updateTimerUI(timer);
    setInterval(updateLeaderboardUI, 1000);
    if (!gameStarted && !solo) {
      startGameUI();
    }
  },
  onRespawn: ({ x, z }) => {
    holeX = x;
    holeZ = z;
    holeRadius = 1.5;
  },
  onRoundStart: () => {
    const hasLocalScreen = !!document.getElementById('btnContinue');
    if (!hasLocalScreen) {
      roundOver = false;
      holeRadius = 1.5;
      holeX = (Math.random() - 0.5) * 60;
      holeZ = (Math.random() - 0.5) * 60;
      resetObjects();
    }
  },
  onRoundEnd: () => {}
});

let soloTimerExpired = false;
setInterval(() => {
  if (!gameStarted || roundOver || !isSoloMode) return;
  const timerEl = document.getElementById('timer');
  if (timerEl && timerEl.textContent === '0:00') {
    if (!soloTimerExpired) {
      soloTimerExpired = true;
      showEndScreen('Time\'s Up!', holeRadius.toFixed(1));
    }
  } else {
    soloTimerExpired = false;
  }
}, 500);
