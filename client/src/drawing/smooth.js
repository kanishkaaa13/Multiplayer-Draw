/** 3-point moving average in normalized space (cheap, stable stroke smoothing). */
export function smoothPointsNorm(points, passes = 1) {
  if (points.length < 3) return points;
  let p = points;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [p[0]];
    for (let i = 1; i < p.length - 1; i += 1) {
      next.push([
        (p[i - 1][0] + p[i][0] + p[i + 1][0]) / 3,
        (p[i - 1][1] + p[i][1] + p[i + 1][1]) / 3,
      ]);
    }
    next.push(p[p.length - 1]);
    p = next;
  }
  return p;
}
