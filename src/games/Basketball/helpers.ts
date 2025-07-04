export type ImageRectMode = 'contain' | 'cover'

export interface ImageRect {
  drawW: number
  drawH: number
  offsetX: number
  offsetY: number
  scale: number
}

/**
 * Calculate the drawn size and offset for an image in a container, supporting 'contain' and 'cover' modes.
 * @param imgW Image natural width
 * @param imgH Image natural height
 * @param rectW Container width
 * @param rectH Container height
 * @param mode 'contain' (default) or 'cover'
 * @param originX 0=left, 1=right (default 0.5)
 * @param originY 0=top, 1=bottom (default 0.5)
 */
export function calcImageRect(
  imgW: number,
  imgH: number,
  rectW: number,
  rectH: number,
  mode: ImageRectMode = 'contain',
  originX: number = 0.5,
  originY: number = 0.5,
): ImageRect {
  const scale = mode === 'cover' ? Math.max(rectW / imgW, rectH / imgH) : Math.min(rectW / imgW, rectH / imgH)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const offsetX = (rectW - drawW) * originX
  const offsetY = (rectH - drawH) * originY
  return { drawW, drawH, offsetX, offsetY, scale }
}

/**
 * Draw an image in a container using contain/cover mode, with optional scale and anchor offset.
 * Returns the rect used for drawing.
 */
export function drawImageContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  containerW: number,
  containerH: number,
  mode: ImageRectMode = 'contain',
  scale: number = 1,
  anchorX: number = 0.5, // 0=left, 0.5=center, 1=right (relative to drawn image)
  anchorY: number = 0.5, // 0=top, 0.5=center, 1=bottom (relative to drawn image)
  originX: number = 0.5, // 0=left, 0.5=center, 1=right (focus point in container)
  originY: number = 0.5, // 0=top, 0.5=center, 1=bottom (focus point in container)
): ImageRect {
  const {
    drawW,
    drawH,
    offsetX,
    offsetY,
    scale: baseScale,
  } = calcImageRect(img.naturalWidth, img.naturalHeight, containerW, containerH, mode, originX, originY)
  const finalW = drawW * scale
  const finalH = drawH * scale
  // Anchor offset: where to place the image relative to its drawn rect
  const anchorOffsetX = (drawW - finalW) * anchorX
  const anchorOffsetY = (drawH - finalH) * anchorY
  ctx.drawImage(
    img,
    0,
    0,
    img.naturalWidth,
    img.naturalHeight,
    offsetX + anchorOffsetX,
    offsetY + anchorOffsetY,
    finalW,
    finalH,
  )
  return {
    drawW: finalW,
    drawH: finalH,
    offsetX: offsetX + anchorOffsetX,
    offsetY: offsetY + anchorOffsetY,
    scale: baseScale * scale,
  }
}

/**
 * Calculate the draw rect (x, y, w, h) for an image given a container rect, anchor, scale, aspect ratio, and relative position.
 * @param params Object with:
 *   containerRect: { offsetX, offsetY, drawW, drawH } - The container rect (e.g., field)
 *   relX: number - Relative X (0-1) in container
 *   relY: number - Relative Y (0-1) in container
 *   relW: number - Relative width (0-1) of container
 *   scale: number - Additional scale multiplier
 *   aspect: number - Image aspect ratio (h/w)
 *   anchorX: number - 0=left, 0.5=center, 1=right (default 0.5)
 *   anchorY: number - 0=top, 0.5=center, 1=bottom (default 1)
 * @returns { x, y, w, h }
 */
export function getImageDrawRect({
  containerRect,
  relX,
  relY,
  relW,
  scale,
  aspect,
  anchorX = 0.5,
  anchorY = 1,
}: {
  containerRect: { offsetX: number; offsetY: number; drawW: number; drawH: number }
  relX: number
  relY: number
  relW: number
  scale: number
  aspect: number
  anchorX?: number
  anchorY?: number
}) {
  const w = containerRect.drawW * relW * scale
  const h = w * aspect
  const x = containerRect.offsetX + containerRect.drawW * relX - w * anchorX
  const y = containerRect.offsetY + containerRect.drawH * relY - h * anchorY
  return { x, y, w, h }
}

/**
 * Returns the closest point on a rectangle to a given point (in px)
 * @param px Point x
 * @param py Point y
 * @param rx Rect x
 * @param ry Rect y
 * @param rw Rect width
 * @param rh Rect height
 * @returns { x, y } Closest point on rect
 */
export function closestPointOnRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number) {
  const cx = Math.max(rx, Math.min(px, rx + rw))
  const cy = Math.max(ry, Math.min(py, ry + rh))
  return { x: cx, y: cy }
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Convert pointer event coordinates to relative canvas coordinates (0-1)
 */
export function getPointerRelativeCoords(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  }
}

/**
 * Calculate velocity vector and clamp its magnitude between minSpeed and maxSpeed
 */
export function calcVelocity(
  start: { x: number; y: number },
  end: { x: number; y: number },
  dt: number,
  throwPower: number,
  minSpeed: number,
  maxSpeed: number,
): { vx: number; vy: number } {
  let vx = ((end.x - start.x) / dt) * throwPower
  let vy = ((end.y - start.y) / dt) * throwPower
  const speed = Math.sqrt(vx * vx + vy * vy)
  if (speed < minSpeed && speed > 0) {
    vx = vx * (minSpeed / speed)
    vy = vy * (minSpeed / speed)
  }
  if (speed > maxSpeed) {
    vx = vx * (maxSpeed / speed)
    vy = vy * (maxSpeed / speed)
  }
  return { vx, vy }
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Ease out quadratic (for animation)
 */
export function easeOutQuad(t: number): number {
  return 1 - Math.pow(1 - t, 2)
}

/**
 * Calculate the rim rectangle (goal area) in px
 */
export function getRimRect(
  basketRect: { x: number; y: number; w: number; h: number },
  leftConstraint: { xStart: number; xEnd: number; yStart: number; yEnd: number },
  rightConstraint: { xStart: number; xEnd: number; yStart: number; yEnd: number },
) {
  const rimTopY = basketRect.y + basketRect.h * Math.max(leftConstraint.yStart, rightConstraint.yStart)
  const rimBottomY = basketRect.y + basketRect.h * Math.min(leftConstraint.yEnd, rightConstraint.yEnd)
  const rimLeftX = basketRect.x + basketRect.w * leftConstraint.xEnd
  const rimRightX = basketRect.x + basketRect.w * rightConstraint.xStart
  return {
    x: rimLeftX,
    y: rimTopY,
    w: rimRightX - rimLeftX,
    h: rimBottomY - rimTopY,
  }
}
