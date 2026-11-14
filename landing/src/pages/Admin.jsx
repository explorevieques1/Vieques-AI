import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { adminConfig, adminList, adminCreate, adminUpdate } from '../lib/adminApi.js'
import './admin.css'

// Owner-only data-entry page. Every form is generated from the field config the
// backend sends (/api/admin/config), so adding a column there adds it here.

const LABELS = {
  phones: 'Phones (one per line)', images: 'Image URLs (one per line)',
  amenities: 'Amenities (one per line)', location_area: 'Area / barrio',
  tripadvisor_location_id: 'Tripadvisor ID', metadata: 'Schedule & fares',
}
const labelFor = (name) => LABELS[name] || name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

// DB value -> form value (strings for inputs, newline text for lists).
function toForm(field, v) {
  if (field.type === 'list') return (v || []).join('\n')
  // Nullable bool → '' (unknown) | 'true' | 'false', for a three-way select.
  if (field.type === 'bool') return field.nullable ? (v == null ? '' : String(v)) : !!v
  if (field.type === 'schedule') return v || {}
  return v ?? ''
}

function formFromRow(cfg, row) {
  const form = {}
  for (const field of cfg.fields) form[field.name] = toForm(field, row?.[field.name])
  form.category_ids = row?.category_ids || []
  form.category_slug = row?.category_slug || ''
  form.is_active = row ? row.is_active : true
  return form
}

/** Only the keys whose value changed — PATCH is partial. */
function diff(before, after) {
  const out = {}
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k]
  }
  return out
}

export default function Admin() {
  const [state, setState] = useState('loading') // loading | login | denied | error | ready
  const [error, setError] = useState('')
  const [config, setConfig] = useState(null)
  const [kind, setKind] = useState('transport')
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [gapsOnly, setGapsOnly] = useState(false)
  const [catFilter, setCatFilter] = useState('all') // 'all' | 'none' | category id
  const [selected, setSelected] = useState(null) // row id, 'new', or null

  // Keep this page out of search results.
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex, nofollow'
    document.head.appendChild(m)
    document.title = 'Admin · Explore Vieques'
    return () => m.remove()
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data } = await getSession()
      if (!data.session) return setState('login')
      try {
        setConfig(await adminConfig())
        setState('ready')
      } catch (e) {
        setError(e.message)
        setState(e.status === 403 ? 'denied' : 'error')
      }
    })()
  }, [])

  const loadRows = useCallback(async () => {
    try {
      setRows(await adminList(kind))
    } catch (e) {
      setError(e.message)
    }
  }, [kind])

  useEffect(() => {
    if (state !== 'ready') return
    setSelected(null)
    setRows([])
    setCatFilter('all')
    loadRows()
  }, [state, kind, loadRows])

  const cfg = config?.[kind]
  const catLabel = useMemo(() => {
    const m = new Map()
    for (const c of cfg?.categories || []) m.set(c.id, c.label)
    return m
  }, [cfg])

  // A row's category ids, whichever way the table stores them (stays keep a
  // single slug column; every other kind uses a join table).
  const slugToId = useMemo(() => new Map((cfg?.categories || []).map((c) => [c.slug, c.id])), [cfg])
  const catsOf = useCallback(
    (r) => (r.category_slug ? [slugToId.get(r.category_slug)].filter(Boolean) : r.category_ids),
    [slugToId],
  )
  const catCounts = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const ids = catsOf(r)
      if (!ids.length) m.set('none', (m.get('none') || 0) + 1)
      for (const id of ids) m.set(id, (m.get(id) || 0) + 1)
    }
    return m
  }, [rows, catsOf])

  const visible = rows.filter((r) => {
    if (gapsOnly && !r.missing.length) return false
    if (catFilter === 'none' && catsOf(r).length) return false
    if (catFilter !== 'all' && catFilter !== 'none' && !catsOf(r).includes(catFilter)) return false
    return !query || r.name.toLowerCase().includes(query.toLowerCase())
  })
  const complete = rows.filter((r) => !r.missing.length).length

  if (state === 'loading') return <div className="adm-shell adm-center">Loading…</div>
  if (state === 'login')
    return (
      <div className="adm-shell adm-center">
        <p>Sign in first.</p>
        <Link className="adm-btn adm-btn-primary" to="/login">Log in</Link>
      </div>
    )
  if (state === 'denied')
    return <div className="adm-shell adm-center">This account isn’t on the admin list (ADMIN_USER_IDS).</div>
  if (state === 'error') return <div className="adm-shell adm-center">Couldn’t reach the API: {error}</div>

  const row = selected && selected !== 'new' ? rows.find((r) => r.id === selected) : null

  return (
    <div className="adm-shell">
      <header className="adm-top">
        <h1>Data entry</h1>
        <nav className="adm-seg" aria-label="Table">
          {Object.entries(config).map(([key, k]) => (
            <button key={key} className={key === kind ? 'is-on' : ''} onClick={() => setKind(key)}>
              {k.label}
            </button>
          ))}
        </nav>
      </header>

      <div className={`adm-main ${selected ? 'has-editor' : ''}`}>
        <section className="adm-list">
          <div className="adm-list-tools">
            <input
              type="search" placeholder={`Search ${cfg.label.toLowerCase()}…`}
              value={query} onChange={(e) => setQuery(e.target.value)}
            />
            <button className="adm-btn adm-btn-primary" onClick={() => setSelected('new')}>+ New</button>
          </div>
          <div className="adm-catbar" role="group" aria-label="Filter by category">
            <button className={`adm-chip ${catFilter === 'all' ? 'is-on' : ''}`} onClick={() => setCatFilter('all')}>
              All <span>{rows.length}</span>
            </button>
            {cfg.categories.map((c) => (
              <button
                key={c.id}
                className={`adm-chip ${catFilter === c.id ? 'is-on' : ''} ${catCounts.get(c.id) ? '' : 'is-empty'}`}
                onClick={() => setCatFilter(c.id)}
              >
                {c.label} <span>{catCounts.get(c.id) || 0}</span>
              </button>
            ))}
            {catCounts.get('none') > 0 && (
              <button className={`adm-chip ${catFilter === 'none' ? 'is-on' : ''}`} onClick={() => setCatFilter('none')}>
                No category <span>{catCounts.get('none')}</span>
              </button>
            )}
          </div>
          <div className="adm-list-meta">
            <span>{complete}/{rows.length} complete</span>
            <label><input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} /> Gaps only</label>
          </div>
          <ul>
            {visible.map((r) => (
              <li key={r.id}>
                <button className={`adm-row ${selected === r.id ? 'is-on' : ''}`} onClick={() => setSelected(r.id)}>
                  <span className="adm-row-name">
                    {r.name}
                    {!r.is_active && <em className="adm-tag">hidden</em>}
                  </span>
                  <span className="adm-row-sub">
                    {(r.category_ids.map((id) => catLabel.get(id)).filter(Boolean).join(' · ')) || r.category_slug || 'no category'}
                  </span>
                  {r.missing.length > 0 && <span className="adm-gaps">missing: {r.missing.join(', ')}</span>}
                </button>
              </li>
            ))}
            {!visible.length && <li className="adm-empty">Nothing here.</li>}
          </ul>
        </section>

        {selected && (
          <Editor
            key={`${kind}-${selected}`}
            kind={kind} cfg={cfg} row={row}
            presetCat={typeof catFilter === 'number' ? catFilter : null}
            onClose={() => setSelected(null)}
            onSaved={(saved) => {
              setRows((prev) => {
                const rest = prev.filter((r) => r.id !== saved.id)
                return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name))
              })
              setSelected(saved.id)
            }}
          />
        )}
      </div>
    </div>
  )
}

