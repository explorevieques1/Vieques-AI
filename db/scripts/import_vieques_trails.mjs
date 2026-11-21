#!/usr/bin/env node
// ============================================================================
//  import_vieques_trails.mjs — build an insert-ready GeoJSON of Vieques trails
//  for public.import_trails().
//
//  Sources, in priority order:
//    1. USFWS Vieques NWR trail inventory (resource-grade GPS, 50 cm–1 m, mapped
//       2022) — FWS_HQ_Trails_Cycle_3_Public_View, layer 1. Authoritative for
//       everything inside the refuge. Sections (T201-001/002/003) are chained
//       into one LineString per trail.
//    2. OpenStreetMap (Overpass) — only for named trails OUTSIDE the refuge
//       dataset (Cayo de Tierra, the Veredas near Esperanza).
//
//  Cross-check done 2026-11-21: where both cover the same trail, FWS vertices
//  sit within a median of 1–9 m of OSM (see docs in the session log), so the
//  two sources agree; FWS fills the trails OSM lacks entirely.
//
//  Usage:
//    node db/scripts/import_vieques_trails.mjs --dry-run
//    node db/scripts/import_vieques_trails.mjs            # writes data/trails/vieques-trails.geojson
//
//  Never touches the database. Load with:
//    SELECT public.import_trails('<file contents>'::jsonb);
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const FWS_URL =
  'https://services.arcgis.com/QVENGdaPbd4LUkLV/ArcGIS/rest/services/FWS_HQ_Trails_Cycle_3_Public_View/FeatureServer/1/query'
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter']
const BBOX = '18.08,-65.60,18.17,-65.24'
const UA = 'ExploreViequesTrailImport/1.0'
// Survey GPS is 0.5–1 m; the default 1 m simplify would discard real curves.
// 0.000002° ≈ 0.2 m only strips redundant collinear points (see migration 0058).
const SIMPLIFY_DEG = 0.000002
const JOIN_TOL_M = 12 // endpoints closer than this are the same junction

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'data/trails/vieques-trails.geojson'

// Curated metadata, keyed by the FWS trail number (TRNUMBER). Difficulty and
// the "published" lengths come from the FWS visitor page; anything not stated
// there stays NULL rather than guessed.
const FWS_META = {
  T201: { slug: 'cerro-playuela', name: 'Cerro Playuela Trail', difficulty: 'moderate', pub: 0.95, route_type: 'point_to_point', region: 'South Coast', description: 'Climbs from mangrove into dry forest above Playuela Beach. Starts at the Playuela Trail parking area.' },
  T302: { slug: 'playuela-beach', name: 'Playuela Beach Trail', difficulty: 'easy', pub: 0.42, route_type: 'point_to_point', region: 'South Coast', description: 'Easy walk from the Playuela parking area to Playuela Beach.' },
  T205: { slug: 'tapon-bay', name: 'Tapon Bay Trail', difficulty: 'moderate', pub: 0.85, region: 'South Coast', description: 'Runs through mangrove from Caracas Beach parking.' },
  T202: { slug: 'el-pobre', name: 'Los Pobres Trail', local_name: 'El Pobre', difficulty: 'easy', pub: 0.5, route_type: 'loop', region: 'West', description: 'Loop that starts and ends at the Playa El Pobre parking area.' },
  T203: { slug: 'puerto-mosquito-trail', name: 'Puerto Mosquito Trail', pub: 0.65, region: 'South Coast', description: 'Trail beside the Puerto Mosquito bioluminescent bay.' },
  T304: { slug: 'puerto-mosquito-observation-deck', name: 'Puerto Mosquito Observation Deck Trail', region: 'South Coast', description: 'Short walk to the bay observation deck.' },
  T301: { slug: 'laguna-kiani-boardwalk', name: 'Laguna Kiani Boardwalk', surface: 'boardwalk', region: 'South Coast', description: 'Short boardwalk through the Kiani lagoon mangroves. The FWS web page prints 0.89 mi, but the surveyed line is 0.05 mi.' },
  T204: { slug: 'punta-galinde', name: 'Punta Galinde Trail', route_type: 'loop', region: 'East', description: 'Short loop from Punta Galinde road.' },
  // This row was seeded by hand in 0026 with a line that is actually part of the
  // Cerro Playuela trail (verified 2026-11-21: within 4 m of FWS T201-002, ~1 km
  // from the real lighthouse). `extra` re-supplies its hand-written fields,
  // because import_trails() overwrites every column on a slug match.
  T303: { slug: 'puerto-ferro-lighthouse', name: 'Puerto Ferro Lighthouse Trail', difficulty: 'easy', pub: 0.04, route_type: 'point_to_point', region: 'South / Wildlife Refuge',
    description: 'A short dirt track through dry coastal scrub out to the ruins of the Faro de Puerto Ferro, the 1896 Spanish lighthouse on the headland above Puerto Ferro. Open views over the south coast and the bioluminescent bay at the far end. Flat apart from one short rise onto the point.',
    extra: { local_name: 'Faro de Puerto Ferro', elevation_gain_m: 25, est_minutes: 20, best_time: 'Early morning — the headland has almost no shade after 10am', shade: 'none', dogs_allowed: false, gate_hours: 'Refuge gates close at sunset', warning: 'The lighthouse ruin is unstable — stay outside the fence. No water, no shade, no cell service on the headland.' } },
  T300: { slug: 'berdiales-beach', name: 'Berdiales Beach Trail', region: 'South Coast', description: 'Short spur to Berdiales Beach from the Puerto Ferro Lighthouse Trail.' },
  T200: { slug: 'cerro-caracas', name: 'Cerro Caracas Trail', region: 'South Coast', description: 'Links the Playuela Beach and Caracas Beach trails.' },
  T100: { slug: 'caracas-beach', name: 'Caracas Beach Trail', region: 'South Coast', description: 'Trail onto Caracas Beach from the Cerro Caracas Trail.' },
}
const SURFACE = { 'Native Material': 'native', 'Imported Loose Material': 'gravel', Other: 'boardwalk' }

