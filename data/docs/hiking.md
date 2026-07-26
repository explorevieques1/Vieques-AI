# Hiking Trails Feature — Explore Vieques

Context doc for adding hiking trails to the Explore Vieques frontend app.

## Goal

Display Vieques hiking trails on the map in the Explore Vieques app. Trails
are rendered as dashed polylines over a basemap, each clickable to show name,
length, difficulty, and surface.

## Stack

- **Frontend map**: MapLibre GL JS + MapTiler (free tier) basemap tiles.
  MapLibre is the open-source engine; MapTiler tiles are swappable for
  OpenFreeMap later if we hit quota. Trails render as a GeoJSON source +
  `line` layer.
- **Backend / storage**: Supabase (PostgreSQL + PostGIS). Trail geometry
  stored as `geometry(LineString, 4326)`.
- **Coordinate system**: WGS84 / EPSG:4326 throughout — `[lng, lat]` order
  (GeoJSON convention; lng first).

## Data model

Trails are LineStrings: an ordered array of `[lng, lat]` vertices plus
metadata. Supabase table:

```sql
create extension if not exists postgis;

create table trails (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  difficulty text,          -- easy | moderate | hard
  surface text,             -- native | boardwalk | gravel
  distance_km numeric,
  source text,              -- 'USFWS' or 'OSM'
  description text,
  geom geometry(LineString, 4326)
);
create index trails_geom_idx on trails using gist (geom);
```

Fetch back out as GeoJSON via an RPC (`get_trails`) that wraps rows in a
FeatureCollection using `ST_AsGeoJSON(geom)` — feeds straight into MapLibre.

## Data sources

Two sources, in priority order:

1. **USFWS FWSTrails MapServer** (authoritative line geometry).
   `https://gis.fws.gov/arcgis/rest/services/FWSTrails/MapServer/0/query`
   Query by bounding box around Vieques:
   `geometry=-65.60,18.08,-65.24,18.17&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=geojson`
   Returns GeoJSON FeatureCollection. Fields: `TRLNAME`, `MILES`,
   `TRLSURFACE`, `TRLCONDITION`, `TRLUSE`, `ORGNAME`. Caveat: national
   inventory last refreshed ~2012, so it may lag the current refuge webpage.

2. **OpenStreetMap via Overpass** (fill gaps / newer trails). Query
   `highway=path|footway` within the Vieques bbox. Good coverage but
   `properties` often empty — needs enrichment (see cleanup below).

The human-readable trail list (names, lengths, difficulty, trailhead coords)
comes from the FWS refuge page:
`https://www.fws.gov/refuge/vieques/visit-us/trails` — use it as the
authoritative source for name/difficulty/surface when enriching OSM data.

### Known Vieques trails (from FWS page)

Berdiales Beach (0.27mi), Caracas Beach (0.18), Cerro Caracas (1.02),
Cerro Playuela (0.05), Kiani Boardwalk (0.89), Los Pobres / El Pobre (0.60),
Playuela Beach (0.33), Playuela (~0.42), Puerto Ferro Lighthouse (0.04),
Puerto Mosquito NNL Observation Deck (0.65), Puerto Mosquito NNL (0.25),
Punta Galinde (0.81), Tapon Bay, Cerro Playuela (0.95).

## Data cleanup pipeline

Raw OSM/Overpass exports need cleaning before insert. Steps:

1. **Round coordinates** to 6 decimals (~11cm) — kills false-precision float
   noise from 7-decimal exports.
2. **Dedupe** consecutive identical points.
3. **Simplify** with Douglas-Peucker (shapely `.simplify(0.00001,
   preserve_topology=True)`, ~1m tolerance) to trim redundant vertices.
4. **Compute length** via haversine — don't trust metadata fields.
5. **Enrich empty `properties`** — OSM gives empty `{}`; fill `name`,
   `source`, `distance_km/mi`, `difficulty`, `surface`. Match to the FWS
   trail list by length + location to assign name/difficulty/surface.

Reference script lives with the trail data (Python + shapely). Output is an
insert-ready FeatureCollection.

## Loading into Supabase

Per feature: `ST_GeomFromGeoJSON(feature.geometry)` for `geom`, map
`properties` onto columns. Either loop features in JS inserting rows, or send
the whole FeatureCollection to a Postgres function that iterates and inserts.

