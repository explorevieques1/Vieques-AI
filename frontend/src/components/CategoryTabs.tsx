export type CategorySlug =
  | 'beaches'
  | 'restaurants'
  | 'activities'
  | 'stays'
  | 'services'
  | 'transportation'
  | 'essentials'

export const CATEGORIES: { slug: CategorySlug; label: string }[] = [
  { slug: 'beaches', label: 'Beaches' },
  { slug: 'restaurants', label: 'Restaurants' },
  { slug: 'activities', label: 'Activities' },
  { slug: 'stays', label: 'Stays' },
  { slug: 'services', label: 'Services' },
  { slug: 'transportation', label: 'Transportation' },
  { slug: 'essentials', label: 'Essentials' },
]

type Props = {
  active: CategorySlug | null
  onSelect: (slug: CategorySlug) => void
}

function CategoryTabs({ active, onSelect }: Props) {
  return (
    <nav className="flex gap-1 w-max">
      {CATEGORIES.map((c) => (
        <button
          key={c.slug}
          onClick={() => onSelect(c.slug)}
          className={`shrink-0 px-4 py-2 text-sm rounded-full transition-colors ${
            active === c.slug
              ? 'bg-cyan-500 text-slate-900 font-medium'
              : 'text-slate-300 hover:bg-slate-700'
          }`}
        >
          {c.label}
        </button>
      ))}
    </nav>
  )
}

export default CategoryTabs