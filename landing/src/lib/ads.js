// ============================================================================
//  ads.js — Google Ads conversion measurement (and nothing else)
// ============================================================================
//  Loads Google's tag so an ad click (?gclid=…) can be matched to a purchase,
//  and reports that purchase from /success. Deliberately narrow:
//
//   • Measurement only. allow_ad_personalization_signals:false + restricted
//     data processing — Google builds no remarketing audiences from our
//     visitors and acts as our service provider (CCPA). The privacy policy
//     (pages/Legal.jsx) promises exactly this; change one, change the other.
//   • EEA / UK / Switzerland: consent defaults to DENIED, so the tag sends
//     cookieless pings only. That is why there is still no cookie banner.
//   • Production only. vite dev and previews never load it.
//
//  The tag must be on every page, not just /success: Google reads the gclid
//  on the page the ad opened (usually a guide page) and keeps it in a
//  first-party cookie until the purchase.
// ============================================================================

export const ADS_ID = 'AW-18579379834'
const PURCHASE_LABEL = 'BEmuCM6F47kdEPqsq5tF'
const FALLBACK_VALUE = 13.99 // matches the default set in Google Ads

// EEA + UK + CH, as ISO 3166-1 codes (Consent Mode region list).
const CONSENT_REQUIRED = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
]

const enabled = () =>
  import.meta.env.PROD && typeof window !== 'undefined' && /(^|\.)explorevieques\.org$/.test(window.location.hostname)

function gtag() {
  window.dataLayer = window.dataLayer || []
  // gtag.js reads the `arguments` object itself, not an array — keep this shape.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

let loaded = false

// Supabase email links (/reset-password, /welcome) arrive with live session
// tokens in the URL hash. Never start a third-party script on such a page —
// it could read location before supabase-js strips the hash. The gclid was
// already stored on the page the ad opened, so nothing is lost by skipping.
const hasAuthTokens = () => /(access_token|refresh_token|type=recovery)/.test(window.location.hash)

export function loadGoogleTag() {
  if (loaded || !enabled() || hasAuthTokens()) return
  loaded = true
  try {
    // Consent defaults must be queued BEFORE config.
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'denied', region: CONSENT_REQUIRED,
    })
    gtag('consent', 'default', {
      ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
    gtag('js', new Date())
    gtag('config', ADS_ID, {
      allow_ad_personalization_signals: false,
      restricted_data_processing: true,
      // Belt and braces with hasAuthTokens(): never report a #fragment.
      page_location: window.location.origin + window.location.pathname + window.location.search,
    })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`
    document.head.appendChild(s)
  } catch {
    // Blocked by an extension or storage error: the site works without it.
  }
}

/**
 * Report one completed purchase. Resolves once Google has the hit (or after
 * ~2.5s, whatever happens — an ad blocker must never strand the buyer), so
 * /success can hold its redirect to the map until then.
 *
 * `transactionId` is the Stripe Checkout session id: Google drops repeats of
 * the same id, so retrying is safe. The sessionStorage mark is written only
 * after a confirmed send, so a lost hit is retried on the next visit.
 *
 * @param {{ transactionId: string, valueCents?: number|null }} p
 * @returns {Promise<void>}
 */
export function trackPurchase({ transactionId, valueCents }) {
  if (!loaded || !transactionId) return Promise.resolve()
  const key = `ev_conv_${transactionId}`
  try { if (sessionStorage.getItem(key)) return Promise.resolve() } catch { /* storage blocked */ }

  return new Promise((resolve) => {
    let done = false
    const finish = (sent) => {
      if (done) return
      done = true
      if (sent) { try { sessionStorage.setItem(key, '1') } catch { /* fine */ } }
      resolve()
    }
    setTimeout(() => finish(false), 2500) // gtag.js blocked or never loaded
    gtag('event', 'conversion', {
      send_to: `${ADS_ID}/${PURCHASE_LABEL}`,
      // 0 is a real value (a 100%-off checkout); only a missing amount falls back.
      value: Number.isFinite(valueCents) && valueCents >= 0 ? valueCents / 100 : FALLBACK_VALUE,
      currency: 'USD',
      transaction_id: transactionId,
      event_callback: () => finish(true),
      event_timeout: 2000,
    })
  })
}
