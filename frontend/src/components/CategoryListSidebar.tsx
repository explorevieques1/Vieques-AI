import { useEffect, useState } from 'react'
import { ResponsivePanel } from './ui/ResponsivePanel'
import { Skeleton } from './ui/skeleton'

type Item = { slug: string; label: string }

type Props = {
  title: string
  subtitle: string
  searchPlaceholder: string
  fetchItems: () => Promise<Item[]>
  activeSlug: string | null
  onSelect: (slug: string) => void
  onClose: () => void
}

function CategoryListSidebar({
  title,
  subtitle,
  searchPlaceholder,
  fetchItems,
  activeSlug,
  onSelect,
  onClose,
}: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchItems()
      .then((data) => !cancelled && setItems(data))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  const q = query.trim().toLowerCase()
  const shown = q
    ? (items ?? []).filter((c) => c.label.toLowerCase().includes(q))
    : items ?? []

  return (
    <ResponsivePanel side="left" title={title} desktopWidth="sm:w-64" onClose={onClose}>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none px-2 -mr-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full px-3 py-2 text-sm rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <nav className="flex-1 overflow-y-auto scroll-contain p-2">
        {error && <div className="px-2 py-2 text-xs text-destructive">{error}</div>}
        {items === null && !error && (
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
        {items !== null && shown.length === 0 && !error && (
          <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
        )}
      </nav>
    </ResponsivePanel>
  )
}

export default CategoryListSidebar
