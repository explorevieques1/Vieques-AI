#!/usr/bin/env python3
"""Import vieques_beaches.csv into the beaches table.
Usage: python3 import_beaches.py path/to/vieques_beaches.csv
Reads DB connection from ../.env. Idempotent: clears and reloads the table.
"""
import csv, os, sys, pathlib

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary --break-system-packages")

def load_env(env_path):
    env = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env

def split_list(value):
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]

def to_bool(value):
    return str(value).strip().lower() in ("yes", "true", "1", "y")

def main():
    csv_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "vieques_beaches.csv")
    if not csv_path.exists():
        sys.exit(f"CSV not found: {csv_path}")

    env = load_env(pathlib.Path(__file__).parent.parent / ".env")
    conn = psycopg2.connect(
        dbname=env.get("DB_NAME", "vieques_ai"),
        user=env.get("DB_USER", "vieques_app"),
        password=env.get("DB_PASSWORD", ""),
        host=env.get("DB_HOST", "localhost"),
        port=env.get("DB_PORT", "5432"),
    )
    cur = conn.cursor()

    # Fresh reload each run so re-importing an edited CSV just works
    cur.execute("TRUNCATE beaches RESTART IDENTITY;")

    rows = 0
    with csv_path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if not r.get("name") or not r.get("latitude") or not r.get("longitude"):
                print(f"  skip (missing name/coords): {r.get('name')!r}")
                continue
            cur.execute(
                """
                INSERT INTO beaches
                  (name, local_name, latitude, longitude, region, type,
                   water_conditions, access, facilities, best_for,
                   in_wildlife_refuge, gate_hours, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    r["name"].strip(),
                    (r.get("local_name") or "").strip() or None,
                    float(r["latitude"]),
                    float(r["longitude"]),
                    (r.get("region") or "").strip() or None,
                    split_list(r.get("type")),
                    (r.get("water_conditions") or "").strip() or None,
                    (r.get("access") or "").strip() or None,
                    split_list(r.get("facilities")),
                    (r.get("best_for") or "").strip() or None,
                    to_bool(r.get("in_wildlife_refuge")),
                    (r.get("gate_hours") or "").strip() or None,
                    (r.get("notes") or "").strip() or None,
                ),
            )
            rows += 1

    conn.commit()
    cur.execute("SELECT count(*) FROM beaches;")
    total = cur.fetchone()[0]
    cur.close(); conn.close()
    print(f"Imported {rows} beaches. Table now has {total} rows.")

if __name__ == "__main__":
    main()
