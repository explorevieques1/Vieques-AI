#!/usr/bin/env bash
set -euo pipefail

# Vieques AI — Apply SQL migrations in order
# Run with: bash 03_migrate.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
MIG_DIR="${SCRIPT_DIR}/../migrations"

set -a; source "${ENV_FILE}"; set +a

PG_VER="$(ls /etc/postgresql/ 2>/dev/null | sort -n | tail -1)"
export PATH="/usr/lib/postgresql/${PG_VER}/bin:${PATH}"

export PGPASSWORD="${DB_PASSWORD}"
PSQL=(psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1)

echo "==> Ensuring schema_migrations tracking table exists"
"${PSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

if [[ ! -d "${MIG_DIR}" ]]; then
  echo "ERROR: migrations directory not found at ${MIG_DIR}"
  exit 1
fi

APPLIED=0
SKIPPED=0

# Use a null-delimited glob loop so paths/filenames with spaces are safe
shopt -s nullglob
for file in "${MIG_DIR}"/*.sql; do
  base="$(basename "${file}")"
  already="$("${PSQL[@]}" -tAc "SELECT 1 FROM schema_migrations WHERE filename='${base}'")"
  if [[ "${already}" == "1" ]]; then
    echo "    skip  ${base} (already applied)"
    ((SKIPPED++)) || true
    continue
  fi
  echo "==> apply ${base}"
  "${PSQL[@]}" -f "${file}"
  "${PSQL[@]}" -c "INSERT INTO schema_migrations(filename) VALUES ('${base}');"
  ((APPLIED++)) || true
done
shopt -u nullglob

echo ""
echo "==> Done — applied: ${APPLIED}, skipped: ${SKIPPED}"
echo ""
echo "==> Current tables:"
"${PSQL[@]}" -c "\dt"