function Editor({ kind, cfg, row, presetCat, onClose, onSaved }) {
  const initial = useMemo(() => {
    const form = formFromRow(cfg, row)
    // New listing while a category filter is on → start in that category.
    if (!row && presetCat != null) {
      if (cfg.categoryMode === 'many') form.category_ids = [presetCat]
      else form.category_slug = cfg.categories.find((c) => c.id === presetCat)?.slug || ''
    }
    return form
    // presetCat only matters at creation; don't re-seed if the filter changes mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, row])
  const [form, setForm] = useState(initial)
  const [status, setStatus] = useState({ kind: 'idle', msg: '' })
  const changes = diff(initial, form)
  const dirty = Object.keys(changes).length > 0
  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    setStatus((s) => (s.kind === 'saving' ? s : { kind: 'idle', msg: '' }))
  }

  // After a save the server returns its cleaned-up row (trimmed text, lists as
  // arrays, '18.10' → 18.1). Re-seed from it so the form isn't "dirty" forever.
  useEffect(() => setForm(initial), [initial])

  const save = useCallback(async () => {
    setStatus({ kind: 'saving', msg: 'Saving…' })
    try {
      const saved = row ? await adminUpdate(kind, row.id, changes) : await adminCreate(kind, form)
      setStatus({ kind: 'ok', msg: 'Saved' })
      onSaved(saved)
    } catch (e) {
      setStatus({ kind: 'err', msg: e.message })
    }
  }, [kind, row, changes, form, onSaved])

  // ⌘S / Ctrl+S saves — data entry is mostly keyboard.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty || !row) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, row, save])

  const toggleCat = (id) =>
    set('category_ids', form.category_ids.includes(id) ? form.category_ids.filter((x) => x !== id) : [...form.category_ids, id])

  return (
    <section className="adm-editor" aria-label="Edit listing">
      <div className="adm-editor-head">
        <button className="adm-btn" onClick={onClose}>← Back</button>
        <h2>{row ? row.name : `New ${cfg.label.toLowerCase()} listing`}</h2>
        <label className="adm-switch">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Visible in app
        </label>
      </div>

      <fieldset className="adm-cats">
        <legend>Category</legend>
        {cfg.categoryMode === 'many' ? (
          cfg.categories.map((c) => (
            <button
              type="button" key={c.id}
              className={`adm-chip ${form.category_ids.includes(c.id) ? 'is-on' : ''}`}
              onClick={() => toggleCat(c.id)}
            >
              {c.label}
            </button>
          ))
        ) : (
          <select value={form.category_slug} onChange={(e) => set('category_slug', e.target.value)}>
            <option value="">—</option>
            {cfg.categories.map((c) => <option key={c.id} value={c.slug}>{c.label}</option>)}
          </select>
        )}
      </fieldset>

      <div className="adm-grid">
        {cfg.fields.map((field) => (
          <Field
            key={field.name} field={field} value={form[field.name]}
            missing={row?.missing.includes(field.name)}
            onChange={(v) => set(field.name, v)}
          />
        ))}
      </div>

      <footer className="adm-savebar">
        <span className={`adm-status is-${status.kind}`}>
          {status.msg || (dirty ? `${Object.keys(changes).length} unsaved change(s)` : 'No changes')}
        </span>
        <button className="adm-btn adm-btn-primary" disabled={status.kind === 'saving' || (row && !dirty)} onClick={save}>
          {row ? 'Save' : 'Create'} <kbd>⌘S</kbd>
        </button>
      </footer>
    </section>
  )
}

function Field({ field, value, missing, onChange }) {
  const id = `f-${field.name}`
  const wide = ['longtext', 'list', 'schedule'].includes(field.type)
  let input
  switch (field.type) {
    case 'longtext':
    case 'list':
      input = <textarea id={id} rows={field.type === 'list' ? 3 : 4} value={value} onChange={(e) => onChange(e.target.value)} />
      break
    case 'bool':
      input = field.nullable ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Unknown</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      )
      break
    case 'schedule':
      input = <ScheduleEditor value={value} onChange={onChange} />
      break
    case 'int': case 'number': case 'lat': case 'lng':
      input = (
        <input
          id={id} inputMode="decimal" value={value}
          placeholder={field.type === 'lat' ? '18.1…' : field.type === 'lng' ? '-65.4…' : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
      break
    default:
      input = (
        <input
          id={id} type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      )
  }
  return (
    <div className={`adm-field ${wide ? 'is-wide' : ''} ${missing ? 'is-missing' : ''}`}>
      <label htmlFor={id}>
        {labelFor(field.name)}{field.required && ' *'}
        {missing && <span className="adm-dot" aria-label="missing" />}
      </label>
      {input}
    </div>
  )
}

// Free text while typing; parsed into ['06:30', …] on blur, so a trailing comma
// isn't eaten mid-keystroke.
function TimesInput({ times, onChange }) {
  const [text, setText] = useState(times.join(', '))
  return (
    <input
      placeholder="Times, comma-separated: 06:30, 09:00, 13:00"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text.split(',').map((t) => t.trim()).filter(Boolean)
        setText(parsed.join(', '))
        onChange(parsed)
      }}
    />
  )
}

