import { GameBase } from '../../GameBase'
import fieldImgUrl from './assets/field.png'
import basketImgUrl from './assets/basket.png'
import ballImgUrl from './assets/ball.png'
import basketNetImgUrl from './assets/basket-net.png'
import {
  drawImageContained,
  getImageDrawRect,
  closestPointOnRect,
  clamp,
  getPointerRelativeCoords,
  calcVelocity,
  lerp,
  easeOutQuad,
  getRimRect,
} from './helpers'

export class BasketballGame extends GameBase {
  private DEBUG = false

  private ball = {
    pos: { x: 0.75, y: 0.8 },
    vel: { x: 0, y: 0 },
    radius: 0.035,
    minThrowSpeed: 0.1,
    maxThrowSpeed: 2.3, // will be set dynamically
    throwPower: 0.005,
    angle: 0, // current rotation angle in radians
    angularVel: 0, // angular velocity in radians/sec
    spinFriction: 0.995, // gentler friction for spin
  }

  private basket = {
    relX: 0.05,
    relY: 0.78,
    relW: 0.15,
    scale: 1.5,
    basketNetOffsetX: 0.42, // fraction of basket width
    basketNetOffsetY: -0.5, // fraction of basket height
    // Rectangular constraints in basket-relative coordinates
    rectConstraints: [
      // Left side
      {
        coords: { xStart: 0.01, xEnd: 0.4, yStart: 0.012, yEnd: 0.39 },
        damping: { left: 0.9, right: 0.1, top: 0.9, bottom: 0.9 },
      },
      // Middle
      {
        coords: { xStart: 0.4, xEnd: 0.46, yStart: 0.31, yEnd: 0.34 },
        damping: { left: 0.0, right: 0.0, top: 0.0, bottom: 0.0 },
      },
      // Right side
      {
        coords: { xStart: 0.86, xEnd: 0.91, yStart: 0.31, yEnd: 0.34 },
        damping: { left: 0.0, right: 0.9, top: 0.0, bottom: 0.9 },
      },
    ],
  }

  private field = {
    groundY: 0.8,
    originX: 0.2,
    originY: 0.5,
    groundDamping: 0.9,
  }

  private physics = {
    gravity: 9.8 / 2,
    bounceDamping: 0.8,
    wallDamping: 0.7,
  }

  private images: {
    field: HTMLImageElement | null
    basket: HTMLImageElement | null
    ball: HTMLImageElement | null
    basketNet: HTMLImageElement | null
  } = {
    field: null,
    basket: null,
    ball: null,
    basketNet: null,
  }

  private ctx: CanvasRenderingContext2D | null = null
  private canvas: HTMLCanvasElement | null = null
  private readonly dpr: number = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1
  private animationFrameId: number | null = null
  private lastTimestamp: number | null = null
  private isDragging = false
  private dragStart: { x: number; y: number; time: number } | null = null
  private pointerHistory: { x: number; y: number; time: number }[] = []
  private scoreMessageTimer: number = 0
  private wasInGoalArea: boolean = false
  private isPlaying = false
  private lastClientWidth: number | null = null
  private lastClientHeight: number | null = null
  private justBouncedFromConstraint = false;

