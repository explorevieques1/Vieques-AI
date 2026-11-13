import { Route } from 'react-router-dom'
import IslandGuide from './pages/guide/IslandGuide.jsx'
import BeachesGuide from './pages/guide/BeachesGuide.jsx'
import BeachGuide from './pages/guide/BeachGuide.jsx'

// Island guide routes, shared by App.jsx (browser) and entry-server.jsx
// (build-time pre-render) so both render the exact same tree — a hydration
// requirement.
//
// Imported eagerly, NOT lazy(): a lazy route would render its Suspense
// fallback during pre-render and then mismatch on hydration. The pages are
// small; the beach snapshot is ~10 KB.
export const guideRoutes = [
  <Route key="guide" path="/guide" element={<IslandGuide />} />,
  <Route key="beaches" path="/beaches" element={<BeachesGuide />} />,
  <Route key="beach" path="/beaches/:slug" element={<BeachGuide />} />,
]
