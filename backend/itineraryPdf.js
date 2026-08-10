/**
 * Itinerary PDF — the document, with no HTTP in it.
 *
 * Split from itineraries.js so that file stays about routes and this one
 * stays about layout. Takes an open PDFDocument and draws into it; the
 * caller owns the stream and the response.
 *
 * WHY THIS RESOLVES LIVE DATA
 * ---------------------------
 * The snapshot jsonb written when a place was added holds name, subtitle,
 * tags and coordinates — but NOT address, phone or hours. Those are the
 * fields that make a printed itinerary worth carrying, so the export reads
 * them from the source tables.
 *
 * The "don't fan out" warning in 0045_itineraries.sql is about the MAP
 * RENDER path, which runs constantly. This is a deliberate one-shot export
 * where a few hundred milliseconds is fine — and it is bounded at ten
 * queries (one per kind) regardless of how many places the trip holds.
 */

/**
 * Where each place kind's contact detail lives.
 *
 * Two shapes, and the difference matters:
 *   • Five LISTING tables carry phones text[] / address text / hours text.
 *   • Beaches, snorkel spots, kayak spots and trails are natural features
 *     with no phone and no street address. They get the nearest useful
 *     equivalent instead (access notes, entry notes, gate hours), so their
 *     PDF entries are still worth reading rather than blank.
 *
 * `ref` is always the primary key. parsePlaceId() produced it from the
 * namespaced place_id, so it is trusted to be the id and nothing else.
 */
export const RESOLVE = {
  restaurant: { table: 'restaurant_listings', columns: 'id, name, address, phones, hours' },
  stay:       { table: 'stay_listings',       columns: 'id, name, address, phones, hours' },
  activity:   { table: 'activity_listings',   columns: 'id, name, address, phones, hours' },
  service:    { table: 'service_listings',    columns: 'id, name, address, phones, hours' },
  transport:  { table: 'transport_listings',  columns: 'id, name, address, phones, hours' },
  essential:  { table: 'essential_listings',  columns: 'id, name, address, phones, hours' },
  // No phone/address columns exist on these — do not add them to the SELECT,
  // it will throw 42703 undefined_column.
  beach:      { table: 'beaches',      columns: 'id, name, access AS address, gate_hours AS hours' },
  snorkel:    { table: 'snorkel_spots', columns: 'id, name, entry_notes AS address' },
  kayak:      { table: 'kayak_spots',   columns: 'id, name, entry_notes AS address' },
  trail:      { table: 'trails',        columns: 'id, name, gate_hours AS hours' },
}

/**
 * Batch-load contact detail for a trip's items — ONE query per distinct kind.
 *
 * Returns a Map keyed by placeId. A kind with no RESOLVE entry, a query that
 * throws, or a row that no longer exists all resolve to absent, and the
 * caller falls back to the snapshot. A place deleted from its listing table
 * since it was added MUST NOT fail the export.
 */
export async function resolveItems(pool, items) {
  const byKind = new Map()
  for (const it of items) {
    if (!RESOLVE[it.placeKind]) continue
    if (!byKind.has(it.placeKind)) byKind.set(it.placeKind, [])
    byKind.get(it.placeKind).push(it)
  }

  const out = new Map()
  for (const [kind, group] of byKind) {
    const { table, columns } = RESOLVE[kind]
    try {
      const { rows } = await pool.query(
        `SELECT ${columns} FROM public.${table} WHERE id::text = ANY($1)`,
        [group.map((g) => g.placeRef)],
      )
      const byId = new Map(rows.map((r) => [String(r.id), r]))
      for (const g of group) {
        const row = byId.get(String(g.placeRef))
        if (row) out.set(g.placeId, row)
      }
    } catch {
      // Whole-kind failure degrades to snapshot-only for that kind rather
      // than 500-ing an export the user has paid for.
    }
  }
  return out
}