  async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    if (this.ctx) {
      this.canvas.width = this.canvas.clientWidth * this.dpr
      this.canvas.height = this.canvas.clientHeight * this.dpr
      this.ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset any existing transforms
      this.ctx.scale(this.dpr, this.dpr)
    }
    this.lastClientWidth = this.canvas ? this.canvas.clientWidth : null;
    this.lastClientHeight = this.canvas ? this.canvas.clientHeight : null;
    this.updateMaxThrowSpeed();
    // Use GameBase's loadImages utility for generic image loading
    const images = await this.loadImages({
      field: fieldImgUrl,
      basket: basketImgUrl,
      ball: ballImgUrl,
      basketNet: basketNetImgUrl,
    })
    this.images.field = images.field
    this.images.basket = images.basket
    this.images.ball = images.ball
    this.images.basketNet = images.basketNet
    // Calculate fieldRect as in render
    if (this.ctx && this.images.field && this.canvas) {
      const logicalWidth = this.canvas.clientWidth
      const logicalHeight = this.canvas.clientHeight
      const fieldRect = drawImageContained(
        this.ctx,
        this.images.field,
        logicalWidth,
        logicalHeight,
        'cover',
        1,
        0.5,
        0.5,
        this.field.originX,
        this.field.originY,
      )
      // Set ball to 75% of screen width and 50% of screen height in field coordinates
      const screenX = 0.75 * logicalWidth
      const screenY = 0.5 * logicalHeight
      this.ball.pos.x = clamp((screenX - fieldRect.offsetX) / fieldRect.drawW, 0, 1)
      this.ball.pos.y = clamp((screenY - fieldRect.offsetY) / fieldRect.drawH, 0, 1)
    }
    this.ball.vel = { x: 0, y: 0 }
    this.lastTimestamp = null
    this.render()
    if (this.canvas) {
      this.canvas.addEventListener('pointerdown', this.handlePointerDown)
      this.canvas.addEventListener('pointermove', this.handlePointerMove)
      this.canvas.addEventListener('pointerup', this.handlePointerUp)
      this.canvas.addEventListener('pointerleave', this.handlePointerUp)
      this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false })
      this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false })
      this.canvas.addEventListener('touchend', this.handleTouchEnd)
      this.canvas.addEventListener('touchcancel', this.handleTouchEnd)
    }
    // Do not start animation frame here
  }

  private render() {
    if (
      !this.ctx ||
      !this.images.field ||
      !this.images.basket ||
      !this.images.ball ||
      !this.images.basketNet ||
      !this.canvas
    )
      return
    // Responsive: auto-resize canvas if CSS size changed
    const clientWidth = this.canvas.clientWidth;
    const clientHeight = this.canvas.clientHeight;
    if (clientWidth !== this.lastClientWidth || clientHeight !== this.lastClientHeight) {
      this.resize(clientWidth, clientHeight);
      this.lastClientWidth = clientWidth;
      this.lastClientHeight = clientHeight;
    }
    const logicalWidth = this.canvas.clientWidth
    const logicalHeight = this.canvas.clientHeight
    this.ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    // Draw field (cover, centered or shifted by aspect)
    const fieldRect = drawImageContained(
      this.ctx,
      this.images.field,
      logicalWidth,
      logicalHeight,
      'cover',
      1,
      0.5,
      0.5,
      this.field.originX,
      this.field.originY,
    )

    // Draw basket (scale, anchored by bottom-left at 5% x, 78% y of field area)
    const basketAspect = this.images.basket.naturalHeight / this.images.basket.naturalWidth
    const basketRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.basket.relX,
      relY: this.basket.relY,
      relW: this.basket.relW,
      scale: this.basket.scale,
      aspect: basketAspect,
      anchorX: 0,
      anchorY: 1,
    })
    this.ctx.drawImage(
      this.images.basket,
      0,
      0,
      this.images.basket.naturalWidth,
      this.images.basket.naturalHeight,
      basketRect.x,
      basketRect.y,
      basketRect.w,
      basketRect.h,
    )

    // Draw ball (scale, anchored at ballPos)
    const ballScale = 1.0
    const ballAspect = this.images.ball.naturalHeight / this.images.ball.naturalWidth
    const ballRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.ball.pos.x,
      relY: this.ball.pos.y,
      relW: this.ball.radius * 2, // diameter
      scale: ballScale,
      aspect: ballAspect,
      anchorX: 0.5,
      anchorY: 0.5,
    })
    // Draw the ball with rotation
    this.ctx.save()
    this.ctx.translate(ballRect.x + ballRect.w / 2, ballRect.y + ballRect.h / 2)
    this.ctx.rotate(this.ball.angle)
    this.ctx.drawImage(
      this.images.ball,
      0,
      0,
      this.images.ball.naturalWidth,
      this.images.ball.naturalHeight,
      -ballRect.w / 2,
      -ballRect.h / 2,
      ballRect.w,
      ballRect.h,
    )
    this.ctx.restore()
    // Draw basket net (keep its aspect, scale with basket, anchor bottom-left)
    const basketNetScale = basketRect.w / this.images.basket.naturalWidth
    const basketNetW = this.images.basketNet.naturalWidth * basketNetScale
    const basketNetH = this.images.basketNet.naturalHeight * basketNetScale
    // Apply calibration offsets (fractions of basket size, scaled)
    const netOffsetX = this.basket.basketNetOffsetX * basketRect.w
    const netOffsetY = this.basket.basketNetOffsetY * basketRect.h
    this.ctx.drawImage(
      this.images.basketNet,
      0,
      0,
      this.images.basketNet.naturalWidth,
      this.images.basketNet.naturalHeight,
      basketRect.x + netOffsetX,
      basketRect.y + basketRect.h - basketNetH + netOffsetY,
      basketNetW,
      basketNetH,
    )

    if (this.DEBUG) {
      // Draw basket wall debug line
      this.ctx.save()
      this.ctx.strokeStyle = 'rgba(255,0,0,0.7)'
      this.ctx.lineWidth = 2
      this.ctx.fillStyle = 'rgba(255,0,0,0.7)'
      for (const rect of this.basket.rectConstraints) {
        const { xStart, xEnd, yStart, yEnd } = rect.coords
        const rx = basketRect.x + basketRect.w * xStart
        const rw = basketRect.w * (xEnd - xStart)
        const ry = basketRect.y + basketRect.h * yStart
        const rh = basketRect.h * (yEnd - yStart)
        this.ctx.fillRect(rx, ry, rw, rh)
      }
      this.ctx.restore()

      // Draw goal rectangle (rim area) for debugging
      this.ctx.save()
      this.ctx.strokeStyle = 'rgba(0,255,0,0.8)'
      this.ctx.lineWidth = 2
      this.ctx.fillStyle = 'rgba(0,255,0,0.2)'
      const leftConstraint = this.basket.rectConstraints[1].coords
      const rightConstraint = this.basket.rectConstraints[2].coords
      const rimTopY = basketRect.y + basketRect.h * Math.max(leftConstraint.yStart, rightConstraint.yStart)
      const rimBottomY = basketRect.y + basketRect.h * Math.min(leftConstraint.yEnd, rightConstraint.yEnd)
      const rimLeftX = basketRect.x + basketRect.w * leftConstraint.xEnd
      const rimRightX = basketRect.x + basketRect.w * rightConstraint.xStart
      const rimW = rimRightX - rimLeftX
      const rimH = rimBottomY - rimTopY
      this.ctx.fillRect(rimLeftX, rimTopY, rimW, rimH)
      this.ctx.strokeRect(rimLeftX, rimTopY, rimW, rimH)
      this.ctx.restore()

      // Diagnostic: draw a filled blue rectangle at the top-left of fieldRect and border only in DEBUG mode
      const inset = 4 // half the line width
      this.ctx.save()
      this.ctx.strokeStyle = 'blue'
      this.ctx.lineWidth = 8
      this.ctx.strokeRect(inset, inset, logicalWidth - 2 * inset, logicalHeight - 2 * inset)
      this.ctx.restore()
    }

    // Draw score message if timer is active
    if (this.scoreMessageTimer > 0 && this.ctx) {
      this.ctx.save()
      const logicalWidth = this.canvas.clientWidth
      const logicalHeight = this.canvas.clientHeight
      const msg = 'Score!'

      // Animation: from below to final position
      const appearDuration = 0.3 // seconds for the animation to reach final position
      const totalDuration = 2.0 // matches your timer
      const t = clamp((totalDuration - this.scoreMessageTimer) / appearDuration, 0, 1)
      const ease = easeOutQuad(t)

      const baseY = logicalHeight * 0.05
      const startY = baseY + logicalHeight * 0.05 // start lower
      const y = lerp(startY, baseY, ease)

      // Optional: fade in/out
      let alpha = 1
      if (this.scoreMessageTimer > totalDuration - appearDuration) {
        // Fade in
        alpha = t
      } else if (this.scoreMessageTimer < 0.3) {
        // Fade out at the end
        alpha = clamp(this.scoreMessageTimer / 0.3, 0, 1)
      }

      this.ctx.globalAlpha = alpha
      this.ctx.font = `bold ${Math.floor(logicalHeight * 0.08)}px sans-serif`
      this.ctx.fillStyle = '#FFD700'
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'top'
      this.ctx.strokeStyle = '#000'
      this.ctx.lineWidth = 4
      const x = logicalWidth / 2
      this.ctx.strokeText(msg, x, y)
      this.ctx.fillText(msg, x, y)
      this.ctx.restore()
    }
  }

  start() {
    this.isPlaying = true
    if (this.animationFrameId === null) {
      this.lastTimestamp = null
      this.animationFrameId = requestAnimationFrame(this.gameLoop)
    }
  }

  play() {
    this.isPlaying = true
  }

  pause() {
    this.isPlaying = false
  }

  reset() {
    this.render()
    this.scoreMessageTimer = 0
    this.wasInGoalArea = false
  }

  destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
      this.canvas.removeEventListener('pointermove', this.handlePointerMove)
      this.canvas.removeEventListener('pointerup', this.handlePointerUp)
      this.canvas.removeEventListener('pointerleave', this.handlePointerUp)
      this.canvas.removeEventListener('touchstart', this.handleTouchStart)
      this.canvas.removeEventListener('touchmove', this.handleTouchMove)
      this.canvas.removeEventListener('touchend', this.handleTouchEnd)
      this.canvas.removeEventListener('touchcancel', this.handleTouchEnd)
    }
    this.ctx = null
    this.images.field = null
    this.images.basket = null
    this.images.ball = null
    this.images.basketNet = null
    this.canvas = null
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.isDragging = true
    this.setDragStart(e)
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (this.isDragging) {
      this.setBallPositionToPointer(e)
    }
  }

  private handlePointerUp = () => {
    if (this.isDragging) {
      this.throwBall()
    }
    this.isDragging = false
  }

  private handleTouchStart = (e: TouchEvent) => {
    this.preventGesture(e)
    this.isDragging = true
    if (e.touches.length > 0) {
      this.setDragStart(e.touches[0])
    }
  }

  private handleTouchMove = (e: TouchEvent) => {
    this.preventGesture(e)
    if (this.isDragging && e.touches.length > 0) {
      this.setBallPositionToPointer(e.touches[0])
    }
  }

  private handleTouchEnd = (e: TouchEvent) => {
    if (this.isDragging && e.changedTouches.length > 0) {
      this.throwBall()
    }
    this.isDragging = false
  }

  private setDragStart(e: { clientX: number; clientY: number }) {
    if (!this.canvas || !this.ctx || !this.images.field) return
    const { x, y } = getPointerRelativeCoords(e, this.canvas)
    const pointerX = x * this.canvas.clientWidth
    const pointerY = y * this.canvas.clientHeight
    // Calculate fieldRect as in render
    const logicalWidth = this.canvas.clientWidth
    const logicalHeight = this.canvas.clientHeight
    const fieldRect = drawImageContained(
      this.ctx,
      this.images.field,
      logicalWidth,
      logicalHeight,
      'cover',
      1,
      0.5,
      0.5,
      this.field.originX,
      this.field.originY,
    )
    this.dragStart = { x: pointerX, y: pointerY, time: performance.now() }
    // Place the ball at the drag start, mapped to fieldRect
    this.ball.pos.x = clamp((pointerX - fieldRect.offsetX) / fieldRect.drawW, 0, 1)
    this.ball.pos.y = clamp((pointerY - fieldRect.offsetY) / fieldRect.drawH, 0, 1)
    this.ball.vel.x = 0
    this.ball.vel.y = 0
    // Clear pointer history
    this.pointerHistory = []
  }

  private throwBall() {
    if (!this.canvas || !this.dragStart) return
    // Use pointer history for velocity
    if (this.pointerHistory.length >= 2) {
      const last = this.pointerHistory[this.pointerHistory.length - 1]
      // Find a sample 50-100ms before the last one
      let prev = this.pointerHistory[0]
      for (let i = this.pointerHistory.length - 2; i >= 0; i--) {
        if (last.time - this.pointerHistory[i].time > 50) {
          prev = this.pointerHistory[i]
          break
        }
      }
      const dt = (last.time - prev.time) / 1000
      if (dt > 0) {
        // Use your existing calcVelocity logic, but with dx, dy, dt
        const { vx, vy } = calcVelocity(
          { x: prev.x, y: prev.y },
          { x: last.x, y: last.y },
          dt,
          this.ball.throwPower,
          this.ball.minThrowSpeed,
          this.ball.maxThrowSpeed,
        )
        this.ball.vel.x = vx
        this.ball.vel.y = vy
        this.ball.angularVel = vx / this.ball.radius
        // If the ball is below the ground line, add extra upward velocity
        const groundY = this.field.groundY;
        if (this.ball.pos.y + this.ball.radius > groundY) {
          const below = (this.ball.pos.y + this.ball.radius) - groundY;
          // Tune the multiplier as needed for desired effect
          const bounceBoost = below * 5;
          this.ball.vel.y += bounceBoost;
          // Clamp the ball to just above the ground
          this.ball.pos.y = groundY - this.ball.radius;
          this.justBouncedFromConstraint = true;
        }
      }
    }
    this.dragStart = null
    this.pointerHistory = []
  }

  private gameLoop = (timestamp: number) => {
    // Responsive: auto-resize canvas if CSS size changed
    if (this.canvas) {
      const clientWidth = this.canvas.clientWidth;
      const clientHeight = this.canvas.clientHeight;
      if (clientWidth !== this.lastClientWidth || clientHeight !== this.lastClientHeight) {
        this.resize(clientWidth, clientHeight);
        this.lastClientWidth = clientWidth;
        this.lastClientHeight = clientHeight;
      }
    }
    if (!this.lastTimestamp) this.lastTimestamp = timestamp
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05) // seconds, clamp to avoid big jumps
    this.lastTimestamp = timestamp
    if (this.isPlaying) {
      if (!this.isDragging) {
        this.updateBall(dt)
      }
      // Decrement score message timer only when playing
      if (this.scoreMessageTimer > 0) {
        this.scoreMessageTimer -= dt
        if (this.scoreMessageTimer < 0) this.scoreMessageTimer = 0
      }
    }
    this.render()
    this.animationFrameId = requestAnimationFrame(this.gameLoop)
  }

  private updateBall(dt: number) {
    // Gravity
    this.ball.vel.y += this.physics.gravity * dt

    // Update positions with velocity
    this.ball.pos.x += this.ball.vel.x * dt
    this.ball.pos.y += this.ball.vel.y * dt

    // Gradually align spin to match movement direction (rolling in air)
    const targetAngularVel = this.ball.vel.x / this.ball.radius
    this.ball.angularVel += (targetAngularVel - this.ball.angularVel) * 0.1

    // Update rotation
    this.ball.angle += this.ball.angularVel * dt
    this.ball.angularVel *= this.ball.spinFriction // slow down spin over time

    // Bounce off ground
    const ballBottom = this.ball.pos.y + this.ball.radius
    if (this.justBouncedFromConstraint) {
      this.justBouncedFromConstraint = false;
    } else if (ballBottom > this.field.groundY) {
      this.ball.pos.y = this.field.groundY - this.ball.radius
      this.ball.vel.y *= -this.field.groundDamping // use custom ground damping
      if (Math.abs(this.ball.vel.y) < 0.1) {
        this.ball.vel.y = 0
      }
      // Reverse and gently dampen spin on ground bounce
      this.ball.angularVel *= -0.95
      // Add tangential spin based on horizontal velocity (simulate friction)
      this.ball.angularVel += this.ball.vel.x * 2
    }

    // If the ball is on the ground and moving horizontally, force rolling spin
    const onGround = this.ball.pos.y + this.ball.radius >= this.field.groundY - 0.0001
    if (onGround && Math.abs(this.ball.vel.x) > 0.001) {
      this.ball.angularVel = this.ball.vel.x / this.ball.radius
    }

    // Basket wall collision (from right side only)
    // Recompute fieldRect and basketRect as in render
    if (!this.canvas || !this.images.basket || !this.images.field) return
    const fieldRect = drawImageContained(
      this.ctx!,
      this.images.field,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
      'cover',
      1,
      0.5,
      0.5,
      this.field.originX,
      this.field.originY,
    )
    const basketAspect = this.images.basket.naturalHeight / this.images.basket.naturalWidth
    const basketRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.basket.relX,
      relY: this.basket.relY,
      relW: this.basket.relW,
      scale: this.basket.scale,
      aspect: basketAspect,
      anchorX: 0,
      anchorY: 1,
    })
    // Ball position in px
    let ballXpx = fieldRect.offsetX + fieldRect.drawW * this.ball.pos.x
    let ballYpx = fieldRect.offsetY + fieldRect.drawH * this.ball.pos.y
    const ballRadiusPx = this.ball.radius * fieldRect.drawW

    // Calculate intersection of field image and visible canvas for bounce boundaries
    const scaleFactor = fieldRect.drawW * this.field.originX
    const leftEdge = Math.max(0, fieldRect.offsetX) + fieldRect.offsetX / scaleFactor
    const rightEdge =
      Math.min(this.canvas.clientWidth, fieldRect.offsetX + fieldRect.drawW) + fieldRect.offsetX / scaleFactor

    // Left edge
    if (ballXpx - ballRadiusPx < leftEdge) {
      const newBallXpx = leftEdge + ballRadiusPx
      this.ball.vel.x *= -this.physics.wallDamping
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0
      this.ball.angularVel *= -0.95
      // Convert back to relative
      this.ball.pos.x = (newBallXpx - fieldRect.offsetX) / fieldRect.drawW
      ballXpx = newBallXpx
    }
    // Right edge
    if (ballXpx + ballRadiusPx > rightEdge) {
      const newBallXpx = rightEdge - ballRadiusPx
      this.ball.vel.x *= -this.physics.wallDamping
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0
      this.ball.angularVel *= -0.95
      // Convert back to relative
      this.ball.pos.x = (newBallXpx - fieldRect.offsetX) / fieldRect.drawW
      ballXpx = newBallXpx
    }

    // Check overlap for all basket constraints (spherical bounce)
    for (const rect of this.basket.rectConstraints) {
      const { xStart, xEnd, yStart, yEnd } = rect.coords
      const rectLeft = basketRect.x + basketRect.w * xStart
      const rectRight = basketRect.x + basketRect.w * xEnd
      const rectTop = basketRect.y + basketRect.h * yStart
      const rectBottom = basketRect.y + basketRect.h * yEnd
      const rectW = rectRight - rectLeft
      const rectH = rectBottom - rectTop

      // Find closest point on rect to ball center
      const closest = closestPointOnRect(ballXpx, ballYpx, rectLeft, rectTop, rectW, rectH)
      // Vector from closest point to ball center
      const dx = ballXpx - closest.x
      const dy = ballYpx - closest.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < ballRadiusPx) {
        // Collision! Move ball out of rect along normal
        const nx = dx / (dist || 1e-6)
        const ny = dy / (dist || 1e-6)
        // Move ball to just outside the rect
        ballXpx = closest.x + nx * ballRadiusPx
        ballYpx = closest.y + ny * ballRadiusPx
        // Find which side is closest
        const overlapLeft = Math.abs(closest.x - rectLeft)
        const overlapRight = Math.abs(closest.x - rectRight)
        const overlapTop = Math.abs(closest.y - rectTop)
        const overlapBottom = Math.abs(closest.y - rectBottom)
        let damping = rect.damping.left
        let minOverlap = overlapLeft
        if (overlapRight < minOverlap) {
          damping = rect.damping.right
          minOverlap = overlapRight
        }
        if (overlapTop < minOverlap) {
          damping = rect.damping.top
          minOverlap = overlapTop
        }
        if (overlapBottom < minOverlap) {
          damping = rect.damping.bottom
          minOverlap = overlapBottom
        }
        // Reflect velocity (convert to px/sec for accuracy)
        const vpx = this.ball.vel.x * fieldRect.drawW
        const vpy = this.ball.vel.y * fieldRect.drawH
        const vDotN = vpx * nx + vpy * ny
        // Decompose into normal and tangential components
        const vNormX = vDotN * nx
        const vNormY = vDotN * ny
        const vTanX = vpx - vNormX
        const vTanY = vpy - vNormY
        // Reflect and dampen only the normal component using the selected side's damping
        const vNormXNew = -vNormX * damping
        const vNormYNew = -vNormY * damping
        // Combine
        const newVpx = vTanX + vNormXNew
        const newVpy = vTanY + vNormYNew
        // Convert back to rel units
        this.ball.vel.x = newVpx / fieldRect.drawW
        this.ball.vel.y = newVpy / fieldRect.drawH

        // Update ball position in relative units
        this.ball.pos.x = (ballXpx - fieldRect.offsetX) / fieldRect.drawW
        this.ball.pos.y = (ballYpx - fieldRect.offsetY) / fieldRect.drawH

        // Reverse and gently dampen spin
        this.ball.angularVel *= -0.95
        break // Only handle one collision per frame
      }
    }

    // --- GOAL DETECTION ---
    if (!this.canvas || !this.images.basket || !this.images.field) return
    const leftConstraint = this.basket.rectConstraints[1].coords
    const rightConstraint = this.basket.rectConstraints[2].coords
    const rimRect = getRimRect(basketRect, leftConstraint, rightConstraint)
    // Ball center in px
    const ballXpx_goal = fieldRect.offsetX + fieldRect.drawW * this.ball.pos.x
    const ballYpx_goal = fieldRect.offsetY + fieldRect.drawH * this.ball.pos.y
    // Detect if ball is within the rim rectangle
    const inGoalArea =
      ballXpx_goal > rimRect.x &&
      ballXpx_goal < rimRect.x + rimRect.w &&
      ballYpx_goal > rimRect.y &&
      ballYpx_goal < rimRect.y + rimRect.h

    // Only count a goal when entering the area from above and moving down
    if (inGoalArea && !this.wasInGoalArea && this.ball.vel.y > 0) {
      this.scoreMessageTimer = 2.0 // show for 2 seconds
    }
    this.wasInGoalArea = inGoalArea
  }

  private preventGesture = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }

  private setBallPositionToPointer(e: { clientX: number; clientY: number }) {
    if (!this.canvas || !this.ctx || !this.images.field) return
    const { x, y } = getPointerRelativeCoords(e, this.canvas)
    const pointerX = x * this.canvas.clientWidth
    const pointerY = y * this.canvas.clientHeight
    // Calculate fieldRect as in render
    const logicalWidth = this.canvas.clientWidth
    const logicalHeight = this.canvas.clientHeight
    const fieldRect = drawImageContained(
      this.ctx,
      this.images.field,
      logicalWidth,
      logicalHeight,
      'cover',
      1,
      0.5,
      0.5,
      this.field.originX,
      this.field.originY,
    )
    this.ball.pos.x = clamp((pointerX - fieldRect.offsetX) / fieldRect.drawW, 0, 1)
    this.ball.pos.y = clamp((pointerY - fieldRect.offsetY) / fieldRect.drawH, 0, 1)
    // Add to pointer history
    const now = performance.now()
    this.pointerHistory.push({ x: pointerX, y: pointerY, time: now })
    // Keep only the last 15 samples or last 200ms
    while (
      this.pointerHistory.length > 15 ||
      (this.pointerHistory.length > 1 && now - this.pointerHistory[0].time > 200)
    ) {
      this.pointerHistory.shift()
    }
  }

  public resize(width: number, height: number) {
    if (!this.canvas || !this.ctx) return
    this.canvas.width = width * this.dpr
    this.canvas.height = height * this.dpr
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.scale(this.dpr, this.dpr)
    this.updateMaxThrowSpeed();
  }

  private updateMaxThrowSpeed() {
    if (!this.canvas) return;
    this.ball.maxThrowSpeed = this.canvas.clientWidth < 786 ? 2.3 : 2.0;
  }
}
