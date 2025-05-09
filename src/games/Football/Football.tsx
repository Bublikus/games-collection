import React, { useRef, useEffect } from 'react'
import { GameProps } from '../../types'
import { FootballGame } from './game'

function useFootballGame(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  { isPlaying }: { isPlaying?: boolean },
) {
  const gameRef = React.useRef<FootballGame | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (!gameRef.current) {
      const game = new FootballGame()
      gameRef.current = game
      game.init(canvasRef.current).then(() => game.start())
    }
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

export const Football: React.FC<GameProps> = ({ isPlaying = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useFootballGame(canvasRef, { isPlaying })

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
} 