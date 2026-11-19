// Types for the vendored React Bits SoundEngine (react-bits-sound.js). The map
// app's tsconfig does not allowJs, so TypeScript resolves the import to this file
// while Vite serves the .js beside it. Hand-written from the upstream exports
// (2026-11-19). Recipes are opaque data objects (coin.js, reveal.js, …).

/** A sound recipe (synth layers + envelope), as exported by the recipe files. */
export interface SoundRecipe {
  duration: number
  seed?: number
  loudness?: number
  [key: string]: unknown
}

export interface SoundTune {
  /** Semitones, −24…24. */
  pitch?: number
  tone?: number
  length?: number
  space?: number
  punch?: number
  /** dB, −48…12. */
  volume?: number
  variation?: number
  reverb?: { mix?: number; decay?: number; tone?: number } | null
  echo?: Record<string, unknown> | null
  filter?: Record<string, unknown> | null
  chorus?: Record<string, unknown> | null
  lofi?: Record<string, unknown> | null
}

export declare function playSound(recipe: SoundRecipe, tune?: SoundTune): Promise<void>
export declare function preloadSound(recipe: SoundRecipe, tune?: SoundTune): void
export declare function renderSound(
  recipe: SoundRecipe,
  tune?: SoundTune,
  options?: { sampleRate?: number; channels?: number; variant?: number },
): Promise<AudioBuffer>
export declare function setSoundMuted(value: boolean): void
export declare function setSoundVolume(value: number): void
export declare function useSound(recipe: SoundRecipe, tune?: SoundTune): () => void
