// Generic helpers for Football game (math, geometry, etc.)

/**
 * Returns the slanted net line for the goal area.
 * If angle is provided, uses it; otherwise, uses ratios.
 */
export function getSlantedLine(
  goalRect: { x: number; y: number; w: number; h: number },
  netLineTopRatio: number,
  netLineBottomRatio: number,
  netLineAngle: number | null,
) {
  if (netLineAngle !== null) {
    const angle = netLineAngle
    const x1 = goalRect.x + goalRect.w * netLineTopRatio
    const y1 = goalRect.y
    const y2 = goalRect.y + goalRect.h
    const x2 = x1 - goalRect.h / Math.tan(angle)
    return { x1, y1, x2, y2 }
  } else {
    return {
      x1: goalRect.x + goalRect.w * netLineTopRatio,
      y1: goalRect.y,
      x2: goalRect.x + goalRect.w * netLineBottomRatio,
      y2: goalRect.y + goalRect.h,
    }
  }
}

/**
 * Returns a rectangle for the top bar (goalpost), given the goal rect and net line.
 */
export function getTopBarRect(
  goalRect: { x: number; y: number; w: number; h: number },
  netLine: { x1: number; y1: number },
  barThicknessRatio = 0.06,
  minBarThickness = 8,
) {
  const barThickness = Math.max(goalRect.h * barThicknessRatio, minBarThickness)
  const x1 = netLine.x1
  const y1 = netLine.y1
  const x2 = goalRect.x + goalRect.w
  const y2 = goalRect.y
  const barLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  return {
    x: x1,
    y: y1,
    w: barLength,
    h: barThickness,
    angle,
    thicknessDirection: -1, // -1 = upwards
  }
}

/**
 * Projects a point (px, py) onto a line segment (x1, y1)-(x2, y2).
 * Returns t (0-1), closestX, closestY, and distance.
 */
export function projectPointOnLineSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  let t = ((px - x1) * dx + (py - y1) * dy) / (lengthSq || 1e-6)
  t = Math.max(0, Math.min(1, t))
  const closestX = x1 + t * dx
  const closestY = y1 + t * dy
  const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2)
  return { t, closestX, closestY, dist }
}

/**
 * Euclidean distance between two points.
 */
export function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

/**
 * Clamp a value between 0 and 1.
 */
export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

/**
 * Reflect and dampen a velocity vector (vx, vy) against a normal (nx, ny) with damping.
 */
export function reflectVelocity(vx: number, vy: number, nx: number, ny: number, damping: number) {
  const vDotN = vx * nx + vy * ny
  const vpxNew = vx - 2 * vDotN * nx
  const vpyNew = vy - 2 * vDotN * ny
  return { vx: vpxNew * damping, vy: vpyNew * damping }
}

/**
 * Transform a point (px, py) into a rotated rectangle's local coordinates.
 */
export function transformPoint(px: number, py: number, ox: number, oy: number, angle: number) {
  const cosA = Math.cos(-angle)
  const sinA = Math.sin(-angle)
  return {
    x: (px - ox) * cosA - (py - oy) * sinA,
    y: (px - ox) * sinA + (py - oy) * cosA,
  }
}

/**
 * Transform a normal (nx, ny) from local to global coordinates for a rotated rectangle.
 */
export function transformNormal(nx: number, ny: number, angle: number) {
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  return {
    x: nx * cosA + ny * sinA,
    y: -nx * sinA + ny * cosA,
  }
}

// You can add more generic helpers here as needed.
