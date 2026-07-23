#!/usr/bin/env bash
set -euo pipefail

# Vieques AI — Create database, app role, and enable extensions
# Run with: bash 02_setup_database.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  echo "       Run:  cp ../db/.env.example ../.env  then edit the password."
  exit 1
fi

set -a; source "${ENV_FILE}"; set +a

: "${DB_NAME:?set DB_NAME in .env}"
: "${DB_USER:?set DB_USER in .env}"
: "${DB_PASSWORD:?set DB_PASSWORD in .env}"

# Ensure psql is on PATH (Mint sometimes needs this)
PG_VER="$(ls /etc/postgresql/ 2>/dev/null | sort -n | tail -1)"
export PATH="/usr/lib/postgresql/${PG_VER}/bin:${PATH}"

# Verify postgres service is running
if ! sudo systemctl is-active --quiet postgresql; then
  echo "==> PostgreSQL not running — starting it"
  sudo systemctl start postgresql
fi

echo "==> Creating role '${DB_USER}' (if absent)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
    RAISE NOTICE 'Role created.';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
    RAISE NOTICE 'Role already existed — password updated.';
  END IF;
END
\$\$;
SQL

echo "==> Creating database '${DB_NAME}' (if absent)"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  echo "    Created."
else
  echo "    Already exists — skipping."
fi

echo "==> Enabling extensions (PostGIS, pgvector, pg_trgm)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" <<SQL
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT ALL ON SCHEMA public TO ${DB_USER};
SQL

echo ""
echo "==> Extensions installed:"
sudo -u postgres psql -d "${DB_NAME}" -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"

echo ""
echo "Done. Next: run  bash 03_migrate.sh"