// OSM-only trails (outside the FWS refuge dataset), keyed by exact OSM name.
const OSM_META = {
  'Cayo de Tierra from Esperanza Pier': { slug: 'cayo-de-tierra', name: 'Cayo de Tierra Trail', region: 'Esperanza', description: 'Walk from the Esperanza pier to the Cayo de Tierra lookout.' },
  'Vereda Novillo': { slug: 'vereda-novillo', region: 'Esperanza' },
  'Vereda Ensenada del Pirata': { slug: 'vereda-ensenada-del-pirata', region: 'Esperanza' },
  'Vereda Conector': { slug: 'vereda-conector', region: 'Esperanza' },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const KX = Math.cos((18.11 * Math.PI) / 180) * 111320, KY = 110574
const dist = (a, b) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY)
const lengthM = (c) => c.slice(1).reduce((s, p, i) => s + dist(c[i], p), 0)

// Chain segments whose endpoints meet within JOIN_TOL_M. `order` biases the
// starting segment (first element) so section 001 leads. Unattached segments
// are returned as further lines — nothing is dropped.
function chain(segs) {
  const left = segs.map((s) => s.slice())
  const lines = []
  while (left.length) {
    let c = left.shift()
    for (let grew = true; grew; ) {
      grew = false
      for (let i = 0; i < left.length; i++) {
        const s = left[i], h = c[0], t = c[c.length - 1]
        const sh = s[0], st = s[s.length - 1]
        const opts = [
          [dist(t, sh), () => c.concat(s)],
          [dist(t, st), () => c.concat(s.slice().reverse())],
          [dist(h, st), () => s.concat(c)],
          [dist(h, sh), () => s.slice().reverse().concat(c)],
        ].sort((a, b) => a[0] - b[0])[0]
        if (opts[0] <= JOIN_TOL_M) { c = opts[1](); left.splice(i, 1); grew = true; break }
      }
    }
    lines.push(c)
  }
  return lines
}

async function getJson(urls, init) {
  for (let i = 0; i < 6; i++) {
    const url = urls[i % urls.length]
    try {
      const res = await fetch(typeof url === 'function' ? url() : url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(90_000) })
      if (res.ok) return await res.json()
      console.error(`${url} -> HTTP ${res.status}, retrying`)
    } catch (e) { console.error(`${url} -> ${e.message}, retrying`) }
    await sleep(4000 * 2 ** i)
  }
  throw new Error('source unavailable: ' + urls[0])
}

