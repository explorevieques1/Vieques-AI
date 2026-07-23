#!/usr/bin/env bash
set -euo pipefail

# Vieques AI — health check
# Run with: bash 04_verify.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; source "${SCRIPT_DIR}/../.env"; set +a

# Ensure psql is on PATH
PG_VER="$(ls /etc/postgresql/ 2>/dev/null | sort -n | tail -1)"
export PATH="/usr/lib/postgresql/${PG_VER}/bin:${PATH}"
export PGPASSWORD="${DB_PASSWORD}"

PSQL=(psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER}" -d "${DB_NAME}" -tA)

echo "==> PostgreSQL service:"
sudo systemctl status postgresql --no-pager | grep -E "Active:|running" | head -2

echo ""
echo "==> Connection:"
"${PSQL[@]}" -c "SELECT 'OK — connected as ' || current_user || ' on database ' || current_database();"

echo ""
echo "==> Extensions (expect postgis, vector, pg_trgm):"
"${PSQL[@]}" -c "SELECT extname || '  ' || extversion FROM pg_extension WHERE extname IN ('postgis','vector','pg_trgm') ORDER BY extname;"

echo ""
echo "==> Tables:"
"${PSQL[@]}" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

echo ""
echo "==> Row counts:"
"${PSQL[@]}" -c "SELECT 'listings='||count(*) FROM listings;"
"${PSQL[@]}" -c "SELECT 'categories='||count(*) FROM categories;"

echo ""
echo "==> All good if three extensions and tables appear above."
