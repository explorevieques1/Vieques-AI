import type { TransportListing } from '../lib/api'

type Props = {
  company: TransportListing | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  )
}

function CarRentalPanel({ company, onClose }: Props) {
  if (!company) return null

  return (
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-20 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
        <h2 className="text-lg font-semibold text-white leading-tight">{company.name}</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          {company.address && <Row label="Address" value={company.address} />}
          {company.hours && <Row label="Hours" value={company.hours} />}
          {company.email && <Row label="Email" value={company.email} />}
          {company.phones?.length > 0 && <Row label="Phone" value={company.phones.join(', ')} />}
        </div>

        {company.vehicles?.length > 0 && (
          <div className="border-t border-slate-800 pt-4">
            <div className="text-sm font-semibold text-white mb-2">
              Vehicles offered ({company.vehicles.length})
            </div>
            <div className="space-y-2">
              {company.vehicles.map((v, i) => (
                <div key={i} className="rounded-lg border border-slate-700 bg-slate-800/50 p-2.5">
                  <div className="font-medium text-slate-100 text-sm">
                    {[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                  </div>
                  <div className="mt-0.5 flex gap-4 text-xs text-slate-400">
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
            className="block text-center bg-cyan-500 text-slate-900 font-medium rounded-lg py-2.5 hover:bg-cyan-400 transition-colors"
          >
            Call to Reserve
          </a>
        )}
      </div>
    </aside>
  )
}

export default CarRentalPanel