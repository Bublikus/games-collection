import { GameBase } from '../../GameBase';
import fieldImgUrl from './assets/field.png';
import basketImgUrl from './assets/basket.png';
import ballImgUrl from './assets/ball.png';
import { drawImageContained, getImageDrawRect } from './helpers';

export class BasketballGame extends GameBase {
  private ball = {
    pos: { x: 0.7, y: 0.8 },
    vel: { x: 0, y: 0 },
    target: { x: 0.8, y: 0.5 },
    radius: 0.035,
    minThrowSpeed: 1.5,
    maxThrowSpeed: 2.0,
    throwPower: 2,
  };

  private basket = {
    relX: 0.05,
    relY: 0.78,
    relW: 0.15,
    scale: 1.5,
    wallRelXStart: 0.01,
    wallRelXEnd: 0.4,
    wallRelYStart: 0.012,
    wallRelYEnd: 0.39,
    rightWallDamping: 0.1,
  };

  private field = {
    groundY: 0.85,
  };

  private physics = {
    gravity: 9.8 / 2,
    bounceDamping: 0.8,
    wallDamping: 0.7,
  };

  private ctx: CanvasRenderingContext2D | null = null;
  private fieldImg: HTMLImageElement | null = null;
  private basketImg: HTMLImageElement | null = null;
  private ballImg: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly dpr: number = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  private animationFrameId: number | null = null;
  private lastTimestamp: number | null = null;
  private isDragging = false;
  private dragStart: { x: number; y: number; time: number } | null = null;

