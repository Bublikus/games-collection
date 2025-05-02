import { useState, useEffect, Suspense, lazy } from 'react'
import './App.css'

// Type for game metadata
interface GameMeta {
  name: string;
  component: React.LazyExoticComponent<() => JSX.Element>;
}

function App() {
  const [games, setGames] = useState<GameMeta[]>([])
  const [selectedGame, setSelectedGame] = useState<string>('')

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
        component: lazy(loader as () => Promise<{ default: () => JSX.Element }>),
      }
    })
    setGames(gameEntries)
    if (gameEntries.length > 0) {
      setSelectedGame(gameEntries[0].name)
    }
  }, [])

  const SelectedGameComponent = games.find(g => g.name === selectedGame)?.component

  return (
    <div className="App" style={{ height: '100vh', width: '100vw', margin: 0, padding: 0, position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1000,
          background: 'rgba(255,255,255,0.95)',
          padding: '12px 16px',
          borderBottomRightRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}
      >
        <label htmlFor="game-select" style={{ marginRight: 8 }}>Choose a game: </label>
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
      <div
        className="game-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8f8f8',
        }}
      >
        {SelectedGameComponent ? (
          <Suspense fallback={<div>Loading game...</div>}>
            <SelectedGameComponent />
          </Suspense>
        ) : (
          <div>No game selected</div>
        )}
      </div>
    </div>
  )
}

export default App
