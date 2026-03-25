import { Router } from "express";
import { Room } from "../models/Room.js";
import { generateRoomCode } from "../utils/roomCode.js";

export const roomsRouter = Router();

/** Create a new room */
roomsRouter.post("/", async (req, res) => {
 try {
    const { title, isPrivate } = req.body || {};
    let code = generateRoomCode();
    for (let i = 0; i < 5; i += 1) {
      const exists = await Room.exists({ code });
      if (!exists) break;
      code = generateRoomCode();
    }
    const room = await Room.create({
      code,
      title: typeof title === "string" && title.trim() ? title.trim() : "Drawing room",
      isPrivate: Boolean(isPrivate),
    });
    res.json({
      code: room.code,
      title: room.title,
      isPrivate: room.isPrivate,
      inviteUrl: `${req.headers["x-client-origin"] || ""}/room/${room.code}`,
    });
  } catch (e) {
    res.status(500).json({ error: "Could not create room" });
  }
});

/** Room metadata (no password verification here — join auth happens via socket if needed) */
roomsRouter.get("/:code", async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() }).lean();
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({
      code: room.code,
      title: room.title,
      isPrivate: room.isPrivate,
      gameActive: room.game?.active || false,
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});
