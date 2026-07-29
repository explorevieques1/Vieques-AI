// ============================================================================
//  ProfileBody — who you are, what you bought, what it gets you
// ============================================================================
//
//  The content half of the profile view, with no positioning of its own: a
//  floating aside on desktop (ProfilePanel), the map sheet's content on a phone
//  (see MapView's `sheetBody`).
//
//  Account management and billing live on the landing app, so anything that
//  CHANGES a plan links out. This panel only reports.
//
//  Rethemed off the raw slate/cyan palette it was written in and onto the app's
//  tokens (`.glass`, `text-foreground`, `bg-primary`, `border-white/8`). It was
//  the one panel that did not match the rest of the map chrome, which was
//  survivable as a full-screen overlay and is not once it shares a sheet with
//  the results list.
// ============================================================================

import { useEffect, useState } from 'react'

import { getSession, signOut } from '../lib/supabase'
import { LANDING_URL } from '../lib/api'
import {
  useEntitlement,
  TIER_LABELS,
  FEATURE_LABELS,
  FEATURE_MIN_TIER,
} from '../lib/entitlement'

type Props = {
  /** Desktop only — mobile leaves via the bottom nav. */
  onClose?: () => void
  /** Mobile: clear the bottom nav with the action footer's padding. */
  navPad?: boolean
}

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

const sectionLabel =
  'mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground'

export default function ProfileBody({ onClose, navPad = false }: Props) {
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

  const primary = plans[0] ?? null
  const expiry = expiryLabel(primary?.expires_at ?? null)
  const included = FEATURE_LABELS.filter(([slug]) => features.includes(slug))
  const missing = FEATURE_LABELS.filter(([slug]) => !features.includes(slug))
  const initial = (email?.[0] ?? '?').toUpperCase()

  return (
    <>
      {/* ---- Header ---- */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent-sky text-lg font-bold text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {email ?? 'Signed in'}
            </p>
            {memberSince && (
              <p className="text-xs text-muted-foreground">Member since {memberSince}</p>
            )}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      <div className="scroll-contain scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* ---- Current plan ---- */}
        <section>
          <h3 className={sectionLabel}>Your plan</h3>
          <div
            className={`rounded-2xl border p-4 ${
              hasAccess
                ? 'border-primary/30 bg-primary/10'
                : 'border-white/8 bg-white/4'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-lg font-bold text-foreground">
                {TIER_LABELS[tier] ?? tier}
              </span>
              {primary && (
                <span
                  className={`text-xs font-semibold ${
                    expiry.urgent ? 'text-amber-400' : 'text-muted-foreground'
                  }`}
                >
                  {expiry.text}
                </span>
              )}
            </div>
            {!hasAccess && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                You're on the free preview — the map and a taste of the guide.
              </p>
            )}
            {primary?.expires_at && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Access through {fmtDate(primary.expires_at)}
              </p>
            )}
          </div>
        </section>

        {/* ---- At a glance ---- */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/8 bg-white/4 p-3.5">
            <div className="text-2xl font-bold text-foreground">{credits}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Ask AI message{credits === 1 ? '' : 's'} left
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 p-3.5">
            <div className="text-2xl font-bold text-foreground">{deviceLimit}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Device{deviceLimit === 1 ? '' : 's'} included
            </div>
          </div>
        </section>

        {/* ---- Purchase history (active passes only) ---- */}
        {plans.length > 0 && (
          <section>
            <h3 className={sectionLabel}>Active passes</h3>
            <ul className="space-y-1.5">
              {plans.map((p, i) => (
                <li
                  key={`${p.plan}-${i}`}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2"
                >
                  <span className="text-sm text-foreground">{TIER_LABELS[p.plan] ?? p.plan}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.expires_at ? expiryLabel(p.expires_at).text : 'Ongoing'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- What's included ---- */}
        <section>
          <h3 className={sectionLabel}>What you have</h3>
          <ul className="space-y-1">
            {included.map(([slug, label]) => (
              <li key={slug} className="flex items-start gap-2 text-sm text-foreground/85">
                <span className="mt-0.5 shrink-0 font-bold text-primary">✓</span>
                {label}
              </li>
            ))}
            {included.length === 0 && (
              <li className="text-sm text-muted-foreground">Map browsing and search.</li>
            )}
          </ul>
        </section>

        {/* ---- What's missing. Shown, not hidden — same reasoning as
                UpsellOverlay: an invisible feature never gets bought. ---- */}
        {missing.length > 0 && (
          <section>
            <h3 className={sectionLabel}>Unlock with an upgrade</h3>
            <ul className="space-y-1">
              {missing.map(([slug, label]) => (
                <li
                  key={slug}
                  className="flex items-start justify-between gap-3 text-sm text-muted-foreground"
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">·</span>
                    {label}
                  </span>
                  <span className="shrink-0 pt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                    {TIER_LABELS[FEATURE_MIN_TIER[slug]] ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ---- Actions. Everything that changes a plan lives on the landing. ---- */}
      <div
        className={`shrink-0 space-y-2 border-t border-white/8 p-4 ${
          navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : ''
        }`}
      >
        <a
          href={`${LANDING_URL}/pricing`}
          className="block rounded-xl bg-gradient-to-br from-primary to-accent-sky px-4 py-2.5 text-center text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          {hasAccess ? 'Change plan' : 'See plans'}
        </a>
        <div className="flex gap-2">
          <a
            href={`${LANDING_URL}/account`}
            className="flex-1 rounded-xl border border-white/8 px-4 py-2 text-center text-sm font-medium text-foreground/85 hover:bg-white/6"
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
            className="flex-1 rounded-xl border border-white/8 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-white/6 hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
