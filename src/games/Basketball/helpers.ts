export type ImageRectMode = 'contain' | 'cover';

export interface ImageRect {
  drawW: number;
  drawH: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Calculate the drawn size and offset for an image in a container, supporting 'contain' and 'cover' modes.
 * @param imgW Image natural width
 * @param imgH Image natural height
 * @param rectW Container width
 * @param rectH Container height
 * @param mode 'contain' (default) or 'cover'
 */
export function calcImageRect(
  imgW: number,
  imgH: number,
  rectW: number,
  rectH: number,
  mode: ImageRectMode = 'contain'
): ImageRect {
  const scale = mode === 'cover'
    ? Math.max(rectW / imgW, rectH / imgH)
    : Math.min(rectW / imgW, rectH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = (rectW - drawW) / 2;
  const offsetY = (rectH - drawH) / 2;
  return { drawW, drawH, offsetX, offsetY, scale };
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
  anchorY: number = 0.5  // 0=top, 0.5=center, 1=bottom (relative to drawn image)
): ImageRect {
  const { drawW, drawH, offsetX, offsetY, scale: baseScale } = calcImageRect(
    img.naturalWidth,
    img.naturalHeight,
    containerW,
    containerH,
    mode
  );
  const finalW = drawW * scale;
  const finalH = drawH * scale;
  // Anchor offset: where to place the image relative to its drawn rect
  const anchorOffsetX = (drawW - finalW) * anchorX;
  const anchorOffsetY = (drawH - finalH) * anchorY;
  ctx.drawImage(
    img,
    0, 0, img.naturalWidth, img.naturalHeight,
    offsetX + anchorOffsetX,
    offsetY + anchorOffsetY,
    finalW,
    finalH
  );
  return {
    drawW: finalW,
    drawH: finalH,
    offsetX: offsetX + anchorOffsetX,
    offsetY: offsetY + anchorOffsetY,
    scale: baseScale * scale,
  };
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
  containerRect: { offsetX: number; offsetY: number; drawW: number; drawH: number };
  relX: number;
  relY: number;
  relW: number;
  scale: number;
  aspect: number;
  anchorX?: number;
  anchorY?: number;
}) {
  const w = containerRect.drawW * relW * scale;
  const h = w * aspect;
  const x = containerRect.offsetX + containerRect.drawW * relX - w * anchorX;
  const y = containerRect.offsetY + containerRect.drawH * relY - h * anchorY;
  return { x, y, w, h };
}
