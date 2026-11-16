import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { captureAttribution } from './lib/attribution.js'
import { loadGoogleTag } from './lib/ads.js'

// Before anything can navigate away from the landing URL's ?utm_…&gclid=….
captureAttribution()
loadGoogleTag() // production only; see lib/ads.js

const root = document.getElementById('root')
const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Island guide pages arrive pre-rendered (scripts/prerender.mjs), so #root
// already holds their HTML: hydrate it — attach React to the existing markup
// instead of throwing it away and re-drawing. Every other route ships an
// empty #root and renders from scratch as before.
if (root.firstElementChild) ReactDOM.hydrateRoot(root, tree)
else ReactDOM.createRoot(root).render(tree)
