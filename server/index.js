const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve built Vite output (game app)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve client root for map-editor.html (not processed by Vite)
app.use(express.static(path.join(__dirname, '../client')));

app.get('/{*path}', (req, res) => {
  const distIndex = path.join(__dirname, '../client/dist/index.html');
  res.sendFile(distIndex, (err) => {
    if (err) res.status(404).send('Client not built.');
  });
});

// ─── Room Management ─────────────────────────────────────────────────────────

const rooms = {}; // { roomCode: { players, timer, active, interval } }

const WORD_LIST = [
  'BLUE','FISH','GOLD','FIRE','TREE','STAR','MOON','BIRD',
  'FROG','BEAR','LION','WOLF','HAWK','JADE','RUBY','OPAL',
  'FLUX','GLOW','HAZE','IRIS','JOLT','KELP','LAVA','MIST'
];

function generateRoomCode() {
  let code;
  let attempts = 0;
  do {
    code = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    attempts++;
    if (attempts > 50) {
      code = Math.random().toString(36).substring(2, 6).toUpperCase();
    }
  } while (rooms[code]);
  return code;
}

function createRoom(code) {
  rooms[code] = {
    code,
    players: {},
    timer: 120,
    active: false,
    interval: null,
    solo: false
  };
  return rooms[code];
}

function deleteRoom(code) {
  const room = rooms[code];
  if (!room) return;
  clearInterval(room.interval);
  delete rooms[code];
  console.log('Room deleted:', code);
}

function getRoomLeaderboard(room) {
  return Object.values(room.players)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 8)
    .map(p => ({ id: p.id, name: p.name, radius: parseFloat(p.radius.toFixed(2)) }));
}

function startRound(room) {
  room.timer = 120;
  room.active = true;
  for (const id in room.players) {
    const spawn = randomSpawn();
    room.players[id].x = spawn.x;
    room.players[id].z = spawn.z;
    room.players[id].radius = 1.5;
  }
  emitToRoom(room, 'round_start', { timer: room.timer });
  console.log('Round started in room', room.code, 'with', Object.keys(room.players).length, 'players');
}

function endRound(room) {
  room.active = false;
  clearInterval(room.interval);
  room.interval = null;

  const playerCount = Object.keys(room.players).length;
  console.log('Round ended in room', room.code);

  if (playerCount > 1) {
    emitToRoom(room, 'round_end', { leaderboard: getRoomLeaderboard(room) });
    setTimeout(() => {
      if (rooms[room.code] && Object.keys(room.players).length > 0) {
        startRound(room);
        room.interval = setInterval(() => tickRound(room), 1000);
      }
    }, 6000);
  } else {
    setTimeout(() => {
      if (rooms[room.code] && Object.keys(room.players).length > 0) {
        startRound(room);
        room.interval = setInterval(() => tickRound(room), 1000);
      }
    }, 20000);
  }
}

function tickRound(room) {
  if (!room.active) return;
  room.timer--;
  emitToRoom(room, 'timer_update', { timer: room.timer });
  if (room.timer <= 0) endRound(room);
}

function emitToRoom(room, event, data) {
  for (const id in room.players) {
    const s = io.sockets.sockets.get(id);
    if (s) s.emit(event, data);
  }
}

function randomSpawn() {
  return {
    x: (Math.random() - 0.5) * 80,
    z: (Math.random() - 0.5) * 80
  };
}

// ─── Socket Events ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  let currentRoomCode = null;

  function joinRoom(code, playerName, isSolo) {
    const room = rooms[code];
    if (!room) return false;

    currentRoomCode = code;
    const playerNum = Object.keys(room.players).length + 1;
    const spawn = randomSpawn();

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || 'Player ' + playerNum,
      x: spawn.x,
      z: spawn.z,
      radius: 1.5,
      alive: true
    };

    room.solo = isSolo;

    console.log(room.players[socket.id].name, 'joined room', code);

    socket.emit('init', {
      id: socket.id,
      roomCode: code,
      players: room.players,
      timer: room.timer,
      roundActive: room.active,
      solo: isSolo
    });

    for (const id in room.players) {
      if (id !== socket.id) {
        const s = io.sockets.sockets.get(id);
        if (s) s.emit('player_joined', room.players[socket.id]);
      }
    }

    if (Object.keys(room.players).length === 1 && !room.active) {
      startRound(room);
      room.interval = setInterval(() => tickRound(room), 1000);
    }

    return true;
  }

  socket.on('create_room', ({ name }) => {
    const code = generateRoomCode();
    createRoom(code);
    joinRoom(code, name, false);
    socket.emit('room_created', { code });
  });

  socket.on('join_room', ({ code, name }) => {
    const upperCode = code.toUpperCase().trim();
    if (!rooms[upperCode]) {
      socket.emit('room_error', { message: 'Room "' + upperCode + '" not found. Check the code and try again.' });
      return;
    }
    joinRoom(upperCode, name, false);
  });

  socket.on('play_solo', ({ name }) => {
    const code = generateRoomCode();
    createRoom(code);
    joinRoom(code, name, true);
  });

  socket.on('update_position', (data) => {
    if (!currentRoomCode) return;
    const room = rooms[currentRoomCode];
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    if (Math.abs(data.x) > 55 || Math.abs(data.z) > 55) return;
    if (typeof data.radius !== 'number' || data.radius < 1.5 || data.radius > 30) return;
    p.x = data.x;
    p.z = data.z;
    p.radius = data.radius;
  });

  socket.on('set_name', (name) => {
    if (!currentRoomCode) return;
    const room = rooms[currentRoomCode];
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].name = String(name).trim().slice(0, 20);
  });

  socket.on('absorb_player', ({ victimId }) => {
    if (!currentRoomCode) return;
    const room = rooms[currentRoomCode];
    if (!room || !room.active) return;

    const eater = room.players[socket.id];
    const victim = room.players[victimId];
    if (!eater || !victim) return;
    if (eater.radius <= victim.radius * 1.1) return;

    const spawn = randomSpawn();
    victim.x = spawn.x;
    victim.z = spawn.z;
    victim.radius = 1.5;

    const victimSocket = io.sockets.sockets.get(victimId);
    if (victimSocket) victimSocket.emit('respawn', { x: spawn.x, z: spawn.z });

    console.log(eater.name, 'absorbed', victim.name, 'in room', currentRoomCode);
  });

  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = rooms[currentRoomCode];
    if (!room) return;

    const playerName = room.players[socket.id]?.name;
    delete room.players[socket.id];
    emitToRoom(room, 'player_left', { id: socket.id });
    console.log(playerName, 'left room', currentRoomCode);

    if (Object.keys(room.players).length === 0) {
      deleteRoom(currentRoomCode);
    }
  });
});

// ─── Broadcast game state per room (20x/sec) ─────────────────────────────────

setInterval(() => {
  for (const code in rooms) {
    const room = rooms[code];
    if (Object.keys(room.players).length === 0) continue;
    emitToRoom(room, 'game_state', { players: room.players });
  }
}, 50);

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
