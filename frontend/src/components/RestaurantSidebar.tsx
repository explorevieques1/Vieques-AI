import { useEffect, useState } from 'react'
import { fetchRestaurantCategories, type RestaurantCategory } from '../lib/api'

type Props = {
  activeSlug: string | null
  onSelect: (slug: string) => void
  onClose: () => void
}

function RestaurantSidebar({ activeSlug, onSelect, onClose }: Props) {
  const [categories, setCategories] = useState<RestaurantCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchRestaurantCategories()
      .then((data) => !cancelled && setCategories(data))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const q = query.trim().toLowerCase()
  const shown = q ? categories.filter((c) => c.label.toLowerCase().includes(q)) : categories

  return (
    <aside className="absolute top-0 left-0 h-full w-full sm:w-60 z-20 bg-slate-900/95 backdrop-blur border-r border-slate-700 shadow-2xl flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Restaurants</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none px-2 -mr-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-2">Pick a category to see places</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search restaurants…"
          className="w-full px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {error && <div className="px-2 py-2 text-xs text-red-300">{error}</div>}
        {shown.map((c) => (
          <button
            key={c.slug}
            onClick={() => onSelect(c.slug)}
            className={`w-full text-left px-3 py-2 mb-0.5 text-sm rounded-md transition-colors ${
              activeSlug === c.slug
                ? 'bg-cyan-500 text-slate-900 font-medium'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            {c.label}
          </button>
        ))}
        {shown.length === 0 && !error && (
          <div className="px-3 py-2 text-xs text-slate-500">No categories match.</div>
        )}
      </nav>
    </aside>
  )
}

export default RestaurantSidebar