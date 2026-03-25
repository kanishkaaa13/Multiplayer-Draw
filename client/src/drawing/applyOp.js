function lineWidthPx(payload, w, h) {
  const n = Number(payload.lineWidthNorm ?? payload.strokeWidthNorm ?? 0.004);
  return Math.max(1, n * Math.min(w, h));
}

function strokeStyle(ctx, tool, color, lw) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (tool === "eraser") {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = lw * 1.25;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = tool === "pencil" ? lw * 0.5 : lw;
  }
}

export function drawSmoothPath(ctx, points, w, h, tool, color, lw) {
  if (!points?.length) return;
  strokeStyle(ctx, tool, color, lw);
  ctx.beginPath();
  ctx.moveTo(points[0][0] * w, points[0][1] * h);
  if (points.length === 1) {
    ctx.lineTo(points[0][0] * w + 0.01, points[0][1] * h);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = ((p0[0] + p1[0]) / 2) * w;
    const my = ((p0[1] + p1[1]) / 2) * h;
    ctx.quadraticCurveTo(p0[0] * w, p0[1] * h, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last[0] * w, last[1] * h);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

export function applyDrawOp(ctx, op, w, h) {
  if (!op?.payload) return;
  if (op.type === "stroke") {
    const p = op.payload;
    const lw = lineWidthPx(p, w, h);
    drawSmoothPath(ctx, p.points, w, h, p.tool, p.color, lw);
    return;
  }
  if (op.type === "shape") {
    const p = op.payload;
    const lw = lineWidthPx(p, w, h);
    const x1 = p.x1 * w;
    const y1 = p.y1 * h;
    const x2 = p.x2 * w;
    const y2 = p.y2 * h;
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.fillColor || p.color;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "source-over";
    if (p.shape === "line") {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (p.shape === "rect") {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      if (p.filled) {
        ctx.fillRect(left, top, rw, rh);
      }
      ctx.strokeRect(left, top, rw, rh);
    } else if (p.shape === "circle") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      if (p.filled) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (op.type === "fill") {
    const { x, y, color } = op.payload;
    /** Caller should use floodFill import for fill ops in pixel space */
    void x;
    void y;
    void color;
    return;
  }
}

export function replayOps(ctx, ops, w, h, floodFill) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  for (const op of ops) {
    if (op.type === "clear") {
      const bg = "#ffffff";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      continue;
    }
    if (op.type === "fill" && floodFill) {
      floodFill(ctx, op);
      continue;
    }
    applyDrawOp(ctx, op, w, h);
  }
  ctx.restore();
}
