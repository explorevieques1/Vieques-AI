/**
 * "Top" lists — the 5 listings restaurants, stays and tours open on.
 *
 * Order (see db/migrations/0052_featured_placements.sql):
 *   1. Paid sponsors: featured_placements rows that are 'active' and live now,
 *      in slot order (1 = first). Returned with `sponsored: true` so the app
 *      can label them — paid placement must be disclosed.
 *   2. Filled to `limit` by editorial rank: metadata->>'top_rank' (1 = first;
 *      a malformed value sorts as unranked rather than failing the query),
 *      then name.
 *
 * Deploy-order safe: code and migrations ship separately, so until 0052 is
 * applied the sponsor join is skipped and every row is `sponsored: false`.
 * Only a positive answer is cached — once the table exists it never re-checks.
 */

let tableReady = false
async function featuredTableExists(pool) {
  if (tableReady) return true
  const { rows } = await pool.query(
    `SELECT to_regclass('public.featured_placements') IS NOT NULL AS ok`
  )
  tableReady = rows[0]?.ok === true
  return tableReady
}

const RANK = `CASE WHEN l.metadata->>'top_rank' ~ '^[0-9]+$'
                   THEN (l.metadata->>'top_rank')::int END`

/**
 * @param {import('pg').Pool} pool
 * @param {{ kind: 'restaurant' | 'stay' | 'activity', table: string, columns: string, limit?: number }} opts
 *   `table` and `columns` are code constants (never request input) — they are
 *   interpolated; `kind` and `limit` are bound parameters.
 */
export async function topListings(pool, { kind, table, columns, limit = 5 }) {
  if (!(await featuredTableExists(pool))) {
    const { rows } = await pool.query(
      `SELECT ${columns}, false AS sponsored
         FROM ${table} l
        WHERE l.is_active = true
        ORDER BY ${RANK} NULLS LAST, l.name
        LIMIT $1`,
      [limit]
    )
    return rows
  }
  const { rows } = await pool.query(
    `SELECT ${columns}, (fp.slot IS NOT NULL) AS sponsored
       FROM ${table} l
       LEFT JOIN featured_placements fp
              ON fp.listing_kind = $2
             AND fp.listing_id = l.id
             AND fp.status = 'active'
             AND now() >= fp.starts_at AND now() < fp.ends_at
      WHERE l.is_active = true
      ORDER BY fp.slot NULLS LAST, ${RANK} NULLS LAST, l.name
      LIMIT $1`,
    [limit, kind]
  )
  return rows
}
