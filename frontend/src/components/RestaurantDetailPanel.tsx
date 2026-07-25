import type { RestaurantListing } from '../lib/api'
import { ResponsivePanel } from './ui/ResponsivePanel'

type Props = {
  restaurant: RestaurantListing | null
  onClose: () => void
  onGetDirections: (r: RestaurantListing) => void
}

function Row({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground w-5 shrink-0 text-center">{icon}</span>
      <div className="text-sm text-foreground flex-1">{children}</div>
    </div>
  )
}

function RestaurantDetailPanel({ restaurant, onClose, onGetDirections }: Props) {
  if (!restaurant) return null
  const r = restaurant

  const googleMapsUrl =
    r.latitude != null && r.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}%20${r.latitude},${r.longitude}`
      : null

  return (
    <ResponsivePanel
      side="right"
      title={r.name}
      desktopWidth="sm:w-96"
      onClose={onClose}
      className="z-30"
    >
      {/* header */}
      <div className="relative shrink-0">
        <div className="h-28 bg-gradient-to-br from-orange-500/30 to-card flex items-end">
          <div className="p-4">
            <h2 className="text-xl font-bold text-foreground leading-tight">{r.name}</h2>
            {r.cuisine && (
              <p className="text-sm text-orange-200 mt-0.5">
                {r.cuisine}
                {r.price ? ` · ${r.price}` : ''}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/70 text-foreground hover:bg-background flex items-center justify-center text-lg"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* primary actions — Google Maps style row */}
      <div className="flex gap-2 p-4 border-b border-border shrink-0">
        <button
          onClick={() => onGetDirections(r)}
          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          <span className="text-lg leading-none">➤</span>
          <span className="text-xs">Directions</span>
        </button>
        {r.phones?.length > 0 && (
          <a
            href={`tel:${r.phones[0].replace(/[^0-9+]/g, '')}`}
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-accent"
          >
            <span className="text-lg leading-none">📞</span>
            <span className="text-xs">Call</span>
          </a>
        )}
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-accent"
          >
            <span className="text-lg leading-none">🗺️</span>
            <span className="text-xs">Google</span>
          </a>
        )}
      </div>

      {/* details */}
      <div className="flex-1 overflow-y-auto scroll-contain p-4">
        {r.description && (
          <p className="text-sm text-foreground/90 mb-4 leading-relaxed">{r.description}</p>
        )}

        <div className="rounded-lg border border-border bg-secondary/40 px-3">
          {r.address && <Row icon="📍">{r.address}</Row>}
          {r.location_area && !r.address && <Row icon="📍">{r.location_area}</Row>}
          {r.hours && <Row icon="🕐">{r.hours}</Row>}
          {r.phones?.length > 0 && (
            <Row icon="📞">
              <a href={`tel:${r.phones[0].replace(/[^0-9+]/g, '')}`} className="text-primary hover:text-primary/80">
                {r.phones.join(', ')}
              </a>
            </Row>
          )}
          {r.website && (
            <Row icon="🌐">
              <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 break-all">
                {r.website.replace(/^https?:\/\//, '')}
              </a>
            </Row>
          )}
          {r.email && (
            <Row icon="✉️">
              <a href={`mailto:${r.email}`} className="text-primary hover:text-primary/80 break-all">
                {r.email}
              </a>
            </Row>
          )}
          {r.price && <Row icon="💵">{r.price}</Row>}
        </div>

        {/* graceful note when contact info is sparse */}
        {!r.hours && !r.phones?.length && !r.website && (
          <p className="text-xs text-muted-foreground mt-3">
            More details coming soon for this spot.
          </p>
        )}
      </div>
    </ResponsivePanel>
  )
}

export default RestaurantDetailPanel
