import {
  ChevronDown,
  ChevronLeft,
  Clock,
  Globe,
  Heart,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Share2,
  X,
} from 'lucide-react'

import { isMappable, type Place } from '../lib/place'

type Props = {
  place: Place
  onClose: () => void
  /** Mobile: pops back to the results list instead of dismissing the sheet. */
  onBack?: () => void
  /**
   * Mobile: drop the sheet to its collapsed stop, keeping the place selected.
   * The point of the panel is the pin it describes, and sometimes you want to
   * look at the pin.
   */
  onCollapse?: () => void
  /** In-app routing. When absent the primary action links to Google Maps. */
  onGetDirections?: (p: Place) => void
  /**
   * Kind-specific content — currently the Tripadvisor card on stays.
   *
   * A slot rather than a `place.kind === 'stay'` branch in here, because this
   * panel's whole point is that it knows nothing about categories: adding one
   * should mean writing an adapter in lib/place.ts and nothing else. Only the
   * caller knows a stay from a beach, so only the caller decides what extra
   * goes in.
   */
  extra?: React.ReactNode
  /**
   * Layout knobs, for the same reason `extra` exists: the caller knows which
   * category it is rendering and therefore which arrangement reads best, and
   * this panel stays ignorant of both. Defaults reproduce the original order
   * (hero photo, stats under the tags, extra below the description).
   *
   * Stays turn all three over: their own photo column is thin and duplicative
   * next to the Tripadvisor strip, so the hero comes off and the review card
   * rides directly under the tags, with the nightly/sleeps grid demoted to the
   * bottom just above the contact rows.
   */
  hero?: boolean
  extraPosition?: 'after-description' | 'after-tags'
  statsPosition?: 'top' | 'bottom'
  /** Optional so callers that don't offer saving render no heart. */
  saved?: boolean
  onToggleSave?: (p: Place) => void
  /** Mobile: pad the sticky action bar so it clears the bottom nav. */
  navPad?: boolean
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/3 px-3.5 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function ContactRow({
  icon,
  children,
  href,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  href?: string
}) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </>
  )
  return href ? (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      className="flex gap-3 rounded-xl px-1 py-1.5 text-sm text-foreground hover:bg-white/5 hover:text-primary"
    >
      {body}
    </a>
  ) : (
    <div className="flex gap-3 px-1 py-1.5 text-sm text-foreground">{body}</div>
  )
}

/**
 * The one detail panel for every kind of place.
 *
 * Replaces DetailPanel (beaches), RestaurantDetailPanel and CarRentalPanel,
 * which duplicated the same header / rows / close-button markup three ways.
 * Everything rendered here comes off the `Place` view model, so adding a
 * category means writing an adapter in lib/place.ts and nothing else.
 */