/** A filename that survives every filesystem. Always ends in .pdf. */
export function tripFilename(title) {
  const slug = String(title || 'trip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'trip'}.pdf`
}

/**
 * Drop characters the built-in Helvetica cannot encode.
 *
 * pdfkit's standard fonts are single-byte WinAnsi. Anything outside it — the
 * astral-plane emoji stored in snapshot.icon.emoji ('🍽️', '🏖️') and the
 * U+FE0F variation selector that trails them — is written byte-wise and comes
 * out as mojibake ('Ø<ß}þ') in the rendered PDF, not as the emoji.
 *
 * Keeps the Latin-1 range so genuinely encodable punctuation still renders
 * (the footer's '·' is WinAnsi and must survive). Embedding a TrueType emoji
 * font would be the way to actually SHOW them; this only guarantees we never
 * print garbage.
 */
function winAnsiOnly(s) {
  return String(s || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

/** First phone from a text[] column, or ''. */
function firstPhone(row) {
  return Array.isArray(row?.phones) && row.phones.length ? String(row.phones[0]) : ''
}

/** Day count, mirroring tripDayCount() on the client. 0 for a dateless trip. */
function dayCount(trip) {
  if (!trip.startDate || !trip.endDate) return 0
  return Math.round(
    (Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86400000,
  ) + 1
}

/** 'Sat, Mar 7' for day i, or '' when the trip has no dates. */
function dayLabel(trip, i) {
  if (!trip.startDate) return ''
  const d = new Date(Date.parse(`${trip.startDate}T00:00:00Z`) + i * 86400000)
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function dateRange(trip) {
  if (!trip.startDate || !trip.endDate) return 'No dates set'
  const fmt = (s) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
  return `${fmt(trip.startDate)} – ${fmt(trip.endDate)}`
}

/**
 * Draw the whole trip into an open PDFDocument.
 *
 * Bucketing MUST match TripDetailBody.tsx: an item whose dayIndex exceeds
 * the trip's CURRENT length falls into Unscheduled rather than vanishing,
 * because the trip was shortened after the place was added and deleting the
 * user's work to satisfy a date change is the wrong trade. If these two
 * disagree, the PDF and the screen show different itineraries.
 */
export function buildTripPdf(doc, trip, resolved) {
  const INK = '#0f172a'
  const MUTED = '#64748b'
  const RULE = '#e2e8f0'

  // --- Cover block ---
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text(trip.title, { lineGap: 2 })
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(11).fillColor(MUTED)
     .text(`${dateRange(trip)}  ·  ${trip.items.length} place${trip.items.length === 1 ? '' : 's'}`)
  doc.moveDown(0.4)
  doc.strokeColor(RULE).lineWidth(1)
     .moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
  doc.moveDown(0.8)

  // --- Buckets, mirroring TripDetailBody ---
  const days = dayCount(trip)
  const buckets = []
  for (let i = 0; i < days; i++) {
    buckets.push({ label: `Day ${i + 1}`, sub: dayLabel(trip, i), items: [] })
  }
  const unscheduled = { label: 'Unscheduled', sub: '', items: [] }
  for (const it of trip.items) {
    const i = it.dayIndex
    if (i === null || i === undefined || i >= days) unscheduled.items.push(it)
    else buckets[i].items.push(it)
  }
  if (unscheduled.items.length > 0 || days === 0) buckets.push(unscheduled)

  for (const b of buckets) {
    // Start a new page when a heading would land in the last inch.
    if (doc.y > doc.page.height - doc.page.margins.bottom - 72) doc.addPage()

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(b.label, { continued: !!b.sub })
    if (b.sub) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`   ${b.sub}`)
    doc.moveDown(0.4)

    if (b.items.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text('Nothing planned')
      doc.moveDown(0.8)
      continue
    }

    for (const it of b.items) {
      const snap = it.snapshot || {}
      const live = resolved.get(it.placeId) || {}
      const name = live.name || snap.name || 'Saved place'
      const emoji = winAnsiOnly(snap.icon?.emoji)
      const address = live.address || ''
      const phone = firstPhone(live)
      const hours = live.hours || ''

      if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage()

      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5)
         .text(`${emoji ? emoji + '  ' : ''}${name}`)

      if (snap.subtitle) {
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(snap.subtitle)
      }
      for (const [label, value] of [['Address', address], ['Phone', phone], ['Hours', hours]]) {
        if (value) {
          doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`${label}: ${value}`)
        }
      }
      if (typeof snap.latitude === 'number' && typeof snap.longitude === 'number') {
        const url = `https://www.google.com/maps/search/?api=1&query=${snap.latitude},${snap.longitude}`
        doc.font('Helvetica').fontSize(9).fillColor('#0369a1')
           .text('Open in Google Maps', { link: url, underline: true })
      }
      doc.moveDown(0.7)
    }
    doc.moveDown(0.3)
  }

  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
     .text('Generated by Vieques AI · explorevieques.org', doc.page.margins.left,
           doc.page.height - doc.page.margins.bottom - 12, { align: 'center' })
}
