import { GameBase } from '../../GameBase'
import fieldImgUrl from './assets/field.png'
import ballImgUrl from './assets/ball.png'
import {
  drawImageContained,
  getImageDrawRect,
  clamp,
  getPointerRelativeCoords,
  calcVelocity,
  lerp,
  easeOutQuad,
} from '../Basketball/helpers'

export class FootballGame extends GameBase {
  private DEBUG = false

  private ball = {
    pos: { x: 0.75, y: 0.5 },
    vel: { x: 0, y: 0 },
    radius: 0.03,
    minThrowSpeed: 0.1,
    maxThrowSpeed: 2.3, // will be set dynamically
    throwPower: 0.005,
    angle: 0, // current rotation angle in radians
    angularVel: 0, // angular velocity in radians/sec
    spinFriction: 0.995, // gentler friction for spin
  }

  private goal = {
    relX: 0.175,
    relY: 0.55,
    relW: 0.05,
    relH: 0.22,
    scale: 1.0,
    // Absolute constraints for the goal area (left side)
    rect: { xStart: 0.05, xEnd: 0.17, yStart: 0.34, yEnd: 0.66 },
  }

  private field = {
    groundY: 0.7,
    originX: 0.25,
    originY: 0.5,
    groundDamping: 0.7,
  }

  private physics = {
    gravity: 9.8 / 2.5,
    bounceDamping: 0.7,
    wallDamping: 0.7,
  }

  private images: {
    field: HTMLImageElement | null
    ball: HTMLImageElement | null
  } = {
    field: null,
    ball: null,
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
  private justBouncedFromConstraint = false

  // Net line control variables
  private netLineTopRatio = -1 // 1.0 = top-right corner of goal
  private netLineBottomRatio = -2 // 0.5 = halfway along goal width at ground
  private netLineAngle = null // Optionally, allow angle override in radians (null = use ratios)

  private constraints = {
    net: {
      getSlantedLine: (goalRect: { x: number; y: number; w: number; h: number }) => {
        if (this.netLineAngle !== null) {
          const angle = this.netLineAngle
          const x1 = goalRect.x + goalRect.w * this.netLineTopRatio
          const y1 = goalRect.y
          const y2 = goalRect.y + goalRect.h
          const x2 = x1 - goalRect.h / Math.tan(angle)
          return { x1, y1, x2, y2 }
        } else {
          return {
            x1: goalRect.x + goalRect.w * this.netLineTopRatio,
            y1: goalRect.y,
            x2: goalRect.x + goalRect.w * this.netLineBottomRatio,
            y2: goalRect.y + goalRect.h,
          }
        }
      },
      damping: 0.02,
    },
    topBar: {
      // Returns a rectangle for the top bar (goalpost)
      getRect: (goalRect: { x: number; y: number; w: number; h: number }) => {
        const barThickness = Math.max(goalRect.h * 0.075, 8) // 9% of goal height or at least 8px
        const netLine = this.constraints.net.getSlantedLine(goalRect)
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
      },
      damping: 0.6,
    },
  }

  async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    if (this.ctx) {
      this.canvas.width = this.canvas.clientWidth * this.dpr
      this.canvas.height = this.canvas.clientHeight * this.dpr
      this.ctx.setTransform(1, 0, 0, 1, 0, 0)
      this.ctx.scale(this.dpr, this.dpr)
    }
    this.lastClientWidth = this.canvas ? this.canvas.clientWidth : null
    this.lastClientHeight = this.canvas ? this.canvas.clientHeight : null
    this.updateMaxThrowSpeed()
    const images = await this.loadImages({
      field: fieldImgUrl,
      ball: ballImgUrl,
    })
    this.images.field = images.field
    this.images.ball = images.ball
    // Set ball to 75% of screen width and 50% of screen height in field coordinates
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
  }