// Structured editor for transport metadata:
//   { schedule: [{ route, days, times: ['06:30', …] }], fares, note, verified_at, …other keys kept }
function ScheduleEditor({ value, onChange }) {
  const meta = value || {}
  const schedule = meta.schedule || []
  const update = (patch) => onChange({ ...meta, ...patch })
  const setLeg = (i, patch) => update({ schedule: schedule.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  return (
    <div className="adm-sched">
      {schedule.map((leg, i) => (
        <div className="adm-sched-leg" key={i}>
          <input placeholder="Route, e.g. Ceiba → Vieques" value={leg.route || ''} onChange={(e) => setLeg(i, { route: e.target.value })} />
          <input placeholder="Days, e.g. Mon–Fri" value={leg.days || ''} onChange={(e) => setLeg(i, { days: e.target.value })} />
          <TimesInput times={leg.times || []} onChange={(times) => setLeg(i, { times })} />
          <button type="button" className="adm-btn" onClick={() => update({ schedule: schedule.filter((_, j) => j !== i) })}>Remove</button>
        </div>
      ))}
      <button type="button" className="adm-btn" onClick={() => update({ schedule: [...schedule, { route: '', days: '', times: [] }] })}>
        + Add departure row
      </button>
      <div className="adm-sched-extra">
        <label>Fares<input value={meta.fares || ''} onChange={(e) => update({ fares: e.target.value })} placeholder="$2 resident / $2 visitor…" /></label>
        <label>Note<input value={meta.note || ''} onChange={(e) => update({ note: e.target.value })} placeholder="Buy tickets online; arrive 1h early" /></label>
        <label>Last verified<input type="date" value={meta.verified_at || ''} onChange={(e) => update({ verified_at: e.target.value })} /></label>
      </div>
    </div>
  )
}
