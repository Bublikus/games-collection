import { GameBase } from '../../GameBase';
import fieldImgUrl from './assets/field.png';
import basketImgUrl from './assets/basket.png';
import ballImgUrl from './assets/ball.png';

export class BasketballGame extends GameBase {
  private ctx: CanvasRenderingContext2D | null = null;
  private fieldImg: HTMLImageElement | null = null;
  private basketImg: HTMLImageElement | null = null;
  private ballImg: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Use GameBase's loadImages utility for generic image loading
    const images = await this.loadImages({ field: fieldImgUrl, basket: basketImgUrl, ball: ballImgUrl });
    this.fieldImg = images.field;
    this.basketImg = images.basket;
    this.ballImg = images.ball;
    this.render();
  }

  private render() {
    if (!this.ctx || !this.fieldImg || !this.basketImg || !this.ballImg || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // --- CONTAIN MODE for field image using base utility ---
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const imgW = this.fieldImg.naturalWidth;
    const imgH = this.fieldImg.naturalHeight;
    const { drawW, drawH, offsetX, offsetY } = this.calcImageRect(imgW, imgH, canvasW, canvasH, 'contain');
    this.ctx.drawImage(this.fieldImg, 0, 0, imgW, imgH, offsetX, offsetY, drawW, drawH);

    // --- Basket image scaling ---
    const basketScale = 1.5; // <--- Adjust this value to scale the basket image
    const basketImgW = this.basketImg.naturalWidth;
    const basketImgH = this.basketImg.naturalHeight;
    let basketWidth = drawW * 0.15;
    let basketHeight = basketWidth * (basketImgH / basketImgW);
    basketWidth *= basketScale;
    basketHeight *= basketScale;

    // Anchor basket by its bottom-left corner
    const anchorX = offsetX + drawW * 0.05;
    const anchorY = offsetY + drawH * 0.78;
    this.ctx.drawImage(
      this.basketImg,
      anchorX,
      anchorY - basketHeight,
      basketWidth,
      basketHeight
    );

    // --- Ball image scaling and placement ---
    const ballScale = 1.0; // <--- Adjust this value to scale the ball image
    const ballImgW = this.ballImg.naturalWidth;
    const ballImgH = this.ballImg.naturalHeight;
    let ballWidth = drawW * 0.07;
    let ballHeight = ballWidth * (ballImgH / ballImgW);
    ballWidth *= ballScale;
    ballHeight *= ballScale;

    // Place ball at the center bottom of the field area
    const ballAnchorX = offsetX + drawW * 0.7;
    const ballAnchorY = offsetY + drawH * 0.8;
    this.ctx.drawImage(
      this.ballImg,
      ballAnchorX,
      ballAnchorY - ballHeight,
      ballWidth,
      ballHeight
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
