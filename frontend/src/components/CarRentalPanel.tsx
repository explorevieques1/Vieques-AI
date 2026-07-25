import type { TransportListing } from '../lib/api'
import { ResponsivePanel } from './ui/ResponsivePanel'

type Props = {
  company: TransportListing | null
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

function CarRentalPanel({ company, onClose }: Props) {
  if (!company) return null

  return (
    <ResponsivePanel side="right" title={company.name} desktopWidth="sm:w-96" onClose={onClose}>
      <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground leading-tight">{company.name}</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto scroll-contain">
        <div className="space-y-1.5">
          {company.address && <Row label="Address" value={company.address} />}
          {company.hours && <Row label="Hours" value={company.hours} />}
          {company.email && <Row label="Email" value={company.email} />}
          {company.phones?.length > 0 && <Row label="Phone" value={company.phones.join(', ')} />}
        </div>

        {company.vehicles?.length > 0 && (
          <div className="border-t border-border pt-4">
            <div className="text-sm font-semibold text-foreground mb-2">
              Vehicles offered ({company.vehicles.length})
            </div>
            <div className="space-y-2">
              {company.vehicles.map((v, i) => (
                <div key={i} className="rounded-lg border border-border bg-secondary/50 p-2.5">
                  <div className="font-medium text-foreground text-sm">
                    {[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                  </div>
                  <div className="mt-0.5 flex gap-4 text-xs text-muted-foreground">
                    {v.doors != null && <span>{v.doors} doors</span>}
                    {v.passengers != null && <span>{v.passengers} passengers</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {company.phones?.length > 0 && (
          <a
            href={`tel:${company.phones[0].replace(/[^0-9+]/g, '')}`}
            className="block text-center bg-primary text-primary-foreground font-medium rounded-lg py-2.5 hover:bg-primary/90 transition-colors"
          >
            Call to Reserve
          </a>
        )}
      </div>
    </ResponsivePanel>
  )
}

export default CarRentalPanel
