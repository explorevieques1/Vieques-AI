import { useEffect, useState } from 'react'
import { Medal } from 'lucide-react'

import { armCardRadar } from '../../hooks/useCardRadar'
import {
  fetchLeaderboard,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardRange,
} from '../../lib/api'
import Counter from '../reactbits/Counter'
import SplitFlapText from '../reactbits/SplitFlapText'
import LoadFailed from './LoadFailed'

/**
 * Vieques Cards — Collection's third tab, Top Traveler (docs/CARD_UI_SPEC.md
 * S-6, T-2, T-3, T-5, M-3, M-4; Card UI Mapping p.10). Rendered inside
 * CollectionBody's scroller, so it rides in the same lazy chunk (C-3).
 *
 *   This week / All-time   SavedBody tab() segmented control (T-5). Week =
 *                          points earned since Monday 00:00 Puerto Rico time.
 *   Your rank              SplitFlapText "#07" — flips once when the tab opens
 *                          or the range changes (loop={false}, padTo 3,
 *                          numeric); static under reduced motion (M-3).
 *   Top 20                 rank (lucide Medal gold/silver/bronze for 1–3),
 *                          initials avatar, name (display name or first name +
 *                          last initial — the API never sends emails or ids),
 *                          "N cards · N badges", points in Geist Mono (Counter).
 *   Your row               highlighted in place when in the top 20, else pinned
 *                          at the foot; "N pts to pass #k" in the header.
 *                          Opted out → "Hidden from others · change in Profile".
 * No live polling: the board is fetched when the tab opens and per range.
 */

const microLabel = 'font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground'

/** Remembered per range so Counter rolls only when your points changed since you last looked (p.10). */
const SEEN_KEY = 'vq-top-traveler-seen'

const MEDAL_CLASS = ['text-medal-gold', 'text-medal-silver', 'text-medal-bronze'] as const

function readSeen(range: LeaderboardRange): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')[range]
    return typeof v === 'number' ? v : null
  } catch {
    return null
  }
}

