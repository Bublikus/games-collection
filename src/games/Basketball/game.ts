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
    angle: 0, // current rotation angle in radians
    angularVel: 0, // angular velocity in radians/sec
    spinFriction: 0.995, // gentler friction for spin
  };

  private basket = {
    relX: 0.05,
    relY: 0.78,
    relW: 0.15,
    scale: 1.5,
    // Rectangular constraints in basket-relative coordinates
    rectConstraints: [
      // Left side
      {
        coords: { xStart: 0.01, xEnd: 0.4, yStart: 0.012, yEnd: 0.39 },
        damping: { left: 0.9, right: 0.1, top: 0.9, bottom: 0.9 }
      },
      // Middle
      {
        coords: { xStart: 0.4, xEnd: 0.46, yStart: 0.31, yEnd: 0.34 },
        damping: { left: 0.0, right: 0.0, top: 0.0, bottom: 0.0 }
      },
      // Right side
      {
        coords: { xStart: 0.86, xEnd: 0.91, yStart: 0.31, yEnd: 0.34 },
        damping: { left: 0.0, right: 0.9, top: 0.0, bottom: 0.9 }
      },
    ],
  };

  private field = {
    groundY: 0.85,
  };

  private physics = {
    gravity: 9.8 / 2,
    bounceDamping: 0.8,
    wallDamping: 0.7,
  };

  private images: {
    field: HTMLImageElement | null,
    basket: HTMLImageElement | null,
    ball: HTMLImageElement | null,
  } = {
    field: null,
    basket: null,
    ball: null,
  };

  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly dpr: number = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  private animationFrameId: number | null = null;
  private lastTimestamp: number | null = null;
  private isDragging = false;
  private dragStart: { x: number; y: number; time: number } | null = null;
  private DEBUG = false;

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
    this.images.field = images.field;
    this.images.basket = images.basket;
    this.images.ball = images.ball;
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
    if (!this.ctx || !this.images.field || !this.images.basket || !this.images.ball || !this.canvas) return;
    const logicalWidth = this.canvas.clientWidth;
    const logicalHeight = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    // Draw field (contain, centered)
    const fieldRect = drawImageContained(
      this.ctx,
      this.images.field,
      logicalWidth,
      logicalHeight,
      'contain',
      1,
      0.5,
      0.5
    );
    
    // Draw basket (scale, anchored by bottom-left at 5% x, 78% y of field area)
    const basketAspect = this.images.basket.naturalHeight / this.images.basket.naturalWidth;
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
      this.images.basket,
      0, 0, this.images.basket.naturalWidth, this.images.basket.naturalHeight,
      basketRect.x, basketRect.y, basketRect.w, basketRect.h
    );

    // Draw ball (scale, anchored at ballPos)
    const ballScale = 1.0;
    const ballAspect = this.images.ball.naturalHeight / this.images.ball.naturalWidth;
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
    // Draw the ball with rotation
    this.ctx.save();
    this.ctx.translate(ballRect.x + ballRect.w / 2, ballRect.y + ballRect.h / 2);
    this.ctx.rotate(this.ball.angle);
    this.ctx.drawImage(
      this.images.ball,
      0, 0, this.images.ball.naturalWidth, this.images.ball.naturalHeight,
      -ballRect.w / 2, -ballRect.h / 2, ballRect.w, ballRect.h
    );
    this.ctx.restore();

    if (this.DEBUG) {
      // Draw basket wall debug line
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255,0,0,0.7)';
      this.ctx.lineWidth = 2;
      this.ctx.fillStyle = 'rgba(255,0,0,0.7)';
      for (const rect of this.basket.rectConstraints) {
        const { xStart, xEnd, yStart, yEnd } = rect.coords;
        const rx = basketRect.x + basketRect.w * xStart;
        const rw = basketRect.w * (xEnd - xStart);
        const ry = basketRect.y + basketRect.h * yStart;
        const rh = basketRect.h * (yEnd - yStart);
        this.ctx.fillRect(rx, ry, rw, rh);
      }
      this.ctx.restore();
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
    this.images.field = null;
    this.images.basket = null;
    this.images.ball = null;
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
    // Set initial spin to match movement direction (rolling in air)
    this.ball.angularVel = vx / this.ball.radius;
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

    // Gradually align spin to match movement direction (rolling in air)
    const targetAngularVel = this.ball.vel.x / this.ball.radius;
    this.ball.angularVel += (targetAngularVel - this.ball.angularVel) * 0.1;

    // Update rotation
    this.ball.angle += this.ball.angularVel * dt;
    this.ball.angularVel *= this.ball.spinFriction; // slow down spin over time

    // Bounce off ground
    const ballBottom = this.ball.pos.y + this.ball.radius;
    if (ballBottom > this.field.groundY) {
      this.ball.pos.y = this.field.groundY - this.ball.radius;
      this.ball.vel.y *= -this.physics.bounceDamping; // lose some energy on bounce
      if (Math.abs(this.ball.vel.y) < 0.1) {
        this.ball.vel.y = 0;
      }
      // Reverse and gently dampen spin on ground bounce
      this.ball.angularVel *= -0.95;
      // Add tangential spin based on horizontal velocity (simulate friction)
      this.ball.angularVel += this.ball.vel.x * 2;
    }

    // If the ball is on the ground and moving horizontally, force rolling spin
    const onGround = (this.ball.pos.y + this.ball.radius) >= this.field.groundY - 0.0001;
    if (onGround && Math.abs(this.ball.vel.x) > 0.001) {
      this.ball.angularVel = this.ball.vel.x / this.ball.radius;
    }

    // Bounce off left wall
    if (this.ball.pos.x - this.ball.radius < 0) {
      this.ball.pos.x = this.ball.radius;
      this.ball.vel.x *= -this.physics.wallDamping;
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0;
      // Reverse and gently dampen spin on left wall bounce
      this.ball.angularVel *= -0.95;
    }
    // Bounce off right wall
    if (this.ball.pos.x + this.ball.radius > 1) {
      this.ball.pos.x = 1 - this.ball.radius;
      this.ball.vel.x *= -this.physics.wallDamping;
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0;
      // Reverse and gently dampen spin on right wall bounce
      this.ball.angularVel *= -0.95;
    }

    // Basket wall collision (from right side only)
    // Recompute fieldRect and basketRect as in render
    if (!this.canvas || !this.images.basket || !this.images.field) return;
    const logicalWidth = this.canvas.clientWidth;
    const logicalHeight = this.canvas.clientHeight;
    const fieldRect = drawImageContained(
      this.ctx!,
      this.images.field,
      logicalWidth,
      logicalHeight,
      'contain',
      1,
      0.5,
      0.5
    );
    const basketAspect = this.images.basket.naturalHeight / this.images.basket.naturalWidth;
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
    // Ball position in px
    let ballXpx = fieldRect.offsetX + fieldRect.drawW * this.ball.pos.x;
    let ballYpx = fieldRect.offsetY + fieldRect.drawH * this.ball.pos.y;
    const ballRadiusPx = this.ball.radius * fieldRect.drawW;
    // Check overlap for all basket constraints (spherical bounce)
    for (const rect of this.basket.rectConstraints) {
      const { xStart, xEnd, yStart, yEnd } = rect.coords;
      const rectLeft = basketRect.x + basketRect.w * xStart;
      const rectRight = basketRect.x + basketRect.w * xEnd;
      const rectTop = basketRect.y + basketRect.h * yStart;
      const rectBottom = basketRect.y + basketRect.h * yEnd;
      const rectW = rectRight - rectLeft;
      const rectH = rectBottom - rectTop;

      // Find closest point on rect to ball center
      const closest = this.closestPointOnRect(
        ballXpx, ballYpx,
        rectLeft, rectTop, rectW, rectH
      );
      // Vector from closest point to ball center
      const dx = ballXpx - closest.x;
      const dy = ballYpx - closest.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ballRadiusPx) {
        // Collision! Move ball out of rect along normal
        const nx = dx / (dist || 1e-6);
        const ny = dy / (dist || 1e-6);
        // Move ball to just outside the rect
        ballXpx = closest.x + nx * ballRadiusPx;
        ballYpx = closest.y + ny * ballRadiusPx;
        // Find which side is closest
        const overlapLeft = Math.abs(closest.x - rectLeft);
        const overlapRight = Math.abs(closest.x - rectRight);
        const overlapTop = Math.abs(closest.y - rectTop);
        const overlapBottom = Math.abs(closest.y - rectBottom);
        let damping = rect.damping.left;
        let minOverlap = overlapLeft;
        if (overlapRight < minOverlap) {
          damping = rect.damping.right;
          minOverlap = overlapRight;
        }
        if (overlapTop < minOverlap) {
          damping = rect.damping.top;
          minOverlap = overlapTop;
        }
        if (overlapBottom < minOverlap) {
          damping = rect.damping.bottom;
          minOverlap = overlapBottom;
        }
        // Reflect velocity (convert to px/sec for accuracy)
        const vpx = this.ball.vel.x * fieldRect.drawW;
        const vpy = this.ball.vel.y * fieldRect.drawH;
        const vDotN = vpx * nx + vpy * ny;
        // Decompose into normal and tangential components
        const vNormX = vDotN * nx;
        const vNormY = vDotN * ny;
        const vTanX = vpx - vNormX;
        const vTanY = vpy - vNormY;
        // Reflect and dampen only the normal component using the selected side's damping
        const vNormXNew = -vNormX * damping;
        const vNormYNew = -vNormY * damping;
        // Combine
        const newVpx = vTanX + vNormXNew;
        const newVpy = vTanY + vNormYNew;
        // Convert back to rel units
        this.ball.vel.x = newVpx / fieldRect.drawW;
        this.ball.vel.y = newVpy / fieldRect.drawH;

        // Update ball position in relative units
        this.ball.pos.x = (ballXpx - fieldRect.offsetX) / fieldRect.drawW;
        this.ball.pos.y = (ballYpx - fieldRect.offsetY) / fieldRect.drawH;

        // Reverse and gently dampen spin
        this.ball.angularVel *= -0.95;
        break; // Only handle one collision per frame
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

  // Helper: Closest point on rectangle to a point (in px)
  private closestPointOnRect(
    px: number, py: number,
    rx: number, ry: number, rw: number, rh: number
  ) {
    // Clamp px, py to the rectangle
    const cx = Math.max(rx, Math.min(px, rx + rw));
    const cy = Math.max(ry, Math.min(py, ry + rh));
    return { x: cx, y: cy };
  }
}

