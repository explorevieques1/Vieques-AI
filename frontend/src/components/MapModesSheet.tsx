import { X } from 'lucide-react'

import { MAP_STYLES } from '../lib/mapStyles'

type Props = {
  open: boolean
  onClose: () => void
  styleId: string
  onStyleChange: (id: string) => void
  labels: boolean
  onLabelsChange: (on: boolean) => void
}

/**
 * The basemap picker, as a centred modal card over the map.
 *
 * Modelled on the native Maps "Map Modes" sheet: a titled card with an × in the
 * corner, a row of labelled thumbnails you tap to switch basemap, and toggles
 * below for the overlays. The thumbnails matter — a list of the words
 * "Satellite / Streets / Outdoor / Basic" asks you to remember what each one
 * looks like, which is exactly the thing a picture answers for free.
 *
 * The previews are hand-drawn SVG rather than raster tiles: a real tile costs a
 * MapTiler request per style per open, and this is a *categorical* choice — you
 * need to tell green-and-roads from photography, not to inspect a specific
 * place. Four inline SVGs are ~1kB and render instantly offline.
 *
 * Not a vaul Drawer. The map sheet already owns the bottom edge and is always
 * mounted; a second drawer stacked on it fights over drag gestures and over the
 * body's `pointer-events: none`. This is a plain fixed overlay, so it composes.
 */

/** Tiny abstract basemap previews, keyed by MAP_STYLES id. */
function StylePreview({ id }: { id: string }) {
  const common = { width: '100%', height: '100%', viewBox: '0 0 64 64' } as const

  if (id === 'hybrid') {
    return (
      <svg {...common} aria-hidden="true">
        <rect width="64" height="64" fill="#3f4a34" />
        <path d="M0 44 Q16 36 32 42 T64 38 L64 64 L0 64 Z" fill="#55603f" />
        <path d="M8 0 L26 64" stroke="#8a8577" strokeWidth="5" fill="none" />
        <circle cx="44" cy="18" r="7" fill="#4a5a3a" />
        <circle cx="54" cy="30" r="5" fill="#4a5a3a" />
        <rect x="30" y="46" width="7" height="6" fill="#d9d4c6" />
      </svg>
    )
  }
  if (id === 'outdoor-v2') {
    return (
      <svg {...common} aria-hidden="true">
        <rect width="64" height="64" fill="#e8efdc" />
        <path d="M0 40 L18 18 L34 40 Z" fill="#b9cfa0" />
        <path d="M26 44 L44 20 L64 44 Z" fill="#a3c188" />
        <path d="M0 52 Q32 44 64 54" stroke="#7fa96a" strokeWidth="3" fill="none" />
        <path d="M4 62 Q30 54 62 62" stroke="#c6a06a" strokeWidth="2" fill="none" strokeDasharray="4 3" />
      </svg>
    )
  }
  if (id === 'basic-v2') {
    return (
      <svg {...common} aria-hidden="true">
        <rect width="64" height="64" fill="#eceff3" />
        <rect x="6" y="8" width="20" height="16" rx="2" fill="#dde2e9" />
        <rect x="36" y="8" width="22" height="16" rx="2" fill="#dde2e9" />
        <rect x="6" y="38" width="20" height="18" rx="2" fill="#dde2e9" />
        <rect x="36" y="38" width="22" height="18" rx="2" fill="#dde2e9" />
        <path d="M31 0 V64 M0 31 H64" stroke="#ffffff" strokeWidth="6" />
      </svg>
    )
  }
  // streets-v2
  return (
    <svg {...common} aria-hidden="true">
      <rect width="64" height="64" fill="#eef1f5" />
      <rect x="0" y="0" width="64" height="22" fill="#dfe7dc" />
      <path d="M0 30 H64" stroke="#f7c948" strokeWidth="7" />
      <path d="M22 0 V64" stroke="#ffffff" strokeWidth="6" />
      <path d="M48 22 V64" stroke="#ffffff" strokeWidth="4" />
      <rect x="4" y="40" width="12" height="10" fill="#d7dde6" />
      <rect x="30" y="42" width="12" height="12" fill="#d7dde6" />
    </svg>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[15px] text-foreground">
        {label}
        {hint && (
          <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          checked ? 'bg-emerald-500' : 'bg-white/20'
        }`}
      >
        <span
          className={`absolute top-[3px] h-6 w-6 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[23px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}

export default function MapModesSheet({
  open,
  onClose,
  styleId,
  onStyleChange,
  labels,
  onLabelsChange,
}: Props) {
  if (!open) return null

  return (
    // z-50: above the map sheet (z-40 overlay) and the chrome stack (z-30).
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Close map modes"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div
        role="dialog"
        aria-label="Map Modes"
        className="glass relative m-3 w-full max-w-md rounded-3xl p-4 shadow-2xl"
        style={{ marginBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="relative flex items-center justify-center">
          <h2 className="font-display text-[19px] font-semibold tracking-tight text-foreground">
            Map Modes
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-0 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-foreground transition-colors hover:bg-white/16"
          >
            <X size={17} />
          </button>
        </div>

        {/* The thumbnails. `grid-cols-4` matches the four basemaps; if a fifth is
            ever added this wraps to a second row rather than shrinking them
            below a legible size. */}
        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {MAP_STYLES.map((s) => {
            const on = s.id === styleId
            return (
              <button
                key={s.id}
                onClick={() => onStyleChange(s.id)}
                aria-pressed={on}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`block aspect-square w-full overflow-hidden rounded-2xl ring-2 transition-shadow ${
                    on ? 'ring-primary' : 'ring-white/10'
                  }`}
                >
                  <StylePreview id={s.id} />
                </span>
                <span
                  className={`text-[12px] leading-none ${
                    on ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-white/6">
          <Toggle label="Labels" checked={labels} onChange={onLabelsChange} />
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          © MapTiler · OpenStreetMap
        </p>
      </div>
    </div>
  )
}
