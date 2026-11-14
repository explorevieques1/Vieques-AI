import { Route } from 'react-router-dom'
import IslandGuide from './pages/guide/IslandGuide.jsx'
import BeachesGuide from './pages/guide/BeachesGuide.jsx'
import BeachGuide from './pages/guide/BeachGuide.jsx'
import BioBayGuide from './pages/guide/BioBayGuide.jsx'
import FerryGuide from './pages/guide/FerryGuide.jsx'
import GettingAroundGuide from './pages/guide/GettingAroundGuide.jsx'
import RestaurantsGuide from './pages/guide/RestaurantsGuide.jsx'

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
  <Route key="biobay" path="/bio-bay" element={<BioBayGuide />} />,
  <Route key="ferry" path="/ferry" element={<FerryGuide />} />,
  <Route key="around" path="/getting-around" element={<GettingAroundGuide />} />,
  <Route key="food" path="/restaurants" element={<RestaurantsGuide />} />,
]
