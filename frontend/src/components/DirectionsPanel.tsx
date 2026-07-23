import { useState } from 'react'
import { fetchDirections, type DirectionsResult } from '../lib/api'

type Props = {
  onClose: () => void
  onRoute: (result: DirectionsResult | null) => void
}

function DirectionsPanel({ onClose, onRoute }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DirectionsResult | null>(null)

  const go = async () => {
    if (!from.trim() || !to.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetchDirections(from, to)
      setResult(r)
      onRoute(r)
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
      onRoute(null)
    } finally {
      setLoading(false)
    }
  }

  const mins = result ? Math.round(result.duration_s / 60) : 0
  const km = result ? (result.distance_m / 1000).toFixed(1) : '0'

  return (
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-30 bg-slate-900/97 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h2 className="text-base font-semibold text-white">Directions</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs text-slate-400">From</label>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="e.g. Maritza's Car Rental"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">To</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="e.g. Caracas Beach"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          onClick={go}
          disabled={loading || !from.trim() || !to.trim()}
          className="w-full py-2 text-sm rounded-lg bg-cyan-500 text-slate-900 font-medium hover:bg-cyan-400 disabled:opacity-40"
        >
          {loading ? 'Finding route…' : 'Get Directions'}
        </button>

        {error && <div className="text-xs text-red-300">{error}</div>}

        {result && (
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2">
            <div className="text-sm text-slate-200">
              <span className="text-white font-medium">{result.from.name}</span>
              <span className="text-slate-500"> → </span>
              <span className="text-white font-medium">{result.to.name}</span>
            </div>
            <div className="text-sm text-cyan-400 font-semibold">
              {mins} min · {km} km
            </div>
            <a
              href={result.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2 text-sm font-medium"
            >
              Open in Google Maps
            </a>
          </div>
        )}
      </div>
    </aside>
  )
}

export default DirectionsPanel