import { useState } from 'react'
import MapView from './components/MapView'
import AiChatPane from './components/AiChatPane'
import DirectionsPanel from './components/DirectionsPanel'
import ProfilePanel from './components/ProfilePanel'
import { useFavorites } from './hooks/useFavorites'
import { useIsMobile } from './hooks/useIsMobile'
import { AiChatProvider } from './lib/aiChat'
import { type AiPin, type DirectionsResult } from './lib/api'
import type { ShellMode } from './lib/shell'

// This app is the PRODUCT. Plan advertising, pricing and Stripe checkout all
// live on the landing site (landing/src/pages/Pricing.jsx) — the in-app pricing
// screen was removed so there is exactly one place that sells, and one price to
// keep correct. Anything that needs to upsell links out to `${LANDING_URL}/pricing`.
//
// The shell is deliberately thin: the map is the product, so it owns the whole
// viewport and its own chrome (MapTopBar, floating panels). App holds two things
// the map does not own — the shell mode, and the overlays that sit *above* the
// map on desktop.
//
// `mode` lives here rather than in MapView because on a phone it is not a map
// concern at all: it says which of the four things the app is doing (see
// lib/shell.ts), and the bottom nav swaps the map sheet's contents accordingly.
// Desktop has room for real overlays, so it renders the same bodies in floating
// panels — but off the same single piece of state, so the two can never
// disagree about what is open.
function App() {
  const [mode, setMode] = useState<ShellMode>('explore')
  const [aiPins, setAiPins] = useState<AiPin[]>([])
  // Directions is a task, not a place — it can sit on top of any mode, so it
  // stays its own flag rather than joining the union.
  const [dirOpen, setDirOpen] = useState(false)
  const [route, setRoute] = useState<DirectionsResult | null>(null)
  const isMobile = useIsMobile()

  // Lifted out of the panels so the heart on a result card and the Saved list
  // are the same set — otherwise hearting a place would not show up in Saved
  // until a reload.
  const favorites = useFavorites()

  /**
   * The only way `mode` changes.
   *
   * Leaving Ask AI clears its pins here rather than in an effect downstream: the
   * marker effect in MapView bails out entirely while `aiPins` is non-empty, so a
   * leftover set suppresses every category marker for the rest of the session —
   * tap Beaches, get an empty map. Doing it at the one place the mode actually
   * changes makes that impossible to miss, and it is a consequence of the action
   * rather than something to be synchronised after the fact.
   */
  const changeMode = (next: ShellMode) => {
    // Read `mode` from the closure rather than nesting this in a setMode updater
    // — updaters must be pure, and StrictMode calls them twice.
    if (mode === 'ai' && next !== 'ai') setAiPins([])
    setMode(next)
  }

  const toggleMode = (m: ShellMode) => changeMode(mode === m ? 'explore' : m)

  return (
    <div className="h-app w-screen overflow-hidden bg-background text-foreground">
      <main className="relative h-full">
        <AiChatProvider onPins={setAiPins}>
          <MapView
            mode={mode}
            onModeChange={changeMode}
            favorites={favorites}
            aiPins={aiPins}
            route={route}
            onRoute={setRoute}
            onAskAi={() => {
              setDirOpen(false)
              toggleMode('ai')
            }}
            onDirections={() => setDirOpen((v) => !v)}
            dirOpen={dirOpen}
            onSaved={() => toggleMode('saved')}
          />

          {/* Desktop overlays. On mobile these render as sheet content instead
              — see MapView's `sheetBody`. Rendering both would mean two mounted
              copies of the same panel fighting over focus, and on a phone the
              second one would be a nested vaul drawer.
              Saved is not here: it needs to select a place on the map, so
              MapView owns it at both widths. */}
          {!isMobile && mode === 'ai' && <AiChatPane onClose={() => changeMode('explore')} />}
          {!isMobile && mode === 'profile' && <ProfilePanel onClose={() => changeMode('explore')} />}

          {dirOpen && (
            <DirectionsPanel
              onClose={() => {
                setDirOpen(false)
                setRoute(null)
              }}
              onRoute={setRoute}
            />
          )}
        </AiChatProvider>
      </main>
    </div>
  )
}

export default App
