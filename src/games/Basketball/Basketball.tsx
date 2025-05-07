import React, { useRef, useEffect, useState } from 'react'
import { GameProps } from '../../types'
import { BasketballGame } from './game'

function useBasketballGame(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  { width, height, isPlaying }: { width: number; height: number; isPlaying?: boolean },
) {
  const gameRef = useRef<BasketballGame | null>(null)

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
    // On width/height change, just resize
    if (gameRef.current && canvasRef.current) {
      gameRef.current.resize(width, height)
    }
  }, [width, height, canvasRef])

  useEffect(() => {
    if (isPlaying) {
      gameRef.current?.play()
    } else {
      gameRef.current?.pause()
    }
  }, [isPlaying])
}

export const Basketball: React.FC<GameProps> = ({ isPlaying = true }) => {
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  useBasketballGame(canvasRef, { width: dimensions.width, height: dimensions.height, isPlaying })

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
}
