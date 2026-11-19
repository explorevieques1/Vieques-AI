// Vieques Cards sound — play a React Bits sound by name (spec C-3, I-1, I-3).
//
// The engine and the four recipes are loaded with a dynamic import, so pulling
// this module into the map's first-load code costs a few hundred bytes, not the
// engine (C-3). Call `preloadSounds()` when a Cards surface mounts so the engine
// is already in memory by the time the user taps.
//
// I-1: `unlockSound()` must be called from inside a tap handler (radar button or
// card open). It resumes the shared AudioContext synchronously inside that tap,
// which is what iOS Safari requires. If the engine hasn't loaded yet it unlocks
// after the import resolves — best effort, iOS may still refuse, hence preload.
//
// I-3: sound is on by default; the mute choice is stored on this device.
import type { SoundRecipe } from '@/components/reactbits/sounds/react-bits-sound'

export type SoundName = 'coin' | 'reveal' | 'treasure' | 'ping'

type Engine = typeof import('@/components/reactbits/sounds/react-bits-sound')

const MUTE_KEY = 'vq.cards.soundMuted'

let engine: Engine | null = null
let recipes: Record<SoundName, SoundRecipe> | null = null
let loading: Promise<void> | null = null
let unlocked = false

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

let muted = readMuted()
const listeners = new Set<() => void>()

/** Fetch the engine + recipes (no AudioContext is created). Safe to call often. */
export function preloadSounds(): Promise<void> {
  loading ??= Promise.all([
    import('@/components/reactbits/sounds/react-bits-sound'),
    import('@/components/reactbits/sounds/coin'),
    import('@/components/reactbits/sounds/reveal'),
    import('@/components/reactbits/sounds/treasure'),
    import('@/components/reactbits/sounds/ping'),
  ])
    .then(([e, coin, reveal, treasure, ping]) => {
      engine = e
      recipes = { coin: coin.default, reveal: reveal.default, treasure: treasure.default, ping: ping.default }
      e.setSoundMuted(muted)
    })
    .catch((err: unknown) => {
      loading = null
      throw err
    })
  return loading
}

function unlockNow(e: Engine, r: Record<SoundName, SoundRecipe>): void {
  // A -48 dB ping: playSound() creates/resumes the shared context before its
  // first await, i.e. still inside the tap. Inaudible by design.
  void e.playSound(r.ping, { volume: -48 }).catch(() => undefined)
  for (const recipe of Object.values(r)) e.preloadSound(recipe)
  unlocked = true
}

/** I-1: call only from a user tap handler (radar button / card open). */
export function unlockSound(): void {
  if (unlocked || muted) return
  if (engine && recipes) {
    unlockNow(engine, recipes)
    return
  }
  // Engine not loaded yet: only start loading. Unlocking after the await would
  // be outside the tap, and iOS would keep the context suspended for good —
  // so the NEXT tap unlocks synchronously via the branch above. Callers should
  // preloadSounds() on mount (radar button) so the first tap finds it ready.
  void preloadSounds().catch(() => undefined)
}

/** Play a Cards sound. No-op while muted or before the first unlocking tap. */
export function playSound(name: SoundName): void {
  if (muted || !unlocked || !engine || !recipes) return
  void engine.playSound(recipes[name]).catch(() => undefined)
}

export function isSoundMuted(): boolean {
  return muted
}

/** I-3: persist the choice on this device. Unmuting comes from a tap, so it also unlocks. */
export function setSoundMuted(next: boolean): void {
  muted = next
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    // Private mode / storage full: the choice lasts for this session only.
  }
  engine?.setSoundMuted(next)
  if (!next) unlockSound()
  listeners.forEach((fn) => fn())
}

/** For useSyncExternalStore — keeps the radar pill and Collection toggles in step. */
export function subscribeSoundMuted(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
