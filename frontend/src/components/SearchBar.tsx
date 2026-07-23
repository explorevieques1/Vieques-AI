import { useState } from 'react'
import type { Beach } from '../lib/api'

type Props = {
  items: Beach[]
  onSelect: (beach: Beach) => void
  placeholder?: string
}

function SearchBar({ items, onSelect, placeholder = 'Search…' }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const matches =
    q.length === 0
      ? []
      : items
          .filter(
            (b) =>
              b.name.toLowerCase().includes(q) ||
              (b.local_name?.toLowerCase().includes(q) ?? false) ||
              (b.type?.some((t) => t.toLowerCase().includes(q)) ?? false),
          )
          .slice(0, 8)

  const pick = (b: Beach) => {
    onSelect(b)
    setQuery(b.name)
    setOpen(false)
  }

  return (
    <div className="relative w-72">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-4 py-2 text-sm rounded-lg bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-lg"
      />
      {open && matches.length > 0 && (
        <ul className="absolute mt-1 w-full rounded-lg bg-slate-900/95 backdrop-blur border border-slate-700 shadow-xl overflow-hidden z-30">
          {matches.map((b) => (
            <li key={b.id}>
              <button
                onMouseDown={() => pick(b)}
                className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/70"
              >
                {b.name}
                {b.local_name && <span className="text-slate-500"> · {b.local_name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SearchBar