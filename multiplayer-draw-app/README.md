# CanvasTogether — Full-stack multiplayer drawing

Real-time collaborative whiteboard (Socket.IO + React + Express + MongoDB) with MS Paint–style tools, live cursors, chat, optional sketch-and-guess mode, dark/light UI, and export to PNG.

## Repository layout

| Path | Role |
|------|------|
| `client/` | Vite + React 18 + Tailwind — canvas UI, tools, chat, routing |
| `server/` | Express HTTP API + Socket.IO — rooms, presence, drawing ops, chat, game state |
| `package.json` | Root scripts to run client + server together (`concurrently`) |

### How it works (architecture)

1. **HTTP (Express)**  
   - `POST /api/rooms` creates a MongoDB `Room` document with a short invite code.  
   - `GET /api/rooms/:code` returns basic room metadata.

2. **WebSockets (Socket.IO)**  
   - `room:join` — client sends room code, display name, color; server registers the socket in the Socket.IO room, persists participant list, returns recent `drawOps`, chat tail, and game snapshot so late joiners sync.  
   - `draw:batch` — throttled **preview** segments (normalized points + tool/color/size). Other clients draw them on a temporary “live” layer for low-latency feedback.  
   - `draw:commit` — **authoritative** stroke/shape/fill operations with stable ids; server appends to `room.drawOps` (capped) and relays to peers. Undo sends a `draw:commit` with `type: "undo"`; the server removes that op id and broadcasts `draw:undo`.  
   - `canvas:clear` — appends a `clear` op and notifies everyone.  
   - `cursor:move` / `cursor:leave` — normalized pointer positions for live labels.  
   - `chat:send` — persists messages to `ChatMessage` (Mongo) and broadcasts; guess mode uses `kind: "guess"` so the server can compare to the secret word and award points.

3. **Frontend canvas**  
   - **Base canvas** — committed ops only (replay for undo/clear/initial sync).  
   - **Live canvas** — in-progress polylines from all users (batches).  
   - Coordinates are **normalized (0–1)** so strokes survive different viewport sizes; rendering multiplies by actual bitmap width/height (with `devicePixelRatio` scaling).  
   - **Stroke smoothing** — moving average on normalized points before commit.  
   - **Fill** — synchronous flood fill on bitmap; all clients run the same op at the same logical pixel, so results stay aligned if the committed picture matches.

4. **Sketch & guess (bonus)**  
   - `game:start-round` picks a random word, assigns a drawer, clears stored `drawOps` for a fresh round, broadcasts a hint, and sends the secret word only to the drawer’s socket.  
   - Guessers use chat in guess mode; correct guess increments score in `room.game.scores`.

---

## Prerequisites

- **Node.js 20+** (LTS recommended)  
- **MongoDB** — local (`mongodb://127.0.0.1:27017/...`) or [MongoDB Atlas](https://www.mongodb.com/atlas)

---

## Local setup

### 1. Install dependencies

From the project root:

```bash
cd multiplayer-draw-app
npm install
cd server && npm install && cd ../client && npm install
```

(Or use `npm run install:all` from root if you add that script — root `package.json` already includes `install:all`.)

### 2. Configure environment

**Server** — copy `server/.env.example` to `server/.env`:

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/draw-app
CLIENT_ORIGIN=http://localhost:5173
```

**Client** — copy `client/.env.example` to `client/.env`:

```env
VITE_SERVER_URL=http://localhost:4000
```

Keep `VITE_SERVER_URL` pointing at the Socket.IO / API host. For local dev this is usually `http://localhost:4000`.

### 3. Run locally

**Terminal A — API + WebSocket server**

```bash
cd server
npm run dev
```

**Terminal B — Vite client**

```bash
cd client
npm run dev
```

Or from the **repo root**:

```bash
npm run dev
```

Open `http://localhost:5173`, pick a username, create or join a room, share the `/room/CODE` URL.

---

## Production deploy (example: Vercel + Render/Railway)

### Frontend — Vercel

1. Connect the Git repo and set **root directory** to `client/`.  
2. Build command: `npm run build`  
3. Output directory: `dist`  
4. **Environment variables** (Vite is build-time):  
   - `VITE_SERVER_URL=https://your-api.onrender.com` (no trailing slash)

`client/vercel.json` rewrites all routes to `index.html` for React Router.

### Backend — Render or Railway

1. Create a **Web Service** from `server/`.  
2. Build: `npm install` (or leave default)  
3. Start: `npm start`  
4. Env:  
   - `PORT` — usually injected by the platform  
   - `MONGODB_URI` — Atlas connection string  
   - `CLIENT_ORIGIN=https://your-app.vercel.app` (comma-separate if multiple)

Socket.IO works on Render/Railway as long as the platform supports WebSockets (both do on standard HTTP services).

---

## Mobile install **without Android Studio**

You do **not** need Android Studio for day-to-day use:

1. **PWA (recommended)**  
   - Deploy the frontend over **HTTPS**.  
   - Open the site in **Chrome on Android** → menu → **Install app** / **Add to Home screen**.  
   - The included `manifest.json` enables standalone display (full-screen app shell).

2. **Optional APK wrappers (no Android Studio on your PC)**  
   - Use a cloud build service that wraps your HTTPS URL in a **WebView** or **Trusted Web Activity** (e.g. **[Bubblewrap]** / **[PWABuilder]** in the cloud, or similar CI-driven TWA pipelines).  
   - You upload the web app URL and signing keys are generated in the browser/cloud builder — your machine never runs the Android IDE.

[Bubblewrap]: https://github.com/GoogleChromeLabs/bubblewrap  
[PWABuilder]: https://www.pwabuilder.com/

---

## npm scripts (reference)

| Command | Description |
|---------|-------------|
| `npm run dev` (root) | Server + client in parallel |
| `npm run dev --prefix server` | API + Socket.IO only |
| `npm run dev --prefix client` | Vite only |
| `npm run build --prefix client` | Production static build |

---

## Security / next steps for a portfolio hardening pass

- Rate-limit room creation and socket events.  
- Add optional **room password** (hash on server, verify on `room:join`).  
- OAuth (Google) for identities instead of guest names.  
- Cap `draw:batch` payload size server-side.

---

## License

MIT — use freely for demos and portfolios.
