import type { TransportListing } from '../lib/api'
import { ResponsivePanel } from './ui/ResponsivePanel'
import { Skeleton } from './ui/skeleton'

type Props = {
  drivers: TransportListing[]
  loading: boolean
  onClose: () => void
}

function TaxiListPanel({ drivers, loading, onClose }: Props) {
  return (
    <ResponsivePanel side="right" title="Taxis & Públicos" desktopWidth="sm:w-96" onClose={onClose}>
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Taxis &amp; Públicos</h2>
          <p className="text-sm text-muted-foreground">{drivers.length} drivers available</p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-contain p-4 space-y-3">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        {!loading && drivers.length === 0 && (
          <div className="text-sm text-muted-foreground">No drivers listed yet.</div>
        )}
        {drivers.map((d) => (
          <div key={d.id} className="rounded-lg border border-border bg-secondary/50 p-3">
            <div className="font-medium text-foreground">{d.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/80">
              {d.metadata?.vehicle_type && (
                <span><span className="text-muted-foreground">Vehicle:</span> {d.metadata.vehicle_type}</span>
              )}
              {d.metadata?.passengers != null && (
                <span><span className="text-muted-foreground">Seats:</span> {d.metadata.passengers}</span>
              )}
              {d.metadata?.plate && (
                <span><span className="text-muted-foreground">Plate:</span> {d.metadata.plate}</span>
              )}
            </div>
            {d.phones?.length > 0 && (
              <a
                href={`tel:${d.phones[0].replace(/[^0-9+]/g, '')}`}
                className="mt-2 inline-block text-sm text-primary hover:text-primary/80"
              >
                📞 {d.phones[0]}
              </a>
            )}
          </div>
        ))}
      </div>
    </ResponsivePanel>
  )
}

export default TaxiListPanel
