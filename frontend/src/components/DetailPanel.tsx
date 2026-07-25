import type { Beach } from '../lib/api'
import { ResponsivePanel } from './ui/ResponsivePanel'
import { Badge } from './ui/badge'

type Props = {
  beach: Beach | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

function DetailPanel({ beach, onClose }: Props) {
  if (!beach) return null

  return (
    <ResponsivePanel side="right" title={beach.name} desktopWidth="sm:w-96" onClose={onClose}>
      <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground leading-tight">{beach.name}</h2>
          {beach.local_name && <p className="text-sm text-muted-foreground">{beach.local_name}</p>}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto scroll-contain">
        {beach.type?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {beach.type.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        )}

        {beach.in_wildlife_refuge && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-200">
            ⚠ Inside the wildlife refuge
            {beach.gate_hours && beach.gate_hours !== 'N/A' && (
              <span className="block text-amber-300/80 text-xs mt-0.5">{beach.gate_hours}</span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {beach.region && <Row label="Region" value={beach.region} />}
          {beach.access && <Row label="Access" value={beach.access} />}
          {beach.water_conditions && <Row label="Water" value={beach.water_conditions} />}
          {beach.best_for && <Row label="Best for" value={beach.best_for} />}
          {beach.facilities?.length > 0 && (
            <Row label="Facilities" value={beach.facilities.join(', ')} />
          )}
        </div>

        {beach.notes && (
          <p className="text-sm text-foreground/90 leading-relaxed border-t border-border pt-4">
            {beach.notes}
          </p>
        )}

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${beach.latitude},${beach.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="block text-center bg-primary text-primary-foreground font-medium rounded-lg py-2.5 hover:bg-primary/90 transition-colors"
        >
          Get Directions
        </a>
      </div>
    </ResponsivePanel>
  )
}

export default DetailPanel
