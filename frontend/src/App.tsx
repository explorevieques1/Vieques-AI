import { useState } from 'react'
import MapView from './components/MapView'
import AiChatPane from './components/AiChatPane'
import DirectionsPanel from './components/DirectionsPanel'
import ProfilePanel from './components/ProfilePanel'
import { type AiPin, type DirectionsResult } from './lib/api'

// This app is the PRODUCT. Plan advertising, pricing and Stripe checkout all
// live on the landing site (landing/src/pages/Pricing.jsx) — the in-app pricing
// screen was removed so there is exactly one place that sells, and one price to
// keep correct. Anything that needs to upsell links out to `${LANDING_URL}/pricing`.
//
// The shell is deliberately thin: the map is the product, so it owns the whole
// viewport and its own chrome (MapTopBar, floating panels). App only holds the
// overlays that sit *above* the map — chat, directions, profile.
function App() {
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPins, setAiPins] = useState<AiPin[]>([])
  const [dirOpen, setDirOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [route, setRoute] = useState<DirectionsResult | null>(null)

  return (
    <div className="h-app w-screen overflow-hidden bg-background text-foreground">
      <main className="relative h-full">
        <MapView
          aiPins={aiPins}
          route={route}
          onRoute={setRoute}
          onAskAi={() => {
            setDirOpen(false)
            setAiOpen((v) => !v)
          }}
          aiOpen={aiOpen}
          onDirections={() => {
            setAiOpen(false)
            setDirOpen((v) => !v)
          }}
          dirOpen={dirOpen}
          onProfile={() => setProfileOpen((v) => !v)}
          profileOpen={profileOpen}
        />
        {aiOpen && <AiChatPane onClose={() => setAiOpen(false)} onPins={setAiPins} />}
        {dirOpen && (
          <DirectionsPanel
            onClose={() => {
              setDirOpen(false)
              setRoute(null)
            }}
            onRoute={setRoute}
          />
        )}
        {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
      </main>
    </div>
  )
}

export default App
