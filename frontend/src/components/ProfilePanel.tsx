// ============================================================================
//  ProfilePanel — who you are, what you bought, what it gets you
// ============================================================================
//
//  The map app has no router (App.tsx drives everything off local state), so
//  this is an overlay panel rather than a route — same idiom as AiChatPane and
//  DirectionsPanel.
//
//  Account management and billing live on the landing app, so anything that
//  CHANGES a plan links out. This panel only reports.
// ============================================================================

import { useEffect, useState } from 'react'
import { getSession, signOut } from '../lib/supabase'
import { LANDING_URL } from '../lib/api'
import {
  useEntitlement, TIER_LABELS, FEATURE_LABELS, FEATURE_MIN_TIER,
} from '../lib/entitlement'

type Props = { onClose: () => void }

/** "in 5 days" / "today" / "expired" for a pass expiry. */
function expiryLabel(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: 'No expiry', urgent: false }
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true }
  const days = Math.floor(ms / 86_400_000)
  if (days === 0) {
    const hours = Math.max(1, Math.floor(ms / 3_600_000))
    return { text: `${hours} hour${hours === 1 ? '' : 's'} left`, urgent: true }
  }
  return { text: `${days} day${days === 1 ? '' : 's'} left`, urgent: days <= 1 }
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function ProfilePanel({ onClose }: Props) {
  const { tier, hasAccess, credits, deviceLimit, features, plans, refresh } = useEntitlement()
  const [email, setEmail] = useState<string | null>(null)
  const [memberSince, setMemberSince] = useState<string | null>(null)

  useEffect(() => {
    getSession().then(({ data }) => {
      setEmail(data?.session?.user?.email ?? null)
      const created = data?.session?.user?.created_at
      setMemberSince(created ? fmtDate(created) : null)
    })
    // Entitlement may be stale if they bought something in another tab.
    void refresh()
  }, [refresh])

  // Close on Escape, like the other overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const primary = plans[0] ?? null
  const expiry = expiryLabel(primary?.expires_at ?? null)
  const included = FEATURE_LABELS.filter(([slug]) => features.includes(slug))
  const missing = FEATURE_LABELS.filter(([slug]) => !features.includes(slug))
  const initial = (email?.[0] ?? '?').toUpperCase()

  return (
    <>
      {/* Click-off backdrop */}
      <div
        className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-label="Your profile"
        className="absolute top-0 right-0 h-full w-full sm:w-[26rem] z-40 flex flex-col
                   bg-slate-900 border-l border-slate-700 shadow-2xl pad-safe-bottom"
      >
        {/* ---- Header ---- */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cyan-500 text-lg font-bold text-slate-900">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">
                {email ?? 'Signed in'}
              </p>
              {memberSince && (
                <p className="text-xs text-slate-500">Member since {memberSince}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 px-2 text-xl leading-none text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ---- Current plan ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Your plan
            </h3>
            <div
              className={`rounded-xl border p-4 ${
                hasAccess
                  ? 'border-cyan-500/30 bg-cyan-500/10'
                  : 'border-slate-700 bg-slate-800/60'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-bold text-slate-100">
                  {TIER_LABELS[tier] ?? tier}
                </span>
                {primary && (
                  <span
                    className={`text-xs font-semibold ${
                      expiry.urgent ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    {expiry.text}
                  </span>
                )}
              </div>
              {!hasAccess && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  You're on the free preview — the map and a taste of the guide.
                </p>
              )}
              {primary?.expires_at && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Access through {fmtDate(primary.expires_at)}
                </p>
              )}
            </div>
          </section>

          {/* ---- At a glance ---- */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
              <div className="text-2xl font-bold text-slate-100">{credits}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                Ask AI message{credits === 1 ? '' : 's'} left
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3.5">
              <div className="text-2xl font-bold text-slate-100">{deviceLimit}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                Device{deviceLimit === 1 ? '' : 's'} included
              </div>
            </div>
          </section>

          {/* ---- Purchase history (active passes only) ---- */}
          {plans.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Active passes
              </h3>
              <ul className="space-y-1.5">
                {plans.map((p, i) => (
                  <li
                    key={`${p.plan}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2"
                  >
                    <span className="text-sm text-slate-200">
                      {TIER_LABELS[p.plan] ?? p.plan}
                    </span>
                    <span className="text-xs text-slate-500">
                      {p.expires_at ? expiryLabel(p.expires_at).text : 'Ongoing'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---- What's included ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              What you have
            </h3>
            <ul className="space-y-1">
              {included.map(([slug, label]) => (
                <li key={slug} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="mt-0.5 shrink-0 font-bold text-cyan-400">✓</span>
                  {label}
                </li>
              ))}
              {included.length === 0 && (
                <li className="text-sm text-slate-500">Map browsing and search.</li>
              )}
            </ul>
          </section>

          {/* ---- What's missing. Shown, not hidden — same reasoning as
                  UpsellOverlay: an invisible feature never gets bought. ---- */}
          {missing.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Unlock with an upgrade
              </h3>
              <ul className="space-y-1">
                {missing.map(([slug, label]) => (
                  <li
                    key={slug}
                    className="flex items-start justify-between gap-3 text-sm text-slate-500"
                  >
                    <span className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">·</span>
                      {label}
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] font-semibold text-slate-600">
                      {TIER_LABELS[FEATURE_MIN_TIER[slug]] ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ---- Actions. Everything that changes a plan lives on the landing. ---- */}
        <div className="space-y-2 border-t border-slate-800 p-4">
          <a
            href={`${LANDING_URL}/pricing`}
            className="block rounded-lg bg-cyan-500 px-4 py-2.5 text-center text-sm font-bold text-slate-900 hover:bg-cyan-400"
          >
            {hasAccess ? 'Change plan' : 'See plans'}
          </a>
          <div className="flex gap-2">
            <a
              href={`${LANDING_URL}/account`}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-center text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Account
            </a>
            <button
              onClick={async () => {
                await signOut()
                // Land on the marketing site rather than a dead app shell —
                // AccessGate would bounce them there anyway.
                window.location.href = LANDING_URL
              }}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
