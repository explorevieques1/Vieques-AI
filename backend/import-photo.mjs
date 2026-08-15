#!/usr/bin/env node
/**
 * import-photo — put one photo on one listing.
 *
 *   node cli/import-photo.mjs <file> <kind> <name-or-id> [--credit "..."] \
 *                             [--alt "..."] [--caption "..."] [--order N]
 *
 *   node cli/import-photo.mjs photos/navio.JPG beaches "Playa Navio"
 *   node cli/import-photo.mjs photos/elblok.jpg stay_listings 3 --credit "El Blok"
 *
 * What it does, in order:
 *   1. resize to 2000px wide, JPEG q82  (a 4MB camera file becomes ~350KB)
 *   2. upload to the place-photos bucket as <kind>/<slug>-NN.jpg
 *   3. insert a row in public.photos pointing at the listing
 *
 * Re-running with the same file overwrites the object and updates the row
 * (storage_path is the natural key), so it is safe to repeat.
 *
 * WHY THE UPLOAD USES A TEMPORARY POLICY
 * --------------------------------------
 * backend/.env has no SUPABASE_SERVICE_ROLE_KEY, and the bucket deliberately
 * has no standing INSERT policy — nothing in the browser should ever be able
 * to write to it. So the script opens a narrow anon-INSERT policy scoped to
 * this one bucket, uploads, and drops it again in a finally block. If you add
 * a service-role key to .env, it is used instead and no policy is touched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pg from 'pg'

const ROOT = path.resolve(import.meta.dirname, '..')
const BUCKET = 'place-photos'
const MAX_W = 2000
const QUALITY = 82

const KINDS = [
  'beaches', 'stay_listings', 'activity_listings', 'restaurant_listings',
  'essential_listings', 'service_listings', 'transport_listings',
  'snorkel_spots', 'kayak_spots', 'trails',
]

function env() {
  const raw = fs.readFileSync(path.join(import.meta.dirname, '.env'), 'utf8')
  return Object.fromEntries(
    raw.split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const args = process.argv.slice(2)
const flags = {}
const pos = []
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i]
  else pos.push(args[i])
}
const [file, kind, target] = pos

if (!file || !kind || !target) {
  console.error('usage: import-photo <file> <kind> <name-or-id> [--credit ..] [--alt ..] [--caption ..] [--order N]')
  process.exit(1)
}
if (!KINDS.includes(kind)) {
  console.error(`kind must be one of:\n  ${KINDS.join('\n  ')}`)
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`no such file: ${file}`)
  process.exit(1)
}

const E = env()
const pool = new pg.Pool({ connectionString: E.DATABASE_URL })

// trails.id is uuid; everything else is bigint. Comparing as text covers both.
const idCol = kind === 'trails' ? 'id::text' : 'id::text'
const nameCol = 'name'

const run = async () => {
  // ---- 1. resolve the listing -------------------------------------------
  const isId = /^\d+$/.test(target) || /^[0-9a-f-]{36}$/i.test(target)
  const { rows: found } = await pool.query(
    isId
      ? `SELECT ${idCol} AS id, ${nameCol} AS name FROM ${kind} WHERE ${idCol} = $1`
      : `SELECT ${idCol} AS id, ${nameCol} AS name FROM ${kind}
          WHERE ${nameCol} ILIKE '%' || $1 || '%' ORDER BY length(${nameCol}) LIMIT 5`,
    [target],
  )
  if (!found.length) throw new Error(`no ${kind} matching "${target}"`)
  if (found.length > 1) {
    throw new Error(
      `"${target}" is ambiguous in ${kind}:\n  ` +
      found.map((r) => `${r.id}  ${r.name}`).join('\n  ') +
      `\nRe-run with the id.`,
    )
  }
  const place = found[0]

  // ---- 2. resize ---------------------------------------------------------
  const order = Number(flags.order ?? 0)
  const base = `${slug(place.name)}-${String(order + 1).padStart(2, '0')}.jpg`
  const key = `${kind}/${base}`
  const tmp = path.join('/tmp', base)

  execFileSync('convert', [
    file, '-auto-orient', '-resize', `${MAX_W}>`,
    '-quality', String(QUALITY), '-interlace', 'Plane', '-strip', tmp,
  ])
  const buf = fs.readFileSync(tmp)
  const [w, h] = execFileSync('identify', ['-format', '%w %h', tmp]).toString().split(' ').map(Number)
  const kb = (buf.length / 1024).toFixed(0)

  // ---- 3. upload ---------------------------------------------------------
  const serviceKey = E.SUPABASE_SERVICE_ROLE_KEY
  const authKey = serviceKey || E.SUPABASE_ANON_KEY
  let openedPolicy = false

  try {
    if (!serviceKey) {
      await pool.query(`
        DROP POLICY IF EXISTS place_photos_tmp_upload ON storage.objects;
        CREATE POLICY place_photos_tmp_upload ON storage.objects
          FOR INSERT TO anon, authenticated
          WITH CHECK (bucket_id = '${BUCKET}');`)
      openedPolicy = true
    }

    const res = await fetch(`${E.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authKey}`,
        apikey: authKey,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buf,
    })
    if (!res.ok) throw new Error(`upload failed ${res.status}: ${await res.text()}`)
  } finally {
    if (openedPolicy) {
      await pool.query('DROP POLICY IF EXISTS place_photos_tmp_upload ON storage.objects')
    }
  }

  const url = `${E.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`

  // ---- 4. row ------------------------------------------------------------
  // ON CONFLICT must repeat the partial index's WHERE clause to match it.
  const { rows: [row] } = await pool.query(
    `INSERT INTO photos
       (place_kind, place_ref, url, storage_path, credit, alt_text, caption,
        sort_order, width_px, height_px, source_frame)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (storage_path) WHERE storage_path IS NOT NULL DO UPDATE
       SET url = EXCLUDED.url, place_ref = EXCLUDED.place_ref,
           credit = EXCLUDED.credit, alt_text = EXCLUDED.alt_text,
           caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order,
           width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px,
           is_active = true
     RETURNING id`,
    [kind, place.id, url, key, flags.credit ?? null, flags.alt ?? null,
     flags.caption ?? null, order, w, h, path.basename(file)],
  )

  fs.unlinkSync(tmp)
  console.log(`✓ ${place.name}  (${kind} #${place.id})`)
  console.log(`  ${w}×${h}, ${kb}KB  →  photos #${row.id}`)
  console.log(`  ${url}`)
}

run()
  .catch((e) => { console.error('✗', e.message); process.exitCode = 1 })
  .finally(() => pool.end())
