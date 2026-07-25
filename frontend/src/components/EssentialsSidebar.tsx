import { useEffect, useState } from 'react'
import { fetchEssentialCategories, type EssentialCategory } from '../lib/api'
import { ResponsivePanel } from './ui/ResponsivePanel'
import { Skeleton } from './ui/skeleton'

type Props = {
  activeSlug: string | null
  onSelect: (slug: string) => void
  onClose: () => void
}

function EssentialsSidebar({ activeSlug, onSelect, onClose }: Props) {
  const [categories, setCategories] = useState<EssentialCategory[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchEssentialCategories()
      .then((data) => !cancelled && setCategories(data))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const q = query.trim().toLowerCase()
  const shown = q
    ? (categories ?? []).filter((c) => c.label.toLowerCase().includes(q))
    : categories ?? []

  return (
    <ResponsivePanel side="left" title="Essentials" desktopWidth="sm:w-64" onClose={onClose}>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Essentials</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none px-2 -mr-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Everyday needs on the island</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search essentials…"
          className="w-full px-3 py-2 text-sm rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <nav className="flex-1 overflow-y-auto scroll-contain p-2">
        {error && <div className="px-2 py-2 text-xs text-destructive">{error}</div>}
        {categories === null && !error && (
          <div className="space-y-1.5 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
        {shown.map((c) => (
          <button
            key={c.slug}
            onClick={() => onSelect(c.slug)}
            className={`w-full text-left px-3 py-2 mb-0.5 text-sm rounded-md transition-colors ${
              activeSlug === c.slug
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
        {categories !== null && shown.length === 0 && !error && (
          <div className="px-3 py-2 text-xs text-muted-foreground">No categories match.</div>
        )}
      </nav>
    </ResponsivePanel>
  )
}

export default EssentialsSidebar
