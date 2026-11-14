// ============================================================================
//  attribution.js — which ad / link / guide page brought this person in
// ============================================================================
//  Paid traffic lands on a guide page (/bio-bay?utm_source=google&gclid=…),
//  reads, then clicks through to /#pricing → /signup — a full page load that
//  drops the query string. So the first page captures the tags into
//  localStorage, and SignUp copies them into the new user's auth metadata
//  (raw_user_meta_data), where the marketing agent's SQL reads them.
//
//  FIRST touch wins (for ATTRIBUTION_DAYS): the ad that introduced someone
//  gets the credit, even if they come back later by typing the URL. A newer
//  *tagged* visit after that window replaces it.
//
//  First-party only — nothing is sent anywhere until the person signs up.
//  Storage can throw (private mode, blocked site data); every access is
//  wrapped so a failure only means "unattributed", never a broken page.
// ============================================================================

const KEY = 'ev_attr'
const ATTRIBUTION_DAYS = 30
const PARAMS = ['src', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid']

export function captureAttribution() {
  try {
    const q = new URLSearchParams(window.location.search)
    const tags = {}
    for (const p of PARAMS) {
      const v = q.get(p)
      if (v) tags[p] = v.slice(0, 200)
    }
    if (!Object.keys(tags).length) return

    const prev = read()
    const fresh = prev && Date.now() - prev.ts < ATTRIBUTION_DAYS * 864e5
    if (fresh) return

    localStorage.setItem(KEY, JSON.stringify({
      ...tags,
      landing: window.location.pathname, // which guide page the ad/link opened
      ts: Date.now(),
    }))
  } catch { /* unattributed — fine */ }
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}

/** Fields to merge into signUp options.data, or {} if nothing was captured. */
export function getAttribution() {
  const a = read()
  if (!a) return {}
  const { ts, ...rest } = a
  return { ...rest, landed_at: new Date(ts).toISOString().slice(0, 10) }
}