  async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (this.ctx) {
      this.canvas.width = this.canvas.clientWidth * this.dpr;
      this.canvas.height = this.canvas.clientHeight * this.dpr;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset any existing transforms
      this.ctx.scale(this.dpr, this.dpr);
    }
    // Use GameBase's loadImages utility for generic image loading
    const images = await this.loadImages({ field: fieldImgUrl, basket: basketImgUrl, ball: ballImgUrl });
    this.fieldImg = images.field;
    this.basketImg = images.basket;
    this.ballImg = images.ball;
    this.ball.pos = { ...this.ball.target };
    this.ball.vel = { x: 0, y: 0 };
    this.lastTimestamp = null;
    this.render();
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', this.handlePointerDown);
      this.canvas.addEventListener('pointermove', this.handlePointerMove);
      this.canvas.addEventListener('pointerup', this.handlePointerUp);
      this.canvas.addEventListener('pointerleave', this.handlePointerUp);
      this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
      this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      this.canvas.addEventListener('touchend', this.handleTouchEnd);
      this.canvas.addEventListener('touchcancel', this.handleTouchEnd);
    }
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  }

  private render() {
    if (!this.ctx || !this.fieldImg || !this.basketImg || !this.ballImg || !this.canvas) return;
    const logicalWidth = this.canvas.clientWidth;
    const logicalHeight = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    // Draw field (contain, centered)
    const fieldRect = drawImageContained(
      this.ctx,
      this.fieldImg,
      logicalWidth,
      logicalHeight,
      'contain',
      1,
      0.5,
      0.5
    );
    
    // Draw basket (scale, anchored by bottom-left at 5% x, 78% y of field area)
    const basketAspect = this.basketImg.naturalHeight / this.basketImg.naturalWidth;
    const basketRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.basket.relX,
      relY: this.basket.relY,
      relW: this.basket.relW,
      scale: this.basket.scale,
      aspect: basketAspect,
      anchorX: 0,
      anchorY: 1,
    });
    this.ctx.drawImage(
      this.basketImg,
      0, 0, this.basketImg.naturalWidth, this.basketImg.naturalHeight,
      basketRect.x, basketRect.y, basketRect.w, basketRect.h
    );

    // Draw basket wall debug line
    const wallXStart = basketRect.x + basketRect.w * this.basket.wallRelXStart;
    const wallXEnd = basketRect.x + basketRect.w * this.basket.wallRelXEnd;
    const wallYStart = basketRect.y + basketRect.h * this.basket.wallRelYStart;
    const wallYEnd = basketRect.y + basketRect.h * this.basket.wallRelYEnd;
    this.ctx.save();
    this.ctx.strokeStyle = 'red';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(wallXEnd, wallYStart);
    this.ctx.lineTo(wallXEnd, wallYEnd);
    this.ctx.stroke();
    this.ctx.restore();

    // Draw horizontal basket wall debug line (blue)
    this.ctx.save();
    this.ctx.strokeStyle = 'blue';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(wallXEnd, wallYStart);
    this.ctx.lineTo(wallXStart, wallYStart);
    this.ctx.stroke();
    this.ctx.restore();

    // Draw rectangular constraint (green)
    this.ctx.save();
    this.ctx.strokeStyle = 'green';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      wallXStart, wallYStart,
      wallXEnd - wallXStart, wallYEnd - wallYStart
    );
    this.ctx.restore();

    // Draw ball (scale, anchored at ballPos)
    const ballScale = 1.0;
    const ballAspect = this.ballImg.naturalHeight / this.ballImg.naturalWidth;
    const ballRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.ball.pos.x,
      relY: this.ball.pos.y,
      relW: this.ball.radius * 2, // diameter
      scale: ballScale,
      aspect: ballAspect,
      anchorX: 0.5,
      anchorY: 0.5,
    });
    this.ctx.drawImage(
      this.ballImg,
      0, 0, this.ballImg.naturalWidth, this.ballImg.naturalHeight,
      ballRect.x, ballRect.y, ballRect.w, ballRect.h
    );

    // Ball position in px
    const ballXpx = fieldRect.offsetX + fieldRect.drawW * this.ball.pos.x;
    const ballYpx = fieldRect.offsetY + fieldRect.drawH * this.ball.pos.y;
    const ballRadiusPx = this.ball.radius * fieldRect.drawW;

    // Draw ball collision circle (magenta)
    this.ctx.save();
    this.ctx.strokeStyle = 'magenta';
    this.ctx.beginPath();
    this.ctx.arc(ballXpx, ballYpx, ballRadiusPx, 0, 2 * Math.PI);
    this.ctx.stroke();
    this.ctx.restore();

    // Horizontal basket wall collision (from below only)
    const wallX = wallXStart;
    const wallY = wallYStart;
    // Only block if ball is moving up, crosses the wall from below, and is between wallXStart and wallXEnd
    if (
      this.ball.vel.y < 0 &&
      ballYpx - ballRadiusPx < wallY &&
      ballYpx + ballRadiusPx > wallY &&
      ballXpx > wallX &&
      ballXpx < wallXEnd
    ) {
      // Place ball at the wall and bounce
      this.ball.pos.y = (wallY + ballRadiusPx - fieldRect.offsetY) / fieldRect.drawH;
      this.ball.vel.y *= -this.physics.bounceDamping;
    }
  }

  start() {
    // No-op for now
  }

  pause() {
    // No-op for now
  }

  reset() {
    this.render();
  }

  destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.canvas.removeEventListener('pointermove', this.handlePointerMove);
      this.canvas.removeEventListener('pointerup', this.handlePointerUp);
      this.canvas.removeEventListener('pointerleave', this.handlePointerUp);
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    }
    this.ctx = null;
    this.fieldImg = null;
    this.basketImg = null;
    this.ballImg = null;
    this.canvas = null;
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.setDragStart(e);
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.isDragging) {
      this.setBallPositionToPointer(e);
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.isDragging) {
      this.throwBall(e);
    }
    this.isDragging = false;
  };

  private handleTouchStart = (e: TouchEvent) => {
    this.preventGesture(e);
    this.isDragging = true;
    if (e.touches.length > 0) {
      this.setDragStart(e.touches[0]);
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    this.preventGesture(e);
    if (this.isDragging && e.touches.length > 0) {
      this.setBallPositionToPointer(e.touches[0]);
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.isDragging && e.changedTouches.length > 0) {
      this.throwBall(e.changedTouches[0]);
    }
    this.isDragging = false;
  };

  private setDragStart(e: { clientX: number, clientY: number }) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    this.dragStart = { x, y, time: performance.now() };
    // Place the ball at the drag start
    this.ball.pos.x = Math.max(0, Math.min(1, x));
    this.ball.pos.y = Math.max(0, Math.min(1, y));
    this.ball.vel.x = 0;
    this.ball.vel.y = 0;
  }

  private throwBall(e: { clientX: number, clientY: number }) {
    if (!this.canvas || !this.dragStart) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const dt = (performance.now() - this.dragStart.time) / 1000;
    // Avoid division by zero
    if (dt < 0.01) return;
    // Calculate velocity (pixels per second in field-relative units)
    let vx = (x - this.dragStart.x) / dt * this.ball.throwPower;
    let vy = (y - this.dragStart.y) / dt * this.ball.throwPower;

    // Clamp velocity
    const minSpeed = this.ball.minThrowSpeed;
    const maxSpeed = this.ball.maxThrowSpeed;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < minSpeed) {
      if (speed > 0) {
        vx = vx * (minSpeed / speed);
        vy = vy * (minSpeed / speed);
      }
    }
    if (speed > maxSpeed) {
      vx = vx * (maxSpeed / speed);
      vy = vy * (maxSpeed / speed);
    }

    this.ball.vel.x = vx;
    this.ball.vel.y = vy;
    this.dragStart = null;
  }

  private gameLoop = (timestamp: number) => {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05); // seconds, clamp to avoid big jumps
    this.lastTimestamp = timestamp;
    if (!this.isDragging) {
      this.updateBall(dt);
    }
    this.render();
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private updateBall(dt: number) {
    // Gravity
    this.ball.vel.y += this.physics.gravity * dt;

    // Update positions with velocity
    this.ball.pos.x += this.ball.vel.x * dt;
    this.ball.pos.y += this.ball.vel.y * dt;

    // Bounce off ground
    const ballBottom = this.ball.pos.y + this.ball.radius;
    if (ballBottom > this.field.groundY) {
      this.ball.pos.y = this.field.groundY - this.ball.radius;
      this.ball.vel.y *= -this.physics.bounceDamping; // lose some energy on bounce
      if (Math.abs(this.ball.vel.y) < 0.1) {
        this.ball.vel.y = 0;
      }
    }

    // Bounce off left wall
    if (this.ball.pos.x - this.ball.radius < 0) {
      this.ball.pos.x = this.ball.radius;
      this.ball.vel.x *= -this.physics.wallDamping;
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0;
    }
    // Bounce off right wall
    if (this.ball.pos.x + this.ball.radius > 1) {
      this.ball.pos.x = 1 - this.ball.radius;
      this.ball.vel.x *= -this.physics.wallDamping;
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0;
    }

    // Basket wall collision (from right side only)
    // Recompute fieldRect and basketRect as in render
    if (!this.canvas || !this.basketImg || !this.fieldImg) return;
    const logicalWidth = this.canvas.clientWidth;
    const logicalHeight = this.canvas.clientHeight;
    const fieldRect = drawImageContained(
      this.ctx!,
      this.fieldImg,
      logicalWidth,
      logicalHeight,
      'contain',
      1,
      0.5,
      0.5
    );
    const basketAspect = this.basketImg.naturalHeight / this.basketImg.naturalWidth;
    const basketRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.basket.relX,
      relY: this.basket.relY,
      relW: this.basket.relW,
      scale: this.basket.scale,
      aspect: basketAspect,
      anchorX: 0,
      anchorY: 1,
    });
    const wallXStart = basketRect.x + basketRect.w * this.basket.wallRelXStart;
    const wallXEnd = basketRect.x + basketRect.w * this.basket.wallRelXEnd;
    const wallYStart = basketRect.y + basketRect.h * this.basket.wallRelYStart;
    const wallYEnd = basketRect.y + basketRect.h * this.basket.wallRelYEnd;
    // Ball position in px
    const ballXpx = fieldRect.offsetX + fieldRect.drawW * this.ball.pos.x;
    const ballYpx = fieldRect.offsetY + fieldRect.drawH * this.ball.pos.y;
    const ballRadiusPx = this.ball.radius * fieldRect.drawW;
    // (Removed special-case basket wall collision here)

    // Rectangular constraint collision
    const rectLeft = wallXStart;
    const rectRight = wallXEnd;
    const rectTop = wallYStart;
    const rectBottom = wallYEnd;
    // Ball bounding box in px
    const ballLeft = ballXpx - ballRadiusPx;
    const ballRight = ballXpx + ballRadiusPx;
    const ballTop = ballYpx - ballRadiusPx;
    const ballBottomPx = ballYpx + ballRadiusPx;
    // Check overlap
    if (
      ballRight > rectLeft &&
      ballLeft < rectRight &&
      ballBottomPx > rectTop &&
      ballTop < rectBottom
    ) {
      // Find the minimal penetration direction
      const overlapLeft = ballRight - rectLeft;
      const overlapRight = rectRight - ballLeft;
      const overlapTop = ballBottomPx - rectTop;
      const overlapBottom = rectBottom - ballTop;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) {
        // Collided with left side
        this.ball.pos.x = (rectLeft - ballRadiusPx - fieldRect.offsetX) / fieldRect.drawW;
        this.ball.vel.x *= -this.physics.wallDamping;
      } else if (minOverlap === overlapRight) {
        // Collided with right side
        this.ball.pos.x = (rectRight + ballRadiusPx - fieldRect.offsetX) / fieldRect.drawW;
        this.ball.vel.x *= -this.basket.rightWallDamping;
      } else if (minOverlap === overlapTop) {
        // Collided with top
        this.ball.pos.y = (rectTop - ballRadiusPx - fieldRect.offsetY) / fieldRect.drawH;
        this.ball.vel.y *= -this.physics.bounceDamping;
      } else if (minOverlap === overlapBottom) {
        // Collided with bottom
        this.ball.pos.y = (rectBottom + ballRadiusPx - fieldRect.offsetY) / fieldRect.drawH;
        this.ball.vel.y *= -this.physics.bounceDamping;
      }
    }
  }

  private preventGesture = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  private setBallPositionToPointer(e: { clientX: number, clientY: number }) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    this.ball.pos.x = Math.max(0, Math.min(1, x));
    this.ball.pos.y = Math.max(0, Math.min(1, y));
  }
}

