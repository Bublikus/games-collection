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
  private ballTarget = { x: 0.7, y: 0.8 }; // Target position (field-relative 0-1)
  private animationFrameId: number | null = null;
  private lastTimestamp: number | null = null;

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
      this.canvas.addEventListener('pointermove', this.handlePointerMove);
      this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
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
      relW: 0.07,
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
      this.canvas.removeEventListener('pointermove', this.handlePointerMove);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    }
    this.ctx = null;
    this.fieldImg = null;
    this.basketImg = null;
    this.ballImg = null;
    this.canvas = null;
  }

  private handlePointerMove = (e: PointerEvent) => {
    this.setBallTargetFromEvent(e);
  };

  private handleTouchMove = (e: TouchEvent) => {
    this.preventGesture(e);
    if (e.touches.length > 0) {
      this.setBallTargetFromEvent(e.touches[0]);
    }
  };

  private setBallTargetFromEvent(e: { clientX: number, clientY: number }) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    this.ballTarget.x = Math.max(0, Math.min(1, x));
    this.ballTarget.y = Math.max(0, Math.min(1, y));
  }

  private gameLoop = (timestamp: number) => {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05); // seconds, clamp to avoid big jumps
    this.lastTimestamp = timestamp;
    this.updateBall(dt);
    this.render();
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private updateBall(dt: number) {
    // Spring physics (similar to the React/motion example)
    const damping = 3;
    const stiffness = 50;
    const dx = this.ballTarget.x - this.ballPos.x;
    const dy = this.ballTarget.y - this.ballPos.y;
    const ax = stiffness * dx - damping * this.ballVel.x;
    const ay = stiffness * dy - damping * this.ballVel.y;
    this.ballVel.x += ax * dt;
    this.ballVel.y += ay * dt;
    this.ballPos.x += this.ballVel.x * dt;
    this.ballPos.y += this.ballVel.y * dt;
  }

  private preventGesture = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
}
