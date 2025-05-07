import React, { useRef, useEffect } from 'react'
import { GameProps } from '../../types'
import { BasketballGame } from './game'

function useBasketballGame(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  { isPlaying }: { isPlaying?: boolean },
) {
  const gameRef = React.useRef<BasketballGame | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (!gameRef.current) {
      const game = new BasketballGame()
      gameRef.current = game
      game.init(canvasRef.current).then(() => game.start())
    }
    // No destroy here
    // Only create/destroy on mount/unmount
    return () => {
      gameRef.current?.destroy()
      gameRef.current = null
    }
  }, [canvasRef])

  useEffect(() => {
    if (isPlaying) {
      gameRef.current?.play()
    } else {
      gameRef.current?.pause()
    }
  }, [isPlaying])
}

export const Basketball: React.FC<GameProps> = ({ isPlaying = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useBasketballGame(canvasRef, { isPlaying })

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
}