function writeSeen(range: LeaderboardRange, points: number) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...all, [range]: points }))
  } catch {
    /* private mode — the roll just won't play */
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const detailLine = (cards: number, badges: number) =>
  `${plural(cards, 'card')} · ${plural(badges, 'badge')}`
/** "#07": two digits under 100, as on the board in the spec. */
const rankText = (rank: number) => `#${String(rank).padStart(2, '0')}`

type Props = {
  /** Phone only; omitted on desktop (S-10: the radar is a phone feature). */
  radarOn?: boolean
  onTurnOnRadar?: () => void
}

export default function TopTravelerTab({ radarOn, onTurnOnRadar }: Props) {
  const [range, setRange] = useState<LeaderboardRange>('week')
  const [boards, setBoards] = useState<Partial<Record<LeaderboardRange, Leaderboard>>>({})
  const [failedRange, setFailedRange] = useState<string | null>(null)
  const failed = failedRange === range
  const [reloads, setReloads] = useState(0)

  // Fetched on open and on every range switch (no polling). The last board for
  // a range stays on screen while its refresh is in flight.
  useEffect(() => {
    let alive = true
    fetchLeaderboard(range)
      .then((b) => {
        if (!alive) return
        setBoards((cur) => ({ ...cur, [range]: b }))
        setFailedRange((cur) => (cur === range ? null : cur))
      })
      .catch((e) => {
        console.warn('[cards] leaderboard', e)
        if (alive) setFailedRange(range)
      })
    return () => {
      alive = false
    }
  }, [range, reloads])

  const board = boards[range] ?? null

  const tab = (id: LeaderboardRange, label: string) => (
    <button
      key={id}
      onClick={() => setRange(id)}
      aria-pressed={range === id}
      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        range === id ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )

  return (
    // Your pinned row is `sticky` to the foot of the pane while a long board scrolls.
    <div className="flex flex-col gap-4">
      <div className="flex shrink-0 gap-1 rounded-xl bg-white/[0.04] p-1">
        {tab('week', 'This week')}
        {tab('all', 'All-time')}
      </div>

      {!board ? (
        failed ? (
          <LoadFailed what="the leaderboard" onRetry={() => setReloads((n) => n + 1)} />
        ) : (
          // Static placeholders — no pulse (M-4).
          <>
            <div className="h-12 rounded-2xl bg-muted" />
            <div className="h-64 rounded-2xl bg-muted" />
          </>
        )
      ) : (
        <BoardView
          key={range}
          board={board}
          range={range}
          radarOn={radarOn}
          onTurnOnRadar={onTurnOnRadar}
        />
      )}
    </div>
  )
}

function BoardView({
  board,
  range,
  radarOn,
  onTurnOnRadar,
}: {
  board: Leaderboard
  range: LeaderboardRange
  radarOn?: boolean
  onTurnOnRadar?: () => void
}) {
  const { entries, you, pass } = board
  const ranked = you.rank != null

  return (
    <>
      {/* Your rank + the next target (p.10 header). */}
      {ranked && (
        <section aria-label="Your rank" className="flex items-end justify-between gap-3 px-1">
          <div>
            <p className={microLabel}>Your rank</p>
            <SplitFlapText
              className="mt-1.5"
              text={rankText(you.rank!)}
              // S-6: flips once, never loops (M-4); numeric flaps; static under
              // reduced motion (the component checks it itself — M-3).
              loop={false}
              padTo={3}
              charset="numeric"
              flipsPerChar={5}
              fontSize={24}
              gap={3}
              tileRadius={5}
              tileColor="var(--muted)"
              textColor="var(--foreground)"
            />
          </div>
          <div className="text-right">
            {pass ? (
              <>
                <p className={microLabel}>To pass #{pass.rank}</p>
                <p
                  className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground"
                  aria-label={`${pass.points} pts to pass #${pass.rank}`}
                >
                  {pass.points} pts
                </p>
              </>
            ) : (
              <>
                <p className={microLabel}>Points</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                  {you.points} pts
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {entries.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm leading-relaxed text-muted-foreground">
          {range === 'week' ? 'Be the first Top Traveler this week.' : 'Be the first Top Traveler.'}
        </p>
      ) : (
        <ol
          aria-label={range === 'week' ? 'Top Traveler this week' : 'Top Traveler all-time'}
          className="divide-y divide-white/6 overflow-hidden rounded-2xl bg-white/4"
        >
          {entries.map((e, i) => (
            <BoardRow key={`${e.rank}-${i}`} entry={e} range={range} />
          ))}
        </ol>
      )}

      {/* Your row, pinned, when you're not already on the board above. */}
      {!you.inTop && (
        // Sticks above the iPhone home indicator (the scroller's own pb adds 1rem).
        <div className="sticky bottom-[var(--sab)] rounded-2xl bg-background">
          <div className="rounded-2xl border border-primary/40 bg-primary/10">
            {ranked ? (
              <ol aria-label="Your place">
                <BoardRow
                  entry={{
                    rank: you.rank!,
                    name: you.name,
                    initials: you.initials,
                    cards: you.cards,
                    badges: you.badges,
                    points: you.points,
                    you: true,
                  }}
                  range={range}
                  hidden={you.hidden}
                  pinned
                />
              </ol>
            ) : (
              <div className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar initials={you.initials} you />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">You</p>
                    <p className="text-[11px] text-muted-foreground">
                      {you.hidden ? 'Hidden from others · change in Profile' : 'Collect a card to join the board'}
                    </p>
                  </div>
                </div>
                {onTurnOnRadar && !radarOn && (
                  <button
                    onClick={() => {
                      armCardRadar() // I-1: inside the tap
                      onTurnOnRadar()
                    }}
                    className="mt-3 h-12 w-full rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
                  >
                    Turn on radar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function BoardRow({
  entry,
  range,
  hidden = false,
  pinned = false,
}: {
  entry: LeaderboardEntry
  range: LeaderboardRange
  /** Your own row while opted out. */
  hidden?: boolean
  /** Rendered in the pinned slot (already tinted by its frame). */
  pinned?: boolean
}) {
  // No medal on a hidden row: you aren't on the board others see.
  const medal = entry.rank <= 3 && !hidden ? MEDAL_CLASS[entry.rank - 1] : null
  const highlight = entry.you && !pinned
  return (
    <li
      className={`flex list-none items-center gap-3 px-4 py-2.5 ${highlight ? 'bg-primary/10' : ''}`}
      aria-current={entry.you ? 'true' : undefined}
    >
      <span className="grid w-5 shrink-0 place-items-center">
        {medal ? (
          <>
            <Medal size={17} className={medal} aria-hidden="true" />
            <span className="sr-only">Rank {entry.rank}</span>
          </>
        ) : (
          <span
            className={`font-mono text-[13px] tabular-nums ${entry.you ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {entry.rank}
          </span>
        )}
      </span>
      <Avatar initials={entry.initials} you={entry.you} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{entry.you ? 'You' : entry.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {hidden ? 'Hidden from others · change in Profile' : detailLine(entry.cards, entry.badges)}
        </p>
      </div>
      {entry.you ? (
        <YourPoints points={entry.points} range={range} />
      ) : (
        <Points value={entry.points} />
      )}
    </li>
  )
}

/** Points in Geist Mono via Counter (S-6); no intro spin (M-4). */
function Points({ value, you = false }: { value: number; you?: boolean }) {
  return (
    <Counter
      value={value}
      intro={false}
      duration={0.7}
      fontSize={14}
      fontWeight={600}
      textColor={you ? 'var(--primary)' : 'var(--foreground)'}
      className="shrink-0 font-mono"
    />
  )
}

/**
 * Your points roll from what you saw last time to what you have now — and only
 * then (Card UI Mapping p.10: "Counter rolls only when the value changed since
 * the last view"). Counter itself jumps under reduced motion (M-3).
 */
function YourPoints({ points, range }: { points: number; range: LeaderboardRange }) {
  const [shown, setShown] = useState(() => readSeen(range) ?? points)
  useEffect(() => {
    writeSeen(range, points)
    // Next frame: Counter has painted the old value, so it rolls to the new one.
    const raf = requestAnimationFrame(() => setShown(points))
    return () => cancelAnimationFrame(raf)
  }, [points, range])
  return <Points value={shown} you />
}

function Avatar({ initials, you = false }: { initials: string; you?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full font-mono text-[9.5px] font-semibold tracking-[0.04em] ${
        you ? 'bg-primary/20 text-primary' : 'bg-white/8 text-foreground/85'
      }`}
    >
      {initials || '·'}
    </span>
  )
}
