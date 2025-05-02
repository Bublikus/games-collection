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
    this.render();
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

    // Draw ball (scale, anchored at 70% x, 80% y of field area)
    const ballScale = 1.0;
    const ballAspect = this.ballImg.naturalHeight / this.ballImg.naturalWidth;
    const ballRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: 0.7,
      relY: 0.8,
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
    this.ctx = null;
    this.fieldImg = null;
    this.basketImg = null;
    this.ballImg = null;
    this.canvas = null;
  }
}
