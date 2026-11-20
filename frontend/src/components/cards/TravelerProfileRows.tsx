import { useEffect, useState } from 'react'
import { Check, Medal, UserRound, X } from 'lucide-react'

import {
  ApiError,
  fetchTravelerProfile,
  saveTravelerProfile,
  type TravelerProfile,
} from '../../lib/api'
import { Row } from '../MenuBody'
import CardSwitch from './CardSwitch'

/**
 * Profile → "Your collection": the leaderboard name and the "Show me on Top
 * Traveler" switch (docs/CARD_UI_SPEC.md S-9, Card UI Mapping p.12). Rows for
 * the section's MenuBody `Group` (T-5). Lazy-loaded by ProfileBody so the
 * map's first load doesn't carry Cards code (C-3).
 *
 * The name is what other travellers see: your chosen display name, or first
 * name + last initial when you haven't set one. Clearing the field goes back
 * to that default. The server validates (2–24 characters, no email).
 * Renders nothing until the profile loads, and nothing if it can't.
 */
export default function TravelerProfileRows() {
  const [profile, setProfile] = useState<TravelerProfile | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglePending, setTogglePending] = useState(false)

  useEffect(() => {
    let alive = true
    fetchTravelerProfile()
      .then((p) => alive && setProfile(p))
      .catch((e) => console.warn('[cards] traveler profile', e))
    return () => {
      alive = false
    }
  }, [])

  if (!profile) return null

  const startEdit = () => {
    setDraft(profile.displayName ?? '')
    setError(null)
    setEditing(true)
  }

  const commitName = async () => {
    if (saving) return
    const next = draft.trim()
    // Unchanged → nothing to send.
    if ((next || null) === profile.displayName) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      setProfile(await saveTravelerProfile({ displayName: next || null }))
      setEditing(false)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? e.message : 'Couldn’t save — try again.')
    } finally {
      setSaving(false)
    }
  }

  const setShown = async (show: boolean) => {
    if (togglePending) return
    const before = profile
    setTogglePending(true) // one save at a time, so replies can't land out of order
    setProfile({ ...profile, optOut: !show }) // optimistic
    try {
      setProfile(await saveTravelerProfile({ optOut: !show }))
    } catch (e) {
      console.warn('[cards] opt-out', e)
      setProfile(before)
    } finally {
      setTogglePending(false)
    }
  }

  return (
    <>
      {editing ? (
        <div className="px-4 py-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-white/4 py-1 pl-3 pr-1">
            <input
              autoFocus
              value={draft}
              maxLength={24}
              placeholder={profile.defaultName}
              aria-label="Leaderboard name"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitName()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={() => void commitName()}
              disabled={saving}
              aria-label="Save leaderboard name"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary hover:bg-white/8 disabled:opacity-50"
            >
              <Check size={15} />
            </button>
            <button
              onClick={() => setEditing(false)}
              aria-label="Cancel"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/8"
            >
              <X size={15} />
            </button>
          </div>
          <p className={`mt-1.5 px-1 text-[11px] ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
            {error ?? 'Shown on Top Traveler. Leave empty to use your first name and last initial.'}
          </p>
        </div>
      ) : (
        <Row
          icon={<UserRound size={16} />}
          label="Leaderboard name"
          detail={<span className="max-w-[45%] truncate text-sm text-muted-foreground">{profile.name}</span>}
          onClick={startEdit}
        />
      )}
      <Row
        icon={<Medal size={16} />}
        label="Show me on Top Traveler"
        detail={<CardSwitch label="Show me on Top Traveler" checked={!profile.optOut} onChange={setShown} disabled={togglePending} />}
      />
    </>
  )
}
