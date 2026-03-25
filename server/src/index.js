import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { connectDatabase } from "./config/database.js";
import { roomsRouter } from "./routes/rooms.js";
import { registerSocketHandlers } from "./socket/handlers.js";

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/draw-app";
/** Comma-separated; Vite may use 5174 if 5173 is busy */
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  process.env.CLIENT_URL ||
  "http://localhost:5173,http://localhost:5174";

await connectDatabase(MONGODB_URI);

const app = express();
app.use(
  cors({
    origin: CLIENT_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/rooms", roomsRouter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN.split(",").map((s) => s.trim()),
    methods: ["GET", "POST"],
  },
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`Draw server listening on ${PORT}`);
});
