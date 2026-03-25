import { nanoid } from "nanoid";
import { Room } from "../models/Room.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { randomWord } from "../services/wordBank.js";

const ROUND_SECONDS = 60;
const GAME_TOTAL_SECONDS = 20 * 60;
const roundTimers = new Map();
const gameTimers = new Map();

function clearRoundTimer(code) {
  const t = roundTimers.get(code);
  if (t) clearTimeout(t);
  roundTimers.delete(code);
}

function clearGameTimer(code) {
  const t = gameTimers.get(code);
  if (t) clearTimeout(t);
  gameTimers.delete(code);
}

function getPublicParticipants(room) {
  return room.participants.map((p) => ({
    userId: p.userId,
    username: p.username,
    color: p.color,
  }));
}

function buildHint(word) {
  return word
    .split("")
    .map((c, i) => (i === 0 ? c : "_"))
    .join("");
}

function nextPlayerOrder(room) {
  const present = room.participants.map((p) => p.userId);
  const prev = Array.isArray(room.game?.playerOrder) ? room.game.playerOrder : [];
  const filtered = prev.filter((id) => present.includes(id));
  const unseen = present.filter((id) => !filtered.includes(id));
  return [...filtered, ...unseen];
}

async function emitSecretWord(io, room, drawerUserId, word) {
  const sockets = await io.in(room.code).fetchSockets();
  const socketIds = new Set(
    room.participants
      .filter((p) => p.userId === drawerUserId)
      .map((p) => p.socketId)
  );
  for (const s of sockets) {
    if (socketIds.has(s.id)) s.emit("game:secret-word", { word });
  }
}

async function endGame(io, roomCode, reason = "ended") {
  clearRoundTimer(roomCode);
  clearGameTimer(roomCode);
  const room = await Room.findOne({ code: roomCode });
  if (!room) return;
  room.game = {
    active: false,
    word: "",
    hint: "",
    roundEndsAt: null,
    totalEndsAt: null,
    roundSeconds: ROUND_SECONDS,
    drawerUserId: null,
    drawerName: "",
    drawerIndex: -1,
    playerOrder: [],
    guessedUserIds: [],
    scores: { ...(room.game?.scores || {}) },
  };
  await room.save();
  io.to(roomCode).emit("game:ended", {
    reason,
    scores: room.game.scores,
  });
}

async function startNextRound(io, roomCode) {
  clearRoundTimer(roomCode);
  const room = await Room.findOne({ code: roomCode });
  if (!room || !room.game?.active) return;
  const now = Date.now();
  if (!room.game.totalEndsAt || new Date(room.game.totalEndsAt).getTime() <= now) {
    await endGame(io, roomCode, "time_up");
    return;
  }
  if (!room.participants.length) return;

  const order = nextPlayerOrder(room);
  if (!order.length) return;
  const prevIdx = Number(room.game.drawerIndex ?? -1);
  const idx = (prevIdx + 1) % order.length;
  const drawerUserId = order[idx];
  const drawer = room.participants.find((p) => p.userId === drawerUserId);
  if (!drawer) return;

  const word = randomWord();
  const roundEndsAt = new Date(now + ROUND_SECONDS * 1000);
  room.game = {
    active: true,
    word,
    hint: buildHint(word),
    roundEndsAt,
    totalEndsAt: room.game.totalEndsAt,
    roundSeconds: ROUND_SECONDS,
    drawerUserId,
    drawerName: drawer.username,
    drawerIndex: idx,
    playerOrder: order,
    guessedUserIds: [],
    scores: { ...(room.game.scores || {}) },
  };
  room.drawOps = [];
  await room.save();

  io.to(roomCode).emit("game:round-started", {
    roundEndsAt: roundEndsAt.toISOString(),
    totalEndsAt: room.game.totalEndsAt,
    roundSeconds: ROUND_SECONDS,
    drawerUserId,
    drawerName: drawer.username,
    hint: room.game.hint,
    scores: room.game.scores,
  });
  io.in(roomCode).emit("canvas:cleared", { by: "game", game: true });
  await emitSecretWord(io, room, drawerUserId, word);

  const delay = Math.max(500, new Date(roundEndsAt).getTime() - Date.now() + 150);
  roundTimers.set(
    roomCode,
    setTimeout(() => {
      void startNextRound(io, roomCode);
    }, delay)
  );
}

async function startGame(io, roomCode) {
  clearRoundTimer(roomCode);
  clearGameTimer(roomCode);
  const room = await Room.findOne({ code: roomCode });
  if (!room || !room.participants.length) return;

  const totalEndsAt = new Date(Date.now() + GAME_TOTAL_SECONDS * 1000);
  room.game = {
    active: true,
    word: "",
    hint: "",
    roundEndsAt: null,
    totalEndsAt,
    roundSeconds: ROUND_SECONDS,
    drawerUserId: null,
    drawerName: "",
    drawerIndex: -1,
    playerOrder: room.participants.map((p) => p.userId),
    guessedUserIds: [],
    scores: { ...(room.game?.scores || {}) },
  };
  room.drawOps = [];
  await room.save();
  io.to(roomCode).emit("game:started", {
    totalEndsAt: totalEndsAt.toISOString(),
    scores: room.game.scores,
  });
  gameTimers.set(
    roomCode,
    setTimeout(() => {
      void endGame(io, roomCode, "time_up");
    }, GAME_TOTAL_SECONDS * 1000 + 250)
  );
  await startNextRound(io, roomCode);
}

