import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import CursorsLayer from "./CursorsLayer.jsx";
import { applyDrawOp, drawSmoothPath, replayOps } from "../drawing/applyOp.js";
import { floodFillAt } from "../drawing/floodFill.js";
import { smoothPointsNorm } from "../drawing/smooth.js";

const TOOLS = ["brush", "pencil", "eraser", "rect", "circle", "line", "fill"];

function useMeasure(ref) {
  const [size, setSize] = useState({ cssW: 0, cssH: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ cssW: Math.floor(r.width), cssH: Math.floor(r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ cssW: Math.floor(r.width), cssH: Math.floor(r.height) });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function CanvasBoard({
  socket,
  roomCode,
  userId,
  game,
  initialDrawOps = [],
}) {
  const wrapRef = useRef(null);
  const baseRef = useRef(null);
  const liveRef = useRef(null);
  const { cssW, cssH } = useMeasure(wrapRef);

  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(18);
  const [shapeFilled, setShapeFilled] = useState(false);

  const opsRef = useRef([]);
  const liveByUser = useRef(new Map());
  const rafLive = useRef(0);
  const drawingRef = useRef(false);
  const shapeStartRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastNormRef = useRef(null);
  const pointerUpHandlerRef = useRef(null);

  const [cursors, setCursors] = useState({});

  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

  const lineWidthNorm = brushSize / 1000;

  const rebuildBase = useCallback(() => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    replayOps(
      ctx,
      opsRef.current,
      w,
      h,
      (c, op) => {
        floodFillAt(
          c,
          op.payload.x * w,
          op.payload.y * h,
          op.payload.color,
          w,
          h
        );
      }
    );
  }, []);

  const redrawLive = useCallback(() => {
    const live = liveRef.current;
    if (!live) return;
    const ctx = live.getContext("2d");
    const w = live.width;
    const h = live.height;
    ctx.clearRect(0, 0, w, h);
    for (const st of liveByUser.current.values()) {
      if (st.tool === "shape-preview" && st.points?.length >= 2) {
        const [[x1, y1], [x2, y2]] = st.points;
        const sx1 = x1 * w;
        const sy1 = y1 * h;
        const sx2 = x2 * w;
        const sy2 = y2 * h;
        ctx.save();
        ctx.strokeStyle = st.color;
        ctx.fillStyle = st.color;
        ctx.lineWidth = Math.max(1, st.lineWidthNorm * Math.min(w, h));
        if (st.shape === "line") {
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        } else if (st.shape === "rect") {
          const left = Math.min(sx1, sx2);
          const top = Math.min(sy1, sy2);
          const rw = Math.abs(sx2 - sx1);
          const rh = Math.abs(sy2 - sy1);
          if (st.filled) ctx.fillRect(left, top, rw, rh);
          ctx.strokeRect(left, top, rw, rh);
        } else if (st.shape === "circle") {
          const cx = (sx1 + sx2) / 2;
          const cy = (sy1 + sy2) / 2;
          const rx = Math.abs(sx2 - sx1) / 2;
          const ry = Math.abs(sy2 - sy1) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
          if (st.filled) ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if (!st.points?.length) continue;
      drawSmoothPath(
        ctx,
        st.points,
        w,
        h,
        st.tool,
        st.color,
        Math.max(1, st.lineWidthNorm * Math.min(w, h))
      );
    }
  }, []);

  const scheduleLive = useCallback(() => {
    cancelAnimationFrame(rafLive.current);
    rafLive.current = requestAnimationFrame(redrawLive);
  }, [redrawLive]);

  const syncCanvasSize = useCallback(() => {
    const base = baseRef.current;
    const live = liveRef.current;
    if (!base || !live || !cssW || !cssH) return;
    const W = Math.max(1, Math.floor(cssW * dpr));
    const H = Math.max(1, Math.floor(cssH * dpr));
    if (base.width !== W || base.height !== H) {
      base.width = W;
      base.height = H;
      live.width = W;
      live.height = H;
      base.style.width = `${cssW}px`;
      base.style.height = `${cssH}px`;
      live.style.width = `${cssW}px`;
      live.style.height = `${cssH}px`;
      rebuildBase();
      redrawLive();
    }
  }, [cssW, cssH, dpr, rebuildBase, redrawLive]);

  useEffect(() => {
    syncCanvasSize();
  }, [syncCanvasSize]);

  useEffect(() => {
    rebuildBase();
  }, [rebuildBase, cssW, cssH]);

  const initialOpsSig = JSON.stringify(
    (initialDrawOps || []).map((o) => [o.id, o.type])
  );
  useEffect(() => {
    opsRef.current = Array.isArray(initialDrawOps) ? [...initialDrawOps] : [];
    undoStackRef.current = [];
    redoStackRef.current = [];
    rebuildBase();
  }, [roomCode, initialOpsSig, rebuildBase]);

  useEffect(() => {
    if (!socket || !roomCode) return;

    const onCommit = ({ op }) => {
      if (!op) return;
      if (op.type === "stroke" || op.type === "shape" || op.type === "fill") {
        opsRef.current = [...opsRef.current, op];
        liveByUser.current.delete(op.userId);
        scheduleLive();
        const canvas = baseRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        if (op.type === "fill") {
          floodFillAt(
            ctx,
            op.payload.x * w,
            op.payload.y * h,
            op.payload.color,
            w,
            h
          );
        } else {
          applyDrawOp(ctx, op, w, h);
        }
      }
    };

    const onBatch = ({ userId: uid, ops: batches }) => {
      for (const b of batches || []) {
        const cur = liveByUser.current.get(uid) || {
          userId: uid,
          points: [],
          tool: b.tool,
          color: b.color,
          lineWidthNorm: b.lineWidthNorm,
        };
        cur.tool = b.tool;
        cur.color = b.color;
        cur.lineWidthNorm = b.lineWidthNorm;
        for (const pt of b.points || []) cur.points.push(pt);
        liveByUser.current.set(uid, cur);
      }
      scheduleLive();
    };

    const onUndo = ({ strokeId }) => {
      opsRef.current = opsRef.current.filter((o) => o.id !== strokeId);
      rebuildBase();
    };

    const onClear = () => {
      opsRef.current = [
        ...opsRef.current,
        { id: nanoid(10), userId: "system", type: "clear", payload: {} },
      ];
      liveByUser.current.clear();
      undoStackRef.current = [];
      redoStackRef.current = [];
      rebuildBase();
      redrawLive();
    };

    socket.on("draw:commit", onCommit);
    socket.on("draw:remote-batch", onBatch);
    socket.on("draw:undo", onUndo);
    socket.on("canvas:cleared", onClear);

    return () => {
      socket.off("draw:commit", onCommit);
      socket.off("draw:remote-batch", onBatch);
      socket.off("draw:undo", onUndo);
      socket.off("canvas:cleared", onClear);
    };
  }, [socket, roomCode, rebuildBase, redrawLive, scheduleLive]);

  useEffect(() => {
    if (!socket || !roomCode || !userId) return;
    const onMove = (p) => {
      setCursors((prev) => ({
        ...prev,
        [p.userId]: {
          userId: p.userId,
          username: p.username,
          color: p.color,
          x: p.x,
          y: p.y,
          t: Date.now(),
        },
      }));
    };
    const onGone = ({ userId: uid }) => {
      setCursors((prev) => {
        const n = { ...prev };
        delete n[uid];
        return n;
      });
    };
    socket.on("cursor:remote", onMove);
    socket.on("cursor:gone", onGone);
    return () => {
      socket.off("cursor:remote", onMove);
      socket.off("cursor:gone", onGone);
    };
  }, [socket, roomCode, userId]);

  const pointerNorm = (ev) => {
    const base = baseRef.current;
    if (!base) return null;
    const r = base.getBoundingClientRect();
    const nx = (ev.clientX - r.left) / r.width;
    const ny = (ev.clientY - r.top) / r.height;
    const n = [Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny))];
    lastNormRef.current = n;
    return n;
  };

  const pushUndo = (op) => {
    undoStackRef.current.push({
      snapshot: JSON.parse(JSON.stringify(op)),
    });
    redoStackRef.current = [];
  };

  const emitCursor = (nx, ny) => {
    socket?.emit("cursor:move", { roomCode, x: nx, y: ny });
  };

  const flushBatch = useRef([]);
  const flushTimer = useRef(0);
  const queueBatch = (chunk) => {
    flushBatch.current.push(chunk);
    if (flushTimer.current) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = 0;
      const ops = flushBatch.current.splice(0);
      if (ops.length)
        socket?.emit("draw:batch", {
          roomCode,
          ops,
        });
    }, 16);
  };

  const isDrawer =
    !game?.active || !game?.drawerUserId || game.drawerUserId === userId;

  const onPointerDown = (ev) => {
    if (!isDrawer && game?.active) return;
    const n = pointerNorm(ev);
    if (!n) return;

    if (tool === "fill") {
      const canvas = baseRef.current;
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const ctx = canvas.getContext("2d");
      const op = {
        id: nanoid(12),
        userId,
        type: "fill",
        payload: { x: n[0], y: n[1], color },
      };
      floodFillAt(ctx, n[0] * w, n[1] * h, color, w, h);
      opsRef.current = [...opsRef.current, op];
      socket?.emit("draw:commit", { roomCode, op });
      pushUndo(op);
      return;
    }

    if (TOOLS.includes(tool) && ["rect", "circle", "line"].includes(tool)) {
      shapeStartRef.current = n;
      drawingRef.current = true;
      return;
    }

    const strokeId = nanoid(12);
    drawingRef.current = { id: strokeId, points: [n], tool, color, lineWidthNorm };
    liveByUser.current.set(userId, {
      userId,
      points: [n],
      tool,
      color,
      lineWidthNorm,
    });
    scheduleLive();
    queueBatch({
      points: [n],
      tool,
      color,
      lineWidthNorm,
    });
  };

  const onPointerMove = (ev) => {
    const n = pointerNorm(ev);
    if (!n) return;
    emitCursor(n[0], n[1]);

    if (!drawingRef.current) return;
    if (!isDrawer && game?.active) return;

    if (typeof drawingRef.current === "object" && drawingRef.current.points) {
      drawingRef.current.points.push(n);
      const st = liveByUser.current.get(userId) || {
        userId,
        points: [],
        tool,
        color,
        lineWidthNorm,
      };
      st.points.push(n);
      st.tool = tool;
      st.color = color;
      st.lineWidthNorm = lineWidthNorm;
      liveByUser.current.set(userId, st);
      scheduleLive();
      queueBatch({
        points: [n],
        tool,
        color,
        lineWidthNorm,
      });
      return;
    }

    if (shapeStartRef.current && drawingRef.current === true) {
      /** preview shape on live */
      const s = shapeStartRef.current;
      liveByUser.current.set(userId, {
        userId,
        tool: "shape-preview",
        shape: tool,
        color,
        lineWidthNorm,
        points: [s, n],
        filled: shapeFilled,
      });
      scheduleLive();
    }
  };

  const endShape = (end) => {
    const start = shapeStartRef.current;
    shapeStartRef.current = null;
    drawingRef.current = false;
    liveByUser.current.delete(userId);
    scheduleLive();
    if (!start || !end) return;
    const op = {
      id: nanoid(12),
      userId,
      type: "shape",
      payload: {
        shape: tool,
        x1: start[0],
        y1: start[1],
        x2: end[0],
        y2: end[1],
        color,
        strokeWidthNorm: lineWidthNorm,
        filled: shapeFilled,
        fillColor: color,
      },
    };
    opsRef.current = [...opsRef.current, op];
    const canvas = baseRef.current;
    if (canvas) applyDrawOp(canvas.getContext("2d"), op, canvas.width, canvas.height);
    socket?.emit("draw:commit", { roomCode, op });
    pushUndo(op);
  };

  const onPointerUp = (ev) => {
    const n = pointerNorm(ev);
    const end = n || lastNormRef.current;
    if (
      shapeStartRef.current &&
      end &&
      ["rect", "circle", "line"].includes(tool)
    ) {
      endShape(end);
      return;
    }

    const st = drawingRef.current;
    drawingRef.current = false;
    if (!st || !st.points) return;
    liveByUser.current.delete(userId);
    scheduleLive();
    let pts = smoothPointsNorm(st.points, 2);
    if (pts.length < 2) pts = [st.points[0], st.points[st.points.length - 1]];
    const op = {
      id: st.id,
      userId,
      type: "stroke",
      payload: {
        tool: st.tool,
        color: st.color,
        lineWidthNorm: st.lineWidthNorm,
        points: pts,
      },
    };
    opsRef.current = [...opsRef.current, op];
    const canvas = baseRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      applyDrawOp(ctx, op, canvas.width, canvas.height);
    }
    socket?.emit("draw:commit", { roomCode, op });
    pushUndo(op);
  };

  const onPointerLeave = () => {
    socket?.emit("cursor:leave", { roomCode });
  };

  const clearCanvas = () => {
    socket?.emit("canvas:clear", { roomCode });
  };

  const undo = () => {
    const last = undoStackRef.current.pop();
    if (!last?.snapshot?.id) return;
    redoStackRef.current.push(last);
    socket?.emit("draw:commit", {
      roomCode,
      op: {
        id: nanoid(10),
        type: "undo",
        payload: { strokeId: last.snapshot.id },
      },
    });
  };

  const redo = () => {
    const item = redoStackRef.current.pop();
    if (!item?.snapshot) return;
    const clone = JSON.parse(JSON.stringify(item.snapshot));
    clone.id = nanoid(12);
    clone.userId = userId;
    opsRef.current = [...opsRef.current, clone];
    rebuildBase();
    socket?.emit("draw:commit", { roomCode, op: clone });
    undoStackRef.current.push({
      snapshot: JSON.parse(JSON.stringify(clone)),
    });
  };

  const downloadPng = () => {
    const base = baseRef.current;
    if (!base) return;
    const a = document.createElement("a");
    a.download = `drawing-${roomCode}.png`;
    a.href = base.toDataURL("image/png");
    a.click();
  };

  pointerUpHandlerRef.current = onPointerUp;
  useEffect(() => {
    const onUp = (e) => pointerUpHandlerRef.current?.(e);
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  return (
    <div className="relative flex min-h-[320px] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass flex flex-wrap items-center gap-1 rounded-2xl p-1.5">
          {["brush", "pencil", "eraser"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition ${
                tool === t
                  ? "bg-accent text-white shadow-glow"
                  : "text-ink-800 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-black/10 dark:bg-white/10 sm:block" />
          {["rect", "circle", "line"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                tool === t
                  ? "bg-accent text-white shadow-glow"
                  : "text-ink-800 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTool("fill")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              tool === "fill"
                ? "bg-accent text-white shadow-glow"
                : "text-ink-800 hover:bg-black/5 dark:text-slate-200 dark:hover:bg-white/10"
            }`}
          >
            fill
          </button>
        </div>

        <label className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-ink-800 dark:text-slate-200">
          <span className="hidden sm:inline">Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-lg border border-black/10 bg-white p-0 dark:border-white/10"
          />
        </label>

        <label className="glass flex flex-1 items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-ink-800 dark:text-slate-200 sm:min-w-[200px] sm:max-w-xs sm:flex-none">
          <span className="hidden sm:inline">Size</span>
          <input
            type="range"
            min={2}
            max={80}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </label>

        <label className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-ink-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={shapeFilled}
            onChange={(e) => setShapeFilled(e.target.checked)}
          />
          Fill shapes
        </label>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={undo}
            className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold text-ink-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-ink-900/70 dark:text-white dark:hover:bg-ink-800"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold text-ink-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-ink-900/70 dark:text-white dark:hover:bg-ink-800"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={downloadPng}
            className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-glow hover:bg-accent-dim"
          >
            Save PNG
          </button>
        </div>
      </div>

      {!isDrawer && game?.active && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          Guesser mode: use chat to submit guesses. The drawer is sketching the secret word.
        </div>
      )}

      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-inner dark:border-white/10 dark:bg-slate-950"
        style={{ minHeight: 420 }}
      >
        <canvas
          ref={baseRef}
          className="absolute inset-0 block h-full w-full touch-none"
        />
        <canvas
          ref={liveRef}
          className="pointer-events-none absolute inset-0 block h-full w-full touch-none"
        />
        <canvas
          role="presentation"
          className="absolute inset-0 z-[5] block h-full w-full cursor-crosshair touch-none"
          width={cssW}
          height={cssH}
          style={{ width: "100%", height: "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
        <CursorsLayer remotes={cursors} width="100%" height="100%" />
      </div>
    </div>
  );
}
