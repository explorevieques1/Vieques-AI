// ============================================================================
//  UpsellOverlay — what a locked feature looks like
// ============================================================================
//
//  Deliberately shows the feature as LOCKED rather than hiding it. A hidden
//  feature sells nothing: the user never learns the thing they'd pay for
//  exists. See PRICING.md §4.1 — the free tier is the top of the funnel, not
//  a stripped-down product.
//
//  Checkout lives on the landing app, so this only ever links out.
// ============================================================================

import { LANDING_URL } from '../lib/api'
import { FEATURE_MIN_TIER, TIER_LABELS } from '../lib/entitlement'

type Props = {
  /** Feature slug from FEATURES in backend/payments.js, e.g. 'snorkel_zones'. */
  feature: string
  /** What the user is missing, in their words. "Snorkeling zone maps". */
  title: string
  /** One line on why it's worth having. */
  blurb?: string
  /** Fills its parent instead of sitting inline. */
  overlay?: boolean
}

export default function UpsellOverlay({ feature, title, blurb, overlay = false }: Props) {
  const tierKey = FEATURE_MIN_TIER[feature] ?? 'vacation'
  const tierName = TIER_LABELS[tierKey] ?? 'a paid plan'

  return (
    <div
      className={
        overlay
          ? 'absolute inset-0 z-20 flex items-center justify-center bg-slate-900/85 backdrop-blur-sm p-6'
          : 'rounded-xl border border-slate-700 bg-slate-800/60 p-5'
      }
    >
      <div className="max-w-xs text-center">
        <div
          className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400"
          aria-hidden="true"
        >
          {/* padlock */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>

        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {blurb && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{blurb}</p>}

        <p className="mt-3 text-xs text-slate-500">
          Included with <span className="font-semibold text-cyan-400">{tierName}</span>
        </p>

        <a
          href={`${LANDING_URL}/pricing`}
          className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-cyan-400"
        >
          See plans
        </a>
      </div>
    </div>
  )
}
