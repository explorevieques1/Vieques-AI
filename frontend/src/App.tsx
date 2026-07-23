import { useState } from 'react'
import MapView from './components/MapView'
import CategoryTabs, { type CategorySlug } from './components/CategoryTabs'
import PricingPage from './components/PricingPage'
import AiChatPane from './components/AiChatPane'
import DirectionsPanel from './components/DirectionsPanel'
import type { AiPin, DirectionsResult } from './lib/api'

type View = 'map' | 'pricing'

function App() {
  const [view, setView] = useState<View>('map')
  const [activeCategory, setActiveCategory] = useState<CategorySlug | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPins, setAiPins] = useState<AiPin[]>([])
  const [dirOpen, setDirOpen] = useState(false)
  const [route, setRoute] = useState<DirectionsResult | null>(null)

  const handleSelectCategory = (slug: CategorySlug) => {
    setActiveCategory(slug)
    setView('map')
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 text-slate-100">
      <header className="bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <h1
            className="text-lg sm:text-xl font-bold tracking-tight shrink-0 cursor-pointer"
            onClick={() => setView('map')}
          >
            Vieques <span className="text-cyan-400">AI</span>
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => {
                setView('map')
                setAiOpen(false)
                setDirOpen(true)
              }}
              className={`px-3 sm:px-4 py-2 text-sm rounded-full transition-colors ${
                dirOpen
                  ? 'bg-cyan-500 text-slate-900 font-medium'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              Directions
            </button>
            <button
              onClick={() => {
                setView('map')
                setDirOpen(false)
                setAiOpen(true)
              }}
              className={`px-3 sm:px-4 py-2 text-sm rounded-full transition-colors ${
                aiOpen
                  ? 'bg-cyan-500 text-slate-900 font-medium'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              Ask AI
            </button>
            <button
              onClick={() => setView('pricing')}
              className={`px-3 sm:px-4 py-2 text-sm rounded-full transition-colors ${
                view === 'pricing'
                  ? 'bg-cyan-500 text-slate-900 font-medium'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              Pricing
            </button>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-2 overflow-x-auto">
          <CategoryTabs
            active={view === 'map' ? activeCategory : null}
            onSelect={handleSelectCategory}
          />
        </div>
      </header>
      <main className="flex-1 min-h-0 relative">
        {view === 'map' ? (
          <MapView
            activeCategory={activeCategory}
            aiPins={aiPins}
            route={route}
            onRoute={setRoute}
            onCloseCategory={() => setActiveCategory(null)}
          />
        ) : (
          <PricingPage />
        )}
        {view === 'map' && aiOpen && (
          <AiChatPane onClose={() => setAiOpen(false)} onPins={setAiPins} />
        )}
        {view === 'map' && dirOpen && (
          <DirectionsPanel
            onClose={() => {
              setDirOpen(false)
              setRoute(null)
            }}
            onRoute={setRoute}
          />
        )}
      </main>
    </div>
  )
}

export default App