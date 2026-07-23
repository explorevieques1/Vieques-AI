import type { RestaurantListing } from '../lib/api'

type Props = {
  restaurant: RestaurantListing | null
  onClose: () => void
  onGetDirections: (r: RestaurantListing) => void
}

function Row({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 w-5 shrink-0 text-center">{icon}</span>
      <div className="text-sm text-slate-200 flex-1">{children}</div>
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
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-30 bg-slate-900/97 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      {/* header */}
      <div className="relative shrink-0">
        <div className="h-28 bg-gradient-to-br from-orange-500/30 to-slate-800 flex items-end">
          <div className="p-4">
            <h2 className="text-xl font-bold text-white leading-tight">{r.name}</h2>
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
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900/70 text-slate-200 hover:bg-slate-800 flex items-center justify-center text-lg"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* primary actions — Google Maps style row */}
      <div className="flex gap-2 p-4 border-b border-slate-800 shrink-0">
        <button
          onClick={() => onGetDirections(r)}
          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-cyan-500 text-slate-900 font-medium hover:bg-cyan-400"
        >
          <span className="text-lg leading-none">➤</span>
          <span className="text-xs">Directions</span>
        </button>
        {r.phones?.length > 0 && (
          <a
            href={`tel:${r.phones[0].replace(/[^0-9+]/g, '')}`}
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
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
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <span className="text-lg leading-none">🗺️</span>
            <span className="text-xs">Google</span>
          </a>
        )}
      </div>

      {/* details */}
      <div className="flex-1 overflow-y-auto p-4">
        {r.description && (
          <p className="text-sm text-slate-300 mb-4 leading-relaxed">{r.description}</p>
        )}

        <div className="rounded-lg border border-slate-800 bg-slate-800/40 px-3">
          {r.address && <Row icon="📍">{r.address}</Row>}
          {r.location_area && !r.address && <Row icon="📍">{r.location_area}</Row>}
          {r.hours && <Row icon="🕐">{r.hours}</Row>}
          {r.phones?.length > 0 && (
            <Row icon="📞">
              <a href={`tel:${r.phones[0].replace(/[^0-9+]/g, '')}`} className="text-cyan-400 hover:text-cyan-300">
                {r.phones.join(', ')}
              </a>
            </Row>
          )}
          {r.website && (
            <Row icon="🌐">
              <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 break-all">
                {r.website.replace(/^https?:\/\//, '')}
              </a>
            </Row>
          )}
          {r.email && (
            <Row icon="✉️">
              <a href={`mailto:${r.email}`} className="text-cyan-400 hover:text-cyan-300 break-all">
                {r.email}
              </a>
            </Row>
          )}
          {r.price && <Row icon="💵">{r.price}</Row>}
        </div>

        {/* graceful note when contact info is sparse */}
        {!r.hours && !r.phones?.length && !r.website && (
          <p className="text-xs text-slate-500 mt-3">
            More details coming soon for this spot.
          </p>
        )}
      </div>
    </aside>
  )
}

export default RestaurantDetailPanel