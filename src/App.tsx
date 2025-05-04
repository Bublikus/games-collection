import React, { useState, useEffect, Suspense, lazy } from 'react'
import { GameProps } from './types';
import './App.css'

// Type for game metadata
interface GameMeta {
  name: string;
  component: React.LazyExoticComponent<(props: GameProps) => React.ReactElement>;
}

function App() {
  const [games, setGames] = useState<GameMeta[]>([])
  const [selectedGame, setSelectedGame] = useState<string>('')
  const [paused, setPaused] = useState(false)

  // Dynamically import all games from the games folder
  useEffect(() => {
    // @ts-ignore
    const modules = import.meta.glob('./games/*/index.ts')
    const gameEntries: GameMeta[] = Object.entries(modules).map(([path, loader]) => {
      // Extract game name from folder name
      const match = path.match(/\.\/games\/([^/]+)\//)
      const name = match ? match[1] : path
      return {
        name,
        component: lazy(loader as () => Promise<{ default: (props: GameProps) => React.ReactElement }>),
      }
    })
    setGames(gameEntries)
    if (gameEntries.length > 0) {
      setSelectedGame(gameEntries[0].name)
    }
  }, [])

  const SelectedGameComponent = games.find(g => g.name === selectedGame)?.component

  return (
    <div className="App">
      <div className="game-select-container">
        <label htmlFor="game-select" className="game-select-label">Choose a game: </label>
        <select
          id="game-select"
          value={selectedGame}
          onChange={e => setSelectedGame(e.target.value)}
        >
          {games.map(game => (
            <option key={game.name} value={game.name}>{game.name}</option>
          ))}
        </select>
      </div>
      <button
        className="play-pause-btn"
        onClick={() => setPaused(p => !p)}
        aria-label={paused ? 'Play' : 'Pause'}
      >
        {paused ? '▶️' : '⏸️'}
      </button>
      <div className="game-container">
        {SelectedGameComponent ? (
          <Suspense fallback={<div>Loading game...</div>}>
            <SelectedGameComponent isPlaying={!paused} />
          </Suspense>
        ) : (
          <div>No game selected</div>
        )}
      </div>
    </div>
  )
}

export default App
