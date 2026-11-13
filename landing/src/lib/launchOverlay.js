// Full-screen "opening the map" screen, shown the instant someone clicks an
// "Open the map" button.
//
// launchMapApp() reads the session and asks the API for the pass before it
// redirects — a second or so of nothing happening, which reads as a dead button.
// This fills that gap with the same pin-drop screen the map app shows while its
// own gate checks (frontend AccessGate), so the two waits feel like one.
//
// Built with plain DOM rather than React: the callers are a lib function and
// several unrelated pages, and none of them own a spot in the tree for it.
// Styles are the .vq-load block in public/styles.css.

const MARKUP = `
  <div class="vq-load__stage" aria-hidden="true">
    <i class="vq-load__ring"></i><i class="vq-load__ring"></i><i class="vq-load__ring"></i>
    <i class="vq-load__dot"></i>
    <svg class="vq-load__pin" viewBox="132 108 248 296" fill="none">
      <path fill="#FF6D04" d="M256 120c-62 0-112 50-112 112 0 78 96 152 108 161a6 6 0 0 0 8 0c12-9 108-83 108-161 0-62-50-112-112-112z"/>
      <circle cx="256" cy="228" r="46" fill="#64DBE8"/>
    </svg>
  </div>
  <p class="vq-load__text">Loading your island guide</p>`

/** Show the overlay. Returns a function that removes it again. */
export function showLaunchOverlay() {
  let el = document.getElementById('vq-launch')
  if (!el) {
    el = document.createElement('div')
    el.id = 'vq-launch'
    el.className = 'vq-load vq-load--fixed'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.innerHTML = MARKUP
    document.body.appendChild(el)
  }

  const hide = () => { el.remove(); window.removeEventListener('pageshow', onShow) }
  // Browser Back from the map app can restore this page from the back/forward
  // cache with the overlay still painted on it. Clear it when that happens.
  function onShow(e) { if (e.persisted) hide() }
  window.addEventListener('pageshow', onShow)
  return hide
}