function PlaceDetailPanel({
  place,
  onClose,
  onBack,
  onCollapse,
  onGetDirections,
  extra,
  hero = true,
  extraPosition = 'after-description',
  statsPosition = 'top',
  saved = false,
  onToggleSave,
  navPad = false,
}: Props) {
  const mappable = isMappable(place)

  // Photos come off the view model, not off `raw` per category — see Place.photo.
  // Listings without one still fall through to the striped placeholder below.
  const heroImage = place.photo ?? null
  const heroCredit = place.photoCredit ?? null
  const gmaps = mappable
    ? `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
    : null

  const share = async () => {
    const text = `${place.name}${place.subtitle ? ` — ${place.subtitle}` : ''}`
    try {
      if (navigator.share) await navigator.share({ title: place.name, text, url: gmaps ?? undefined })
      else await navigator.clipboard.writeText(`${text}${gmaps ? `\n${gmaps}` : ''}`)
    } catch {
      // User dismissed the share sheet, or the clipboard is blocked. Neither
      // is worth interrupting them over.
    }
  }

  const { contact } = place

  // Back / share / close. Float over the hero when there is one, and sit in
  // their own row above the title when there isn't — either way they are the
  // only way off this panel on mobile, so they cannot ride on the photo alone.
  const controls = (
    <>
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="Back to results"
          className="grid h-8 w-8 place-items-center rounded-xl bg-black/50 text-foreground backdrop-blur"
        >
          <ChevronLeft size={16} />
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-1.5">
        {onCollapse && (
          <button
            onClick={onCollapse}
            aria-label="Collapse panel"
            title="Collapse panel"
            className="grid h-8 w-8 place-items-center rounded-xl bg-black/50 text-foreground backdrop-blur hover:text-primary"
          >
            <ChevronDown size={16} />
          </button>
        )}
        {onToggleSave && (
          <button
            onClick={() => onToggleSave(place)}
            aria-label={saved ? 'Remove from saved' : 'Save this place'}
            aria-pressed={saved}
            title={saved ? 'Saved' : 'Save'}
            className="grid h-8 w-8 place-items-center rounded-xl bg-black/50 text-foreground backdrop-blur hover:text-primary"
          >
            <Heart
              size={14}
              className={saved ? 'text-primary' : ''}
              fill={saved ? 'currentColor' : 'none'}
            />
          </button>
        )}
        <button
          onClick={share}
          aria-label="Share"
          className="grid h-8 w-8 place-items-center rounded-xl bg-black/50 text-foreground backdrop-blur hover:text-primary"
        >
          <Share2 size={14} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-xl bg-black/50 text-foreground backdrop-blur hover:text-primary"
        >
          <X size={14} />
        </button>
      </div>
    </>
  )

  const statsGrid = place.stats.length > 0 && (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {place.stats.slice(0, place.statLimit ?? 4).map((s) => (
        <Stat key={s.label} label={s.label} value={s.value} />
      ))}
    </div>
  )

  return (
    <>
      {!hero && (
        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pt-4">{controls}</div>
      )}

      {/* Hero. Most listing tables still have no photo column, so the striped
          placeholder from the mockups stands in rather than a broken <img>. */}
      {hero && (
        <div className="relative mx-4 mt-4 h-44 shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[#123147] to-[#0a1e2e]">
          {heroImage ? (
            <>
              <img src={heroImage} alt={place.name} className="h-full w-full object-cover" />
              {heroCredit && (
                <div className="absolute bottom-0 right-0 bg-black/55 px-2 py-1 text-[10px] text-white/70">
                  © {heroCredit}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, rgba(94,234,212,.07) 0 12px, rgba(94,234,212,.02) 12px 24px)',
                }}
              />
              <div className="absolute inset-0 grid place-items-center font-mono text-[11px] uppercase tracking-[0.14em] text-white/30">
                {place.icon.emoji} {place.kind} photo
              </div>
            </>
          )}

          <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
            {controls}
          </div>
        </div>
      )}

      {/* Body */}
      <div
        className={`scroll-contain no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4 ${
          hero ? 'pt-4' : 'pt-3'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight tracking-tight text-foreground">
              {place.name}
            </h2>
            {place.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{place.subtitle}</p>
            )}
          </div>
          {mappable && (
            <div className="shrink-0 text-right font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
              <div>{Math.abs(place.latitude).toFixed(2)}°{place.latitude >= 0 ? 'N' : 'S'}</div>
              <div>{Math.abs(place.longitude).toFixed(2)}°{place.longitude >= 0 ? 'E' : 'W'}</div>
            </div>
          )}
        </div>

        {place.tags.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {place.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1 text-[11px] text-primary"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {place.warning && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-200">
            ⚠ {place.warning}
          </div>
        )}

        {extraPosition === 'after-tags' && extra}

        {statsPosition === 'top' && statsGrid}

        {place.description && (
          <p className="mt-4 text-sm leading-relaxed text-foreground/85 text-pretty">
            {place.description}
          </p>
        )}

        {extraPosition === 'after-description' && extra}

        {statsPosition === 'bottom' && statsGrid}

        {(contact.address || contact.hours || contact.phones?.length || contact.website ||
          contact.email) && (
          <div className="mt-4 space-y-0.5 border-t border-white/8 pt-3">
            {contact.address && (
              <ContactRow icon={<MapPin size={15} />}>{contact.address}</ContactRow>
            )}
            {contact.hours && <ContactRow icon={<Clock size={15} />}>{contact.hours}</ContactRow>}
            {contact.phones?.map((p) => (
              <ContactRow key={p} icon={<Phone size={15} />} href={`tel:${p.replace(/\s/g, '')}`}>
                {p}
              </ContactRow>
            ))}
            {contact.website && (
              <ContactRow icon={<Globe size={15} />} href={contact.website}>
                {contact.website.replace(/^https?:\/\//, '')}
              </ContactRow>
            )}
            {contact.email && (
              <ContactRow icon={<Mail size={15} />} href={`mailto:${contact.email}`}>
                {contact.email}
              </ContactRow>
            )}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      {mappable && (
        <div
          className={`shrink-0 bg-gradient-to-b from-transparent to-background/85 px-4 pt-3 ${
            navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
          }`}
        >
          {onGetDirections ? (
            <button
              onClick={() => onGetDirections(place)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-accent-sky text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity hover:opacity-90"
            >
              <Navigation size={17} />
              Get Directions
            </button>
          ) : (
            <a
              href={gmaps!}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-accent-sky text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity hover:opacity-90"
            >
              <Navigation size={17} />
              Get Directions
            </a>
          )}
        </div>
      )}
    </>
  )
}

export default PlaceDetailPanel
