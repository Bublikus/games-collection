export abstract class GameBase {
  /**
   * Called once to initialize the game (load assets, set up state, etc.)
   */
  abstract init(...args: any[]): void | Promise<void>

  /**
   * Called to start or resume the game loop
   */
  abstract start(): void

  /**
   * Called to play the game
   */
  abstract play(): void

  /**
   * Called to pause the game loop
   */
  abstract pause(): void

  /**
   * Called to reset the game to its initial state
   */
  abstract reset(): void

  /**
   * Called to clean up resources when the game is removed
   */
  abstract destroy(): void

  /**
   * Utility: Load an image and return a Promise<HTMLImageElement>
   */
  protected loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve(img)
      img.onerror = (err) => reject(err)
      img.src = src
    })
  }

  /**
   * Utility: Load multiple images by name, returns a Promise of a name-to-image map
   */
  protected loadImages<T extends Record<string, string>>(sources: T): Promise<{ [K in keyof T]: HTMLImageElement }> {
    const entries = Object.entries(sources) as [keyof T, string][]
    return Promise.all(
      entries.map(([name, src]) => this.loadImage(src).then((img) => [name, img] as [keyof T, HTMLImageElement])),
    ).then((pairs) => Object.fromEntries(pairs) as { [K in keyof T]: HTMLImageElement })
  }

  /**
   * Utility: Calculate contain or cover size and offset for drawing an image in a rect
   * @param mode 'contain' | 'cover'
   * @returns { drawW, drawH, offsetX, offsetY, scale }
   */
  protected calcImageRect(
    imgW: number,
    imgH: number,
    rectW: number,
    rectH: number,
    mode: 'contain' | 'cover' = 'contain',
  ) {
    const scale = mode === 'cover' ? Math.max(rectW / imgW, rectH / imgH) : Math.min(rectW / imgW, rectH / imgH)
    const drawW = imgW * scale
    const drawH = imgH * scale
    const offsetX = (rectW - drawW) / 2
    const offsetY = (rectH - drawH) / 2
    return { drawW, drawH, offsetX, offsetY, scale }
  }
}
