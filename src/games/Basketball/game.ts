import { GameBase } from '../../GameBase';
import fieldImgUrl from './assets/field.png';
import basketImgUrl from './assets/basket.png';
import ballImgUrl from './assets/ball.png';
import { drawImageContained, getImageDrawRect } from './helpers';

export class BasketballGame extends GameBase {
  private ctx: CanvasRenderingContext2D | null = null;
  private fieldImg: HTMLImageElement | null = null;
  private basketImg: HTMLImageElement | null = null;
  private ballImg: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly dpr: number = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  private ballPos = { x: 0.7, y: 0.8 }; // Current ball position (field-relative 0-1)
  private ballVel = { x: 0, y: 0 }; // Current ball velocity
  private ballTarget = { x: 0.8, y: 0.5 }; // Target position (field-relative 0-1)
  private animationFrameId: number | null = null;
  private lastTimestamp: number | null = null;
  private ballRadius = 0.035; // Field-relative radius (e.g., 3.5% of field height)
  private groundY = 0.85; // Field-relative y-position for the ground (90% down)
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
    this.ballPos = { ...this.ballTarget };
    this.ballVel = { x: 0, y: 0 };
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
    const basketScale = 1.5;
    const basketAspect = this.basketImg.naturalHeight / this.basketImg.naturalWidth;
    const basketRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: 0.05,
      relY: 0.78,
      relW: 0.15,
      scale: basketScale,
      aspect: basketAspect,
      anchorX: 0,
      anchorY: 1,
    });
    this.ctx.drawImage(
      this.basketImg,
      0, 0, this.basketImg.naturalWidth, this.basketImg.naturalHeight,
      basketRect.x, basketRect.y, basketRect.w, basketRect.h
    );

    // Draw ball (scale, anchored at ballPos)
    const ballScale = 1.0;
    const ballAspect = this.ballImg.naturalHeight / this.ballImg.naturalWidth;
    const ballRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.ballPos.x,
      relY: this.ballPos.y,
      relW: this.ballRadius * 2, // diameter
      scale: ballScale,
      aspect: ballAspect,
      anchorX: 0.5,
      anchorY: 1,
    });
    this.ctx.drawImage(
      this.ballImg,
      0, 0, this.ballImg.naturalWidth, this.ballImg.naturalHeight,
      ballRect.x, ballRect.y, ballRect.w, ballRect.h
    );
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
    this.ballPos.x = Math.max(0, Math.min(1, x));
    this.ballPos.y = Math.max(0, Math.min(1, y));
    this.ballVel.x = 0;
    this.ballVel.y = 0;
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
    const power = 2; // Double the throw power
    let vx = (x - this.dragStart.x) / dt * power;
    let vy = (y - this.dragStart.y) / dt * power;

    // Clamp velocity
    const minSpeed = 1.5; // field units per second
    const maxSpeed = 2; // field units per second
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

    this.ballVel.x = vx;
    this.ballVel.y = vy;
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
    const gravity = 9.8 / 2; // field units per second squared (tweak as needed)
    this.ballVel.y += gravity * dt;

    // Update positions with velocity
    this.ballPos.x += this.ballVel.x * dt;
    this.ballPos.y += this.ballVel.y * dt;

    // Bounce off ground
    const ballBottom = this.ballPos.y + this.ballRadius;
    if (ballBottom > this.groundY) {
      this.ballPos.y = this.groundY - this.ballRadius;
      this.ballVel.y *= -0.7; // lose some energy on bounce
      if (Math.abs(this.ballVel.y) < 0.1) {
        this.ballVel.y = 0;
      }
    }

    // Bounce off left wall
    if (this.ballPos.x - this.ballRadius < 0) {
      this.ballPos.x = this.ballRadius;
      this.ballVel.x *= -0.7;
      if (Math.abs(this.ballVel.x) < 0.1) this.ballVel.x = 0;
    }
    // Bounce off right wall
    if (this.ballPos.x + this.ballRadius > 1) {
      this.ballPos.x = 1 - this.ballRadius;
      this.ballVel.x *= -0.7;
      if (Math.abs(this.ballVel.x) < 0.1) this.ballVel.x = 0;
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
    this.ballPos.x = Math.max(0, Math.min(1, x));
    this.ballPos.y = Math.max(0, Math.min(1, y));
  }
}

