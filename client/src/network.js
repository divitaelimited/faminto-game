import { io } from 'socket.io-client';

let _scene = null;
let _THREE = null;
let _onInit = null;
let _onRoundStart = null;
let _onRoundEnd = null;
let _onRespawn = null;

export let myId = null;
export let socket = null;
export let currentRoom = null;

// FIX Bug 5: otherHoles now stores { mesh, name, radius } objects instead of bare meshes.
// game.js reads data.name and data.mesh from each entry.
export const otherHoles = {};

export function initNetwork(deps) {
  _scene        = deps.scene;
  _THREE        = deps.THREE;
  _onInit       = deps.onInit       || (() => {});
  _onRoundStart = deps.onRoundStart || (() => {});
  _onRoundEnd   = deps.onRoundEnd   || (() => {});
  _onRespawn    = deps.onRespawn    || (() => {});

  const serverUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin;

  socket = io(serverUrl, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('Connected:', socket.id);
  });

  socket.on('init', ({ id, players, timer, roundActive, roomCode, solo }) => {
    myId = id;
    currentRoom = roomCode;
    for (const [pid, pdata] of Object.entries(players)) {
      if (pid !== myId) _addOtherHole(pid, pdata);
    }
    _onInit({ timer, roundActive, solo });
    updateTimerUI(timer);

    // Show room badge in-game
    const badge = document.getElementById('room-badge');
    const badgeCode = document.getElementById('roomBadgeCode');
    if (badge && badgeCode && !solo) {
      badge.style.display = 'block';
      badgeCode.textContent = roomCode;
    }
  });

  socket.on('room_created', ({ code }) => {
    document.getElementById('roomCodeDisplay').textContent = code;
    const rd = document.getElementById('room-display');
    if (rd) rd.style.display = 'flex';
  });

  socket.on('room_error', ({ message }) => {
    const el = document.getElementById('error-msg');
    if (el) el.textContent = message;
  });

  socket.on('player_joined', (data) => {
    if (data.id !== myId) _addOtherHole(data.id, data);
  });

  socket.on('player_left', ({ id }) => {
    if (otherHoles[id]) {
      _scene.remove(otherHoles[id].mesh);   // FIX Bug 5: remove .mesh
      delete otherHoles[id];
    }
  });

  socket.on('game_state', ({ players }) => {
    for (const [pid, pdata] of Object.entries(players)) {
      if (pid === myId) continue;
      if (!otherHoles[pid]) {
        _addOtherHole(pid, pdata);
      } else {
        const entry = otherHoles[pid];
        entry.mesh.position.x += (pdata.x - entry.mesh.position.x) * 0.3;
        entry.mesh.position.z += (pdata.z - entry.mesh.position.z) * 0.3;
        entry.mesh.scale.setScalar(pdata.radius);
        entry.name = pdata.name;       // FIX Bug 5: keep name in sync
        entry.radius = pdata.radius;   // FIX Bug 5: keep radius in sync
      }
    }
  });

  socket.on('round_start', ({ timer }) => {
    updateTimerUI(timer);
    const hasLocalScreen = !!document.getElementById('btnContinue');
    if (!hasLocalScreen) _onRoundStart();
  });

  socket.on('round_end', ({ leaderboard }) => {
    const hasLocalScreen = !!document.getElementById('btnContinue');
    if (!hasLocalScreen) {
      _onRoundEnd(leaderboard);
      _showServerRoundEnd(leaderboard);
    }
  });

  socket.on('timer_update', ({ timer }) => {
    updateTimerUI(timer);
    updateLeaderboardUI();
  });

  socket.on('respawn', ({ x, z }) => {
    _onRespawn({ x, z });
  });

  socket.on('disconnect', () => {
    console.warn('Disconnected from server');
  });
}

// FIX Bug 5: store { mesh, name, radius } instead of bare mesh
function _addOtherHole(id, data) {
  const geo = new _THREE.CircleGeometry(1, 32);
  const mat = new _THREE.MeshBasicMaterial({
    color: 0xCC0000, transparent: true, opacity: 0.8, depthWrite: false
  });
  const mesh = new _THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(data.x, 0.02, data.z);
  mesh.scale.setScalar(data.radius || 1.5);
  _scene.add(mesh);
  otherHoles[id] = { mesh, name: data.name || 'Opponent', radius: data.radius || 1.5 };
}

function _showServerRoundEnd(leaderboard) {
  const el = document.getElementById('round-end');
  if (!el) return;
  el.classList.remove('hidden');
  el.style.pointerEvents = 'none';
  el.innerHTML =
    '<h2>Round Over!</h2>' +
    leaderboard.slice(0, 5).map((p, i) =>
      '<div class="lb-item">' + (i + 1) + '. ' + p.name + ' - ' + p.radius.toFixed(1) + '</div>'
    ).join('') +
    '<p style="margin-top:20px;color:#aaa;font-size:16px">Next round starting in 6 seconds...</p>';
}

let _lastSendTime = 0;
export function sendPosition(data) {
  if (!socket || !myId) return;
  const now = performance.now();
  if (now - _lastSendTime < 50) return;
  _lastSendTime = now;
  socket.emit('update_position', data);
}

export function sendAbsorb(victimId) {
  if (socket) socket.emit('absorb_player', { victimId });
}

export function sendName(name) {
  if (socket) socket.emit('set_name', name);
}

export function playSolo(name) {
  if (socket) socket.emit('play_solo', { name });
}

export function createRoom(name) {
  if (socket) socket.emit('create_room', { name });
}

export function joinRoom(code, name) {
  if (socket) socket.emit('join_room', { code, name });
}

export function updateTimerUI(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  const el = document.getElementById('timer');
  if (el) {
    el.textContent = m + ':' + s;
    el.style.color = seconds <= 10 ? '#ff4444' : '#ffffff';
  }
}

let _getLeaderboardData = null;
export function registerLeaderboardSource(fn) { _getLeaderboardData = fn; }

export function updateLeaderboardUI() {
  if (!_getLeaderboardData) return;
  const rows = _getLeaderboardData();
  const el = document.getElementById('lbRows');
  if (!el) return;
  el.innerHTML = rows
    .map((r, i) =>
      '<div class="lb-row' + (r.isMe ? ' me' : '') + '">' +
      (i + 1) + '. ' + r.name + ' - ' + r.radius + '</div>'
    ).join('');
}
