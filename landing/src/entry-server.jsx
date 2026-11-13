// Build-time entry for pre-rendering the Island guide (scripts/prerender.mjs).
// Never shipped to the browser.
//
// Renders the real <App/> — not just the guide routes — so the HTML has the
// exact tree the browser will hydrate (App's <Suspense> boundary included).
// A tree that differs by even one wrapper makes React discard the HTML and
// re-render, which defeats the point.
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'

export { guidePaths, pageMeta, jsonLdString, SITE } from './lib/guide.js'

export function render(url) {
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  )
}
