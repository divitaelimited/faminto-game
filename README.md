# ⚫ Hole.io Clone

A browser-based multiplayer hole game built with Three.js, Socket.io, and Node.js.

## Quick Start

### 1. Install dependencies
```bash
# From the project root:
npm install --prefix server
npm install --prefix client
```

### 2. Run in development
Open **two terminals**:

**Terminal 1 — Server:**
```bash
cd server
npm start
# Server runs on http://localhost:3000
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev
# Open http://localhost:5173 in your browser
```

### Or use concurrently (from root):
```bash
npm install          # installs concurrently
npm run install:all  # installs server + client deps
npm run dev          # starts both at once
```

## Controls
| Key | Action |
|-----|--------|
| W / ↑ | Move forward |
| S / ↓ | Move backward |
| A / ← | Move left |
| D / → | Move right |

## Deploy to Railway
1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set **Root Directory** to `server`
4. Set **Start Command** to `node index.js`
5. Copy the Railway URL and update `network.js`:
   - The code auto-detects production vs. localhost, no change needed
6. Build client: `npm run build --prefix client`
7. Commit and push — Railway serves the built `client/dist` files from the server

## Project Structure
```
holeio-game/
├── server/
│   ├── index.js          # Express + Socket.io game server
│   └── package.json
├── client/
│   ├── index.html        # Game UI shell
│   ├── vite.config.js    # Dev proxy config
│   ├── src/
│   │   ├── game.js       # Three.js scene & game loop
│   │   ├── network.js    # Socket.io client
│   │   └── input.js      # Keyboard input
│   └── package.json
└── package.json          # Root scripts (concurrently)
```

## Tech Stack
| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | ^0.160 | 3D rendering |
| Socket.io | ^4.6 | Real-time multiplayer |
| Express | ^4.18 | HTTP server |
| Vite | ^5.0 | Dev server & bundler |