## Rendering in MapLibre

```js
const { data } = await supabase.rpc('get_trails');
map.addSource('trails', { type: 'geojson', data });
map.addLayer({
  id: 'trails-line', type: 'line', source: 'trails',
  paint: { 'line-color': '#e01e37', 'line-width': 3, 'line-dasharray': [2,1] }
});
```

Dashed red styling matches the reference basemap. Add a `click` handler on
`trails-line` to read `feature.properties` for a name/length/difficulty popup.

## What was actually built (2026-07-26)

The plan above is implemented, with three deliberate departures from it:

1. **The cleanup pipeline runs in PostGIS, not shapely.** `ST_SnapToGrid` →
   `ST_RemoveRepeatedPoints` → `ST_SimplifyPreserveTopology` are steps 1-3 of
   "Data cleanup pipeline" exactly, with no Python in the load path, so the same
   code runs against Supabase directly. Step 4 (compute length) became a
   **generated column** — `distance_km`/`distance_mi` are measured off `geom` by
   Postgres on every write, so they cannot go stale. A `published_distance_mi`
   column holds the number the *source* prints, kept separate so a disagreement
   between the printed length and the drawn line stays visible.
2. **Loading is one function, not a JS loop.** `public.import_trails(jsonb)`
   takes a whole FeatureCollection, cleans and upserts each LineString on
   `slug`, skips non-LineStrings with a NOTICE, and returns the row count. Every
   future import — FWS bulk pull, Overpass export, a line drawn in geojson.io —
   goes through it, so the cleanup rules live in one place.
3. **Not `get_trails`, but `GET /api/trails`.** An RPC would mean the browser
   talking to Postgres directly, which the gatekeeper rule forbids (CLAUDE.md).
   The Express route returns the same FeatureCollection and adds derived
   `trailhead_lat`/`lng` (`ST_StartPoint`) so the app can pin, sort by
   distance-from-you, and route to the start.

Where things live:

| Piece | File |
|---|---|
| Table, generated lengths, RLS | `db/migrations/0025_trails.sql` |
| Importer + first trail | `db/migrations/0026_trails_import_and_seed.sql` |
| API route (gated on `activities`) | `backend/server.js` → `/api/trails` |
| Types + fetch | `frontend/src/lib/api.ts` |
| List/detail view model | `frontend/src/lib/place.ts` → `trailToPlace` |
| Dashed line + label layers | `frontend/src/lib/trailLayers.ts` |
| Wiring, click-to-select, framing | `frontend/src/components/MapView.tsx` |

Hiking is the **`hiking` subcategory of Activities**, not a top-level pill —
it's a thing to do on the island, and trails being lines rather than pins is a
rendering detail, not a reason to split the navigation. The chip comes from an
`activity_categories` row (`slug='hiking'`, `sort_order=0`, so it leads the
row); nothing joins that row to `activity_listings`. `useCategoryPlaces` takes
the same "this sub has its own dataset" branch that snorkelling does.

Seeded trail: `puerto-ferro-lighthouse`, from
`data/trails/puerto-ferro-lighthouse.geojson` — 27 vertices after cleaning
(from 30), 623 m / 0.39 mi measured.

## Open items

- **Verify the seeded trail's identity and metadata.** Name, difficulty,
  elevation and time on `puerto-ferro-lighthouse` are a best-effort first pass
  from the line's location, NOT authoritative. Note the FWS page lists "Puerto
  Ferro Lighthouse" at 0.04 mi against a measured 0.39 mi — that is why
  `published_distance_mi` exists, but it also means the line may be a different
  trail, or the lighthouse spur plus its access track.
- Pull the live FWS FeatureCollection and load the authoritative geometry —
  now a one-liner: `SELECT public.import_trails('<the FeatureCollection>')`.
- Decide simplify tolerance for batch cleaning (1m default; smaller = crisper).
- Enrich OSM-sourced trails with FWS names/difficulty by length+location match.
- No `search_trails` AI tool yet — `backend/aiTools.js` can't answer "what's a
  short hike near Esperanza?" until one is added.
- No elevation source. `elevation_gain_m` is hand-entered; a DEM lookup would
  make it (and the Naismith time estimate that falls back on it) real.
