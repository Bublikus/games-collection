import React, { useRef, useEffect, useState } from 'react';
import { BasketballGame } from './game';

function useBasketballGame(canvasRef: React.RefObject<HTMLCanvasElement>, width: number, height: number) {
  const gameRef = useRef<BasketballGame | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new BasketballGame();
    gameRef.current = game;
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    game.init(canvasRef.current);
    return () => {
      game.destroy();
    };
  }, [canvasRef, width, height]);
}

export const Basketball: React.FC = () => {
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  useBasketballGame(canvasRef, dimensions.width, dimensions.height);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      style={{
        display: 'block',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        background: '#222',
        borderRadius: 0,
        zIndex: 0,
      }}
    />
  );
};
