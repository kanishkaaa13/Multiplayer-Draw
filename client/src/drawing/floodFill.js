function parseHex(hex) {
  const h = hex.replace("#", "");
  let r;
  let g;
  let b;
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return { r, g, b, a: 255 };
}

function idx(x, y, w) {
  return (y * w + x) * 4;
}

function match(a, b, tol = 32) {
  return (
    Math.abs(a.r - b.r) <= tol &&
    Math.abs(a.g - b.g) <= tol &&
    Math.abs(a.b - b.b) <= tol &&
    Math.abs(a.a - b.a) <= tol
  );
}

/** Stack-based flood fill on canvas 2d context (pixel space). */
export function floodFillAt(ctx, sx, sy, fillHex, width, height) {
  const fill = parseHex(fillHex);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
  const start = {
    r: d[idx(x0, y0, width)],
    g: d[idx(x0, y0, width) + 1],
    b: d[idx(x0, y0, width) + 2],
    a: d[idx(x0, y0, width) + 3],
  };
  if (match(start, fill, 8)) return false;

  const stack = [[x0, y0]];
  const seen = new Uint8Array(width * height);

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const si = y * width + x;
    if (seen[si]) continue;
    seen[si] = 1;
    const i = idx(x, y, width);
    const cur = { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
    if (!match(cur, start)) continue;
    d[i] = fill.r;
    d[i + 1] = fill.g;
    d[i + 2] = fill.b;
    d[i + 3] = 255;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  ctx.putImageData(img, 0, 0);
  return true;
}
