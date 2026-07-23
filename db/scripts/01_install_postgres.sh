#!/usr/bin/env bash
set -euo pipefail

# Vieques AI — PostgreSQL + PostGIS + pgvector install for Linux Mint
# Run with: bash 01_install_postgres.sh

echo "==> Updating package lists (ignoring third-party GPG errors)"
sudo apt update 2>&1 | grep -v "^W:\|^N:" || true

echo "==> Installing PostgreSQL + contrib"
sudo apt install -y postgresql postgresql-contrib

# Detect installed major version
PG_VER="$(ls /etc/postgresql/ | sort -n | tail -1)"
echo "==> Detected PostgreSQL major version: ${PG_VER}"

echo "==> Installing PostGIS + pgvector for PG ${PG_VER}"
sudo apt install -y "postgresql-${PG_VER}-postgis-3" "postgresql-${PG_VER}-pgvector"

echo "==> Starting and enabling PostgreSQL service"
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Add psql to PATH for this session and permanently
PG_BIN="/usr/lib/postgresql/${PG_VER}/bin"
export PATH="${PG_BIN}:${PATH}"
if ! grep -q "${PG_BIN}" ~/.bashrc; then
  echo "export PATH=\"${PG_BIN}:\$PATH\"" >> ~/.bashrc
  echo "==> Added ${PG_BIN} to ~/.bashrc"
fi

echo ""
echo "==> Installed:"
psql --version
echo ""
echo "==> Service status:"
sudo systemctl status postgresql --no-pager | head -5
echo ""
echo "Done. Next: edit db/.env then run  bash 02_setup_database.sh"
