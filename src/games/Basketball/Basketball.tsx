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
    const game = new BasketballGame()
    gameRef.current = game
    canvasRef.current.width = width
    canvasRef.current.height = height
    game.init(canvasRef.current).then(() => game.start())
    return () => game.destroy()
  }, [canvasRef, width, height])

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
