-- 0014_extensions.sql
-- Formalize the Postgres extensions the app relies on, so a fresh/hosted
-- database (Supabase, Neon, etc.) gets them too. Safe to run anywhere.
-- NOTE: CREATE EXTENSION requires superuser; on managed hosts these may be
-- enabled via dashboard instead. IF NOT EXISTS makes this idempotent.

CREATE EXTENSION IF NOT EXISTS postgis;        -- geospatial (points, polygons, distance, routing geometry)
CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector, semantic search (future)
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- fuzzy / trigram text matching
CREATE EXTENSION IF NOT EXISTS unaccent;       -- accent-insensitive matching (Públicos -> publicos)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;  -- extra fuzzy algorithms (levenshtein, soundex)