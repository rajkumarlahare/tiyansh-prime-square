(() => {
  'use strict';

  const EPSILON = 1e-9;

  function validPoint(point) {
    return Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
  }

  function cleanPoints(points) {
    return Array.isArray(points)
      ? points.filter(validPoint).map((point) => [Number(point[0]), Number(point[1])])
      : [];
  }

  function pointInPolygon(point, polygon) {
    const points = cleanPoints(polygon);
    if (!validPoint(point) || points.length < 3) return false;
    const x = Number(point[0]);
    const y = Number(point[1]);
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i];
      const b = points[j];
      if (((a[1] > y) !== (b[1] > y)) &&
          x < ((b[0] - a[0]) * (y - a[1])) / ((b[1] - a[1]) || EPSILON) + a[0]) {
        inside = !inside;
      }
    }
    return inside;
  }

  function polygonCentroid(polygon) {
    const points = cleanPoints(polygon);
    if (!points.length) return [0, 0];
    if (points.length < 3) {
      return [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ];
    }

    let crossSum = 0;
    let xSum = 0;
    let ySum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const cross = current[0] * next[1] - next[0] * current[1];
      crossSum += cross;
      xSum += (current[0] + next[0]) * cross;
      ySum += (current[1] + next[1]) * cross;
    }

    if (Math.abs(crossSum) < EPSILON) {
      return [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ];
    }

    return [xSum / (3 * crossSum), ySum / (3 * crossSum)];
  }

  function distanceToSegment(point, start, end) {
    const px = point[0];
    const py = point[1];
    const ax = start[0];
    const ay = start[1];
    const bx = end[0];
    const by = end[1];
    const vx = bx - ax;
    const vy = by - ay;
    const length = vx * vx + vy * vy;
    if (length <= EPSILON) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / length));
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
  }

  function edgeClearance(point, polygon) {
    let best = Infinity;
    for (let i = 0; i < polygon.length; i += 1) {
      best = Math.min(best, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
    }
    return best;
  }

  /**
   * Returns a stable interior point for labels/focus. Mathematical polygon
   * centroid is preferred when it is safely inside. Concave polygons fall back
   * to a tiny deterministic interior search, so labels never drift into roads.
   */
  function labelPoint(polygon) {
    const points = cleanPoints(polygon);
    if (!points.length) return [0, 0];
    if (points.length < 3) return polygonCentroid(points);

    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const mean = [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
    const centroid = polygonCentroid(points);
    const candidates = [centroid, mean, [(minX + maxX) / 2, (minY + maxY) / 2]];

    // 7x7 is intentionally small: called only when geometry is loaded/rescaled,
    // not per animation frame. It handles common L/U/concave civil plot shapes.
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        candidates.push([
          minX + width * ((column + 0.5) / 7),
          minY + height * ((row + 0.5) / 7),
        ]);
      }
    }

    let best = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      if (!validPoint(candidate) || !pointInPolygon(candidate, points)) continue;
      const score = edgeClearance(candidate, points);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (best) return [best[0], best[1]];
    return [centroid[0], centroid[1]];
  }

  globalThis.RekixoProjectGeometry = Object.freeze({
    pointInPolygon,
    polygonCentroid,
    labelPoint,
  });
})();