  private render() {
    if (!this.ctx || !this.images.field || !this.images.ball || !this.canvas) return
    const clientWidth = this.canvas.clientWidth
    const clientHeight = this.canvas.clientHeight
    if (clientWidth !== this.lastClientWidth || clientHeight !== this.lastClientHeight) {
      this.resize(clientWidth, clientHeight)
      this.lastClientWidth = clientWidth
      this.lastClientHeight = clientHeight
    }
    const logicalWidth = this.canvas.clientWidth
    const logicalHeight = this.canvas.clientHeight
    this.ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    // Draw field
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

    if (this.DEBUG) {
      // Draw goal (left side, as a rectangle)
      const goalRect = getImageDrawRect({
        containerRect: fieldRect,
        relX: this.goal.relX,
        relY: this.goal.relY,
        relW: this.goal.relW,
        scale: this.goal.scale,
        aspect: this.goal.relH / this.goal.relW,
        anchorX: 0,
        anchorY: 0.5,
      })
      this.ctx.save()
      this.ctx.strokeStyle = '#fff'
      this.ctx.lineWidth = 6
      this.ctx.strokeRect(goalRect.x, goalRect.y, goalRect.w, goalRect.h)
      // Draw the slanted net line
      const netLine = this.constraints.net.getSlantedLine(goalRect)
      this.ctx.strokeStyle = '#00f'
      this.ctx.lineWidth = 3
      this.ctx.beginPath()
      this.ctx.moveTo(netLine.x1, netLine.y1)
      this.ctx.lineTo(netLine.x2, netLine.y2)
      this.ctx.stroke()
      // Draw the top bar (goalpost)
      const topBar = this.constraints.topBar.getRect(goalRect)
      this.ctx.save()
      this.ctx.translate(topBar.x, topBar.y)
      this.ctx.rotate(topBar.angle)
      this.ctx.fillStyle = '#fff'
      this.ctx.fillRect(0, -topBar.h, topBar.w, topBar.h)
      this.ctx.restore()
      this.ctx.restore()
      // Draw goal debug area
      this.ctx.save()
      this.ctx.strokeStyle = 'rgba(0,255,0,0.8)'
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(goalRect.x, goalRect.y, goalRect.w, goalRect.h)
      this.ctx.restore()
    }

    // Draw ball
    const ballScale = 1.0
    const ballAspect = this.images.ball.naturalHeight / this.images.ball.naturalWidth
    const ballRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.ball.pos.x,
      relY: this.ball.pos.y,
      relW: this.ball.radius * 2,
      scale: ballScale,
      aspect: ballAspect,
      anchorX: 0.5,
      anchorY: 0.5,
    })
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

    // Draw score message if timer is active
    if (this.scoreMessageTimer > 0 && this.ctx) {
      this.ctx.save()
      const msg = 'GOAL!'
      const appearDuration = 0.3
      const totalDuration = 2.0
      const t = clamp((totalDuration - this.scoreMessageTimer) / appearDuration, 0, 1)
      const ease = easeOutQuad(t)
      const baseY = logicalHeight * 0.05
      const startY = baseY + logicalHeight * 0.05
      const y = lerp(startY, baseY, ease)
      let alpha = 1
      if (this.scoreMessageTimer > totalDuration - appearDuration) {
        alpha = t
      } else if (this.scoreMessageTimer < 0.3) {
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
    this.images.ball = null
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
    this.ball.pos.x = clamp((pointerX - fieldRect.offsetX) / fieldRect.drawW, 0, 1)
    this.ball.pos.y = clamp((pointerY - fieldRect.offsetY) / fieldRect.drawH, 0, 1)
    this.ball.vel.x = 0
    this.ball.vel.y = 0
    this.pointerHistory = []
  }

  private throwBall() {
    if (!this.canvas || !this.dragStart) return
    if (this.pointerHistory.length >= 2) {
      const last = this.pointerHistory[this.pointerHistory.length - 1]
      let prev = this.pointerHistory[0]
      for (let i = this.pointerHistory.length - 2; i >= 0; i--) {
        if (last.time - this.pointerHistory[i].time > 50) {
          prev = this.pointerHistory[i]
          break
        }
      }
      const dt = (last.time - prev.time) / 1000
      if (dt > 0) {
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
        const groundY = this.field.groundY
        if (this.ball.pos.y + this.ball.radius > groundY) {
          const below = this.ball.pos.y + this.ball.radius - groundY
          const bounceBoost = below * 5
          this.ball.vel.y += bounceBoost
          this.ball.pos.y = groundY - this.ball.radius
          this.justBouncedFromConstraint = true
        }
      }
    }
    this.dragStart = null
    this.pointerHistory = []
  }

  private gameLoop = (timestamp: number) => {
    if (this.canvas) {
      const clientWidth = this.canvas.clientWidth
      const clientHeight = this.canvas.clientHeight
      if (clientWidth !== this.lastClientWidth || clientHeight !== this.lastClientHeight) {
        this.resize(clientWidth, clientHeight)
        this.lastClientWidth = clientWidth
        this.lastClientHeight = clientHeight
      }
    }
    if (!this.lastTimestamp) this.lastTimestamp = timestamp
    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05)
    this.lastTimestamp = timestamp
    if (this.isPlaying) {
      if (!this.isDragging) {
        this.updateBall(dt)
      }
      if (this.scoreMessageTimer > 0) {
        this.scoreMessageTimer -= dt
        if (this.scoreMessageTimer < 0) this.scoreMessageTimer = 0
      }
    }
    this.render()
    this.animationFrameId = requestAnimationFrame(this.gameLoop)
  }

  private updateBall(dt: number) {
    this.ball.vel.y += this.physics.gravity * dt
    this.ball.pos.x += this.ball.vel.x * dt
    this.ball.pos.y += this.ball.vel.y * dt
    const targetAngularVel = this.ball.vel.x / this.ball.radius
    this.ball.angularVel += (targetAngularVel - this.ball.angularVel) * 0.1
    this.ball.angle += this.ball.angularVel * dt
    this.ball.angularVel *= this.ball.spinFriction
    const ballBottom = this.ball.pos.y + this.ball.radius
    if (this.justBouncedFromConstraint) {
      this.justBouncedFromConstraint = false
    } else if (ballBottom > this.field.groundY) {
      this.ball.pos.y = this.field.groundY - this.ball.radius
      this.ball.vel.y *= -this.field.groundDamping
      if (Math.abs(this.ball.vel.y) < 0.1) {
        this.ball.vel.y = 0
      }
      this.ball.angularVel *= -0.95
      this.ball.angularVel += this.ball.vel.x * 2
    }
    const onGround = this.ball.pos.y + this.ball.radius >= this.field.groundY - 0.0001
    if (onGround && Math.abs(this.ball.vel.x) > 0.001) {
      this.ball.angularVel = this.ball.vel.x / this.ball.radius
    }
    if (!this.canvas || !this.images.field) return
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
    let ballXpx = fieldRect.offsetX + fieldRect.drawW * this.ball.pos.x
    let ballYpx = fieldRect.offsetY + fieldRect.drawH * this.ball.pos.y
    const ballRadiusPx = this.ball.radius * fieldRect.drawW
    const leftEdge = Math.max(0, fieldRect.offsetX)
    const rightEdge = Math.min(this.canvas.clientWidth, fieldRect.offsetX + fieldRect.drawW)
    if (ballXpx - ballRadiusPx < leftEdge) {
      const newBallXpx = leftEdge + ballRadiusPx
      this.ball.vel.x *= -this.physics.wallDamping
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0
      this.ball.angularVel *= -0.95
      this.ball.pos.x = (newBallXpx - fieldRect.offsetX) / fieldRect.drawW
      ballXpx = newBallXpx
    }
    if (ballXpx + ballRadiusPx > rightEdge) {
      const newBallXpx = rightEdge - ballRadiusPx
      this.ball.vel.x *= -this.physics.wallDamping
      if (Math.abs(this.ball.vel.x) < 0.1) this.ball.vel.x = 0
      this.ball.angularVel *= -0.95
      this.ball.pos.x = (newBallXpx - fieldRect.offsetX) / fieldRect.drawW
      ballXpx = newBallXpx
    }
    // --- GOAL DETECTION ---
    const goalRect = getImageDrawRect({
      containerRect: fieldRect,
      relX: this.goal.relX,
      relY: this.goal.relY,
      relW: this.goal.relW,
      scale: this.goal.scale,
      aspect: this.goal.relH / this.goal.relW,
      anchorX: 0,
      anchorY: 0.5,
    })
    // Net constraint collision (slanted back net)
    const netLine = this.constraints.net.getSlantedLine(goalRect)
    // Ball center
    const bx = ballXpx
    const by = ballYpx
    // Line: (x1, y1) to (x2, y2)
    const { x1, y1, x2, y2 } = netLine
    // Project ball center onto the line segment
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSq = dx * dx + dy * dy
    let t = ((bx - x1) * dx + (by - y1) * dy) / (lengthSq || 1e-6)
    t = Math.max(0, Math.min(1, t))
    const closestX = x1 + t * dx
    const closestY = y1 + t * dy
    const dist = Math.sqrt((bx - closestX) ** 2 + (by - closestY) ** 2)
    if (dist < ballRadiusPx) {
      // Collision! Reflect ball velocity over the line normal (works for both sides)
      // Normal vector (perpendicular to line)
      let nx = dy / Math.sqrt(dx * dx + dy * dy)
      let ny = -dx / Math.sqrt(dx * dx + dy * dy)
      // Ensure normal always points away from the ball's center (for both sides)
      const dot = (bx - closestX) * nx + (by - closestY) * ny
      if (dot < 0) {
        nx = -nx
        ny = -ny
      }
      // Move ball out of the net
      ballXpx = closestX + nx * ballRadiusPx
      ballYpx = closestY + ny * ballRadiusPx
      // Velocity in px/sec
      const vpx = this.ball.vel.x * fieldRect.drawW
      const vpy = this.ball.vel.y * fieldRect.drawH
      const vDotN = vpx * nx + vpy * ny
      // Reflect and dampen
      const vpxNew = vpx - 2 * vDotN * nx
      const vpyNew = vpy - 2 * vDotN * ny
      this.ball.vel.x = (vpxNew * this.constraints.net.damping) / fieldRect.drawW
      this.ball.vel.y = (vpyNew * this.constraints.net.damping) / fieldRect.drawH
      // Update ball position in rel units
      this.ball.pos.x = (ballXpx - fieldRect.offsetX) / fieldRect.drawW
      this.ball.pos.y = (ballYpx - fieldRect.offsetY) / fieldRect.drawH
      // Reverse and gently dampen spin
      this.ball.angularVel *= -0.95
    }
    // Top bar (goalpost) collision (true rectangle collision)
    const topBarRect = this.constraints.topBar.getRect(goalRect)
    const cosA = Math.cos(-topBarRect.angle)
    const sinA = Math.sin(-topBarRect.angle)
    // Transform ball center into bar's local coordinates
    const relX = (ballXpx - topBarRect.x) * cosA - (ballYpx - topBarRect.y) * sinA
    const relY = (ballXpx - topBarRect.x) * sinA + (ballYpx - topBarRect.y) * cosA
    // Rectangle is from (0, -topBarRect.h) to (topBarRect.w, 0)
    // Find closest point on rectangle to ball center
    let closestXBar = Math.max(0, Math.min(topBarRect.w, relX))
    let closestYBar = Math.max(-topBarRect.h, Math.min(0, relY))
    // Distance from ball center to closest point
    const distSqBar = (relX - closestXBar) ** 2 + (relY - closestYBar) ** 2
    if (distSqBar < ballRadiusPx * ballRadiusPx) {
      const dist = Math.sqrt(distSqBar) || 1e-6
      // Normal vector (from bar to ball)
      let nx = (relX - closestXBar) / dist
      let ny = (relY - closestYBar) / dist
      // If ball is exactly inside, push out upwards
      if (dist < 1e-5) {
        nx = 0
        ny = -1
      }
      // Move ball out of the bar
      const newRelX = closestXBar + nx * ballRadiusPx
      const newRelY = closestYBar + ny * ballRadiusPx
      // Transform back to global
      ballXpx = topBarRect.x + newRelX * cosA + newRelY * sinA
      ballYpx = topBarRect.y - newRelX * sinA + newRelY * cosA
      // Transform normal to global
      const nxG = nx * cosA + ny * sinA
      const nyG = -nx * sinA + ny * cosA
      // Reflect velocity
      const vpx = this.ball.vel.x * fieldRect.drawW
      const vpy = this.ball.vel.y * fieldRect.drawH
      const vDotN = vpx * nxG + vpy * nyG
      const vpxNew = vpx - 2 * vDotN * nxG
      const vpyNew = vpy - 2 * vDotN * nyG
      this.ball.vel.x = (vpxNew * this.constraints.topBar.damping) / fieldRect.drawW
      this.ball.vel.y = (vpyNew * this.constraints.topBar.damping) / fieldRect.drawH
      // Update ball position in rel units
      this.ball.pos.x = (ballXpx - fieldRect.offsetX) / fieldRect.drawW
      this.ball.pos.y = (ballYpx - fieldRect.offsetY) / fieldRect.drawH
      // Reverse and gently dampen spin
      this.ball.angularVel *= -0.95
    }
    const inGoalArea =
      ballXpx > goalRect.x &&
      ballXpx < goalRect.x + goalRect.w &&
      ballYpx > goalRect.y &&
      ballYpx < goalRect.y + goalRect.h
    if (inGoalArea && !this.wasInGoalArea && this.ball.vel.x < 0) {
      this.scoreMessageTimer = 2.0
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
    const now = performance.now()
    this.pointerHistory.push({ x: pointerX, y: pointerY, time: now })
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
    this.updateMaxThrowSpeed()
  }

  private updateMaxThrowSpeed() {
    if (!this.canvas) return
    this.ball.maxThrowSpeed = this.canvas.clientWidth < 786 ? 2.3 : 2.0
  }
}
