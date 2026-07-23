import type { TransportListing } from '../lib/api'

type Props = {
  drivers: TransportListing[]
  loading: boolean
  onClose: () => void
}

function TaxiListPanel({ drivers, loading, onClose }: Props) {
  return (
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-20 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white">Taxis &amp; Públicos</h2>
          <p className="text-sm text-slate-400">{drivers.length} drivers available</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <div className="text-sm text-slate-400">Loading drivers…</div>}
        {!loading && drivers.length === 0 && (
          <div className="text-sm text-slate-500">No drivers listed yet.</div>
        )}
        {drivers.map((d) => (
          <div key={d.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="font-medium text-white">{d.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
              {d.metadata?.vehicle_type && (
                <span><span className="text-slate-500">Vehicle:</span> {d.metadata.vehicle_type}</span>
              )}
              {d.metadata?.passengers != null && (
                <span><span className="text-slate-500">Seats:</span> {d.metadata.passengers}</span>
              )}
              {d.metadata?.plate && (
                <span><span className="text-slate-500">Plate:</span> {d.metadata.plate}</span>
              )}
            </div>
            {d.phones?.length > 0 && (
              <a
                href={`tel:${d.phones[0].replace(/[^0-9+]/g, '')}`}
                className="mt-2 inline-block text-sm text-cyan-400 hover:text-cyan-300"
              >
                📞 {d.phones[0]}
              </a>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}

export default TaxiListPanel