// ---- 1. FWS ---------------------------------------------------------------
const fwsQs = new URLSearchParams({ where: "ORGCODE='41528'", outFields: '*', outSR: '4326', f: 'geojson' })
const fws = (await getJson([`${FWS_URL}?${fwsQs}`])).features
if (fws.length < 10) throw new Error(`expected ~20 FWS features, got ${fws.length}`)

const byTrail = new Map()
for (const f of fws) {
  const id = f.properties.TRNUMBER
  const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
  if (!byTrail.has(id)) byTrail.set(id, { props: f.properties, sections: [] })
  byTrail.get(id).sections.push({ sec: f.properties.SECNUMBER, parts })
}

const features = []
const report = []
const push = (slug, props, coords, src) => {
  features.push({ type: 'Feature', properties: { slug, ...props }, geometry: { type: 'LineString', coordinates: coords } })
  report.push({ slug, source: src, points: coords.length, measured_mi: +(lengthM(coords) / 1609.344).toFixed(2), published_mi: props.published_distance_mi ?? '', active: props.is_active })
}

for (const [id, t] of [...byTrail].sort()) {
  const m = FWS_META[id]
  if (!m) { console.error(`no META for FWS trail ${id} (${t.props.TRNAME}) — skipped`); continue }
  const segs = t.sections.sort((a, b) => a.sec.localeCompare(b.sec)).flatMap((s) => s.parts)
  const lines = chain(segs)
  const surface = m.surface ?? SURFACE[t.props.TRSURFACE] ?? null
  lines.forEach((coords, i) => {
    push(m.slug + (i ? `-${i + 1}` : ''), {
      name: m.name + (i ? ` (branch ${i + 1})` : ''),
      local_name: m.local_name ?? null, difficulty: i ? null : m.difficulty ?? null, surface,
      route_type: i ? null : m.route_type ?? null, region: m.region ?? null, in_wildlife_refuge: true,
      description: i ? `Branch of the ${m.name} network; it joins the main trail partway along.` : m.description ?? null,
      published_distance_mi: i ? null : m.pub ?? null,
      source: 'USFWS', source_url: 'https://www.fws.gov/refuge/vieques/visit-us/trails',
      ...(i ? {} : m.extra ?? {}),
      // A trail that forks can't be one LineString, so each branch is its own
      // row. They join the main line at a T-junction (checked 2026-11-21), so
      // they are real trail, not stray fragments: all stay visible.
      is_active: true,
    }, coords, 'FWS')
  })
}

// ---- 2. OSM (non-refuge trails only) -----------------------------------------
const q = `[out:json][timeout:60];way["highway"~"^(path|footway)$"](${BBOX});out tags geom;`
const osm = (await getJson(OVERPASS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) })).elements
const osmByName = new Map()
for (const w of osm) {
  const n = w.tags?.name
  if (!n || !OSM_META[n] || !w.geometry) continue
  if (!osmByName.has(n)) osmByName.set(n, [])
  osmByName.get(n).push(w.geometry.map((p) => [p.lon, p.lat]))
}
for (const [name, segs] of osmByName) {
  const m = OSM_META[name]
  chain(segs.sort((a, b) => lengthM(b) - lengthM(a))).forEach((coords, i) => {
    push(m.slug + (i ? `-${i + 1}` : ''), {
      name: (m.name ?? name) + (i ? ` (branch ${i + 1})` : ''), difficulty: null, surface: 'native', route_type: null,
      region: m.region ?? null, in_wildlife_refuge: false, description: i ? null : m.description ?? null,
      published_distance_mi: null, source: 'OSM', source_url: 'https://www.openstreetmap.org/copyright', is_active: true,
    }, coords, 'OSM')
  })
}

console.table(report)
console.log(`${features.length} features (${fws.length} FWS sections, ${osmByName.size} OSM trails)`)
if (DRY) console.log('--dry-run: nothing written')
else {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', simplify_deg: SIMPLIFY_DEG, features }))
  console.log(`wrote ${OUT}`)
}