/** @param {import("socket.io").Server} io */
export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    let currentRoom = null;
    let profile = null;

    socket.on(
      "room:join",
      async (
        {
          roomCode,
          username,
          color,
          userId,
        },
        cb
      ) => {
        try {
          if (!roomCode || !username || !color) {
            cb?.({ ok: false, error: "Missing fields" });
            return;
          }
          const code = String(roomCode).toUpperCase().trim();
          const room = await Room.findOne({ code });
          if (!room) {
            cb?.({ ok: false, error: "Room not found" });
            return;
          }

          const uid = userId || nanoid(10);
          profile = {
            userId: uid,
            username: String(username).slice(0, 32),
            color: String(color),
          };

          await socket.leave(currentRoom || "");
          currentRoom = code;
          await socket.join(code);

          const existingIdx = room.participants.findIndex((p) => p.userId === uid);
          const entry = {
            socketId: socket.id,
            userId: uid,
            username: profile.username,
            color: profile.color,
            joinedAt: new Date(),
          };
          if (existingIdx >= 0) room.participants[existingIdx] = entry;
          else room.participants.push(entry);
          await room.save();

          const recentChat = await ChatMessage.find({ roomCode: code })
            .sort({ createdAt: -1 })
            .limit(80)
            .lean();

          cb?.({
            ok: true,
            userId: uid,
            drawOps: room.drawOps,
            participants: getPublicParticipants(room),
            game: room.game,
            chat: recentChat.reverse(),
          });

          socket.to(code).emit("room:user-joined", {
            userId: uid,
            username: profile.username,
            color: profile.color,
          });

          io.to(code).emit("room:peers", { participants: getPublicParticipants(room) });
        } catch (e) {
          cb?.({ ok: false, error: "Join failed" });
        }
      }
    );

    socket.on("cursor:move", ({ roomCode, x, y }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      socket.to(currentRoom).emit("cursor:remote", {
        userId: profile.userId,
        username: profile.username,
        color: profile.color,
        x,
        y,
      });
    });

    socket.on("cursor:leave", ({ roomCode }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      socket.to(currentRoom).emit("cursor:gone", { userId: profile.userId });
    });

    const throttleDraw = new Map();
    socket.on("draw:batch", async ({ roomCode, ops }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      const now = Date.now();
      const last = throttleDraw.get(socket.id) || 0;
      if (now - last < 8) return;
      throttleDraw.set(socket.id, now);

      socket.to(currentRoom).emit("draw:remote-batch", {
        userId: profile.userId,
        ops: Array.isArray(ops) ? ops : [],
      });
    });

    socket.on("draw:commit", async ({ roomCode, op }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      if (!op || !op.id) return;

      const code = currentRoom;
      try {
        const room = await Room.findOne({ code });
        if (!room) return;

        const normalized = {
          id: op.id,
          userId: profile.userId,
          type: op.type,
          payload: op.payload,
        };

        if (op.type === "undo") {
          const targetId = op.payload?.strokeId;
          room.drawOps = room.drawOps.filter((d) => d.id !== targetId);
          room.trimDrawOps();
          await room.save();
          io.in(code).emit("draw:undo", { strokeId: targetId });
          return;
        }

        if (op.type === "redo") {
          /** Redo is client-originated replay; we optionally store redone ops — forward only */
          io.to(code).emit("draw:redo", { op: op.payload?.op });
          return;
        }

        room.drawOps.push(normalized);
        room.trimDrawOps();
        await room.save();
        socket.to(code).emit("draw:commit", { op: normalized });
      } catch {
        /* ignore */
      }
    });

    socket.on("canvas:clear", async ({ roomCode }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      try {
        const room = await Room.findOne({ code: currentRoom });
        if (!room) return;
        room.drawOps.push({
          id: nanoid(12),
          userId: profile.userId,
          type: "clear",
          payload: { at: Date.now() },
        });
        room.trimDrawOps();
        await room.save();
        io.in(currentRoom).emit("canvas:cleared", { by: profile.userId });
      } catch {
        /* ignore */
      }
    });

    socket.on(
      "chat:send",
      async ({ roomCode, text, kind }, cb) => {
        if (!profile || !currentRoom || roomCode !== currentRoom) return;
        const trimmed = String(text || "").slice(0, 2000);
        if (!trimmed) return;

        try {
          const room = await Room.findOne({ code: currentRoom });
          if (!room) return;

          let k = kind === "guess" ? "guess" : "chat";
          let displayText = trimmed;

          if (k === "guess" && room.game?.active && room.game.word) {
            const guess = trimmed.trim().toLowerCase();
            const word = room.game.word.toLowerCase();
            if (guess === word && profile.userId !== room.game.drawerUserId) {
              const guessedSet = new Set(room.game.guessedUserIds || []);
              if (guessedSet.has(profile.userId)) {
                cb?.({ ok: true, duplicate: true });
                return;
              }
              const scores = { ...(room.game.scores || {}) };
              const roundEndMs = room.game.roundEndsAt
                ? new Date(room.game.roundEndsAt).getTime()
                : Date.now();
              const secondsLeft = Math.max(0, Math.floor((roundEndMs - Date.now()) / 1000));
              const orderBonus = Math.max(
                0,
                120 - (room.game.guessedUserIds?.length || 0) * 30
              );
              const guesserPoints = 80 + secondsLeft * 3 + orderBonus;
              const drawerPoints = Math.floor(guesserPoints * 0.5);
              scores[profile.userId] = (scores[profile.userId] || 0) + guesserPoints;
              if (room.game.drawerUserId) {
                scores[room.game.drawerUserId] =
                  (scores[room.game.drawerUserId] || 0) + drawerPoints;
              }
              room.game.scores = scores;
              room.game.guessedUserIds = [...(room.game.guessedUserIds || []), profile.userId];
              await room.save();
              k = "system";
              displayText = `${profile.username} guessed the word!`;
              io.to(currentRoom).emit("game:round-won", {
                winnerId: profile.userId,
                winnerName: profile.username,
                word: room.game.word,
                scores: room.game.scores,
                guesserPoints,
                drawerPoints,
              });
              const nonDrawers = room.participants.filter(
                (p) => p.userId !== room.game.drawerUserId
              ).length;
              if ((room.game.guessedUserIds || []).length >= nonDrawers) {
                clearRoundTimer(currentRoom);
                setTimeout(() => {
                  void startNextRound(io, currentRoom);
                }, 1000);
              }
            }
          }

          const msg = await ChatMessage.create({
            roomCode: currentRoom,
            userId: profile.userId,
            username: profile.username,
            text: displayText,
            kind: k,
          });

          const payload = {
            id: String(msg._id),
            userId: profile.userId,
            username: profile.username,
            text: displayText,
            kind: k,
            createdAt: msg.createdAt,
          };

          io.to(currentRoom).emit("chat:message", payload);
          cb?.({ ok: true });
        } catch {
          cb?.({ ok: false });
        }
      }
    );

    socket.on("game:start-round", async ({ roomCode }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      try {
        await startGame(io, currentRoom);
      } catch {
        /* ignore */
      }
    });

    socket.on("game:end", async ({ roomCode }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      try {
        await endGame(io, currentRoom, "manual");
      } catch {
        /* ignore */
      }
    });

    socket.on("voice:join", ({ roomCode }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      socket.to(currentRoom).emit("voice:user-joined", {
        userId: profile.userId,
        username: profile.username,
      });
    });

    socket.on("voice:leave", ({ roomCode }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom) return;
      socket.to(currentRoom).emit("voice:user-left", { userId: profile.userId });
    });

    socket.on("voice:offer", async ({ roomCode, targetUserId, sdp }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom || !targetUserId) return;
      const room = await Room.findOne({ code: currentRoom });
      if (!room) return;
      const targets = room.participants.filter((p) => p.userId === targetUserId);
      for (const target of targets) {
        io.to(target.socketId).emit("voice:offer", {
          fromUserId: profile.userId,
          fromName: profile.username,
          sdp,
        });
      }
    });

    socket.on("voice:answer", async ({ roomCode, targetUserId, sdp }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom || !targetUserId) return;
      const room = await Room.findOne({ code: currentRoom });
      if (!room) return;
      const targets = room.participants.filter((p) => p.userId === targetUserId);
      for (const target of targets) {
        io.to(target.socketId).emit("voice:answer", {
          fromUserId: profile.userId,
          sdp,
        });
      }
    });

    socket.on("voice:ice", async ({ roomCode, targetUserId, candidate }) => {
      if (!profile || !currentRoom || roomCode !== currentRoom || !targetUserId) return;
      const room = await Room.findOne({ code: currentRoom });
      if (!room) return;
      const targets = room.participants.filter((p) => p.userId === targetUserId);
      for (const target of targets) {
        io.to(target.socketId).emit("voice:ice", {
          fromUserId: profile.userId,
          candidate,
        });
      }
    });

    const onDisconnect = async () => {
      if (!currentRoom || !profile) return;
      const code = currentRoom;
      try {
        const room = await Room.findOne({ code });
        if (room) {
          room.participants = room.participants.filter((p) => p.socketId !== socket.id);
          await room.save();
          io.to(code).emit("room:user-left", {
            userId: profile.userId,
            username: profile.username,
          });
          io.to(code).emit("room:peers", {
            participants: getPublicParticipants(room),
          });
          if (room.game?.active && profile.userId === room.game.drawerUserId) {
            clearRoundTimer(code);
            setTimeout(() => {
              void startNextRound(io, code);
            }, 700);
          }
        }
      } catch {
        /* ignore */
      }
      socket.to(code).emit("cursor:gone", { userId: profile.userId });
      socket.to(code).emit("voice:user-left", { userId: profile.userId });
    };

    socket.on("disconnect", onDisconnect);
  });
}
