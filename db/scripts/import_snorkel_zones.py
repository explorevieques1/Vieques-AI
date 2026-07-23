#!/usr/bin/env python3
"""Import a geojson.io export as snorkel zones for a given spot.

Usage:
  python3 import_snorkel_zones.py SPOT_ID path/to/file.geojson [options]

Options (defaults applied to any feature missing them in its GeoJSON properties):
  --label  TEXT     zone label (e.g. "AVOID")
  --type   TEXT     hazard | wildlife | recommended | info   (default: info)
  --color  HEX      e.g. "#dc2626"
  --replace         delete this spot's existing zones first

Per-feature overrides: in geojson.io you can set each polygon's properties to
  { "label": "...", "zone_type": "...", "color": "#..." }  and those win.

List spots first with:  python3 import_snorkel_zones.py --list
"""
import sys, json, argparse, pathlib

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary --break-system-packages")

TYPE_COLORS = {
    "hazard": "#dc2626",
    "wildlife": "#22c55e",
    "recommended": "#3b82f6",
    "info": "#64748b",
}

def load_env(env_path):
    env = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env

def connect():
    env = load_env(pathlib.Path(__file__).parent.parent / ".env")
    return psycopg2.connect(
        dbname=env.get("DB_NAME", "vieques_ai"),
        user=env.get("DB_USER", "vieques_app"),
        password=env.get("DB_PASSWORD", ""),
        host=env.get("DB_HOST", "localhost"),
        port=env.get("DB_PORT", "5432"),
    )

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spot_id", nargs="?")
    ap.add_argument("geojson", nargs="?")
    ap.add_argument("--label", default=None)
    ap.add_argument("--type", dest="zone_type", default="info")
    ap.add_argument("--color", default=None)
    ap.add_argument("--replace", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    conn = connect()
    cur = conn.cursor()

    if args.list:
        cur.execute("SELECT id, name FROM snorkel_spots ORDER BY id;")
        print("Snorkel spots:")
        for sid, name in cur.fetchall():
            print(f"  {sid}: {name}")
        return

    if not args.spot_id or not args.geojson:
        sys.exit("Usage: python3 import_snorkel_zones.py SPOT_ID file.geojson [--label .. --type .. --color ..]\n"
                 "       python3 import_snorkel_zones.py --list")

    path = pathlib.Path(args.geojson)
    if not path.exists():
        sys.exit(f"File not found: {path}")

    cur.execute("SELECT name FROM snorkel_spots WHERE id = %s", (args.spot_id,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"No snorkel spot with id {args.spot_id}. Run --list to see options.")
    spot_name = row[0]

    data = json.loads(path.read_text())
    feats = data["features"] if data.get("type") == "FeatureCollection" else [data]

    if args.replace:
        cur.execute("DELETE FROM snorkel_zones WHERE spot_id = %s", (args.spot_id,))

    n = 0
    for i, f in enumerate(feats):
        geom = f.get("geometry", {})
        if geom.get("type") != "Polygon":
            print(f"  skip feature {i}: not a Polygon ({geom.get('type')})")
            continue
        props = f.get("properties") or {}
        label = props.get("label", args.label)
        ztype = props.get("zone_type", args.zone_type)
        color = props.get("color", args.color) or TYPE_COLORS.get(ztype, "#3b82f6")

        cur.execute(
            """
            INSERT INTO snorkel_zones (spot_id, label, zone_type, color, area, sort_order)
            VALUES (%s, %s, %s, %s,
                    ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)::geography, %s)
            """,
            (args.spot_id, label, ztype, color, json.dumps(geom), i),
        )
        n += 1
        print(f"  added zone: {label or '(no label)'} [{ztype}] {color}")

    conn.commit()
    cur.execute("SELECT count(*) FROM snorkel_zones WHERE spot_id = %s", (args.spot_id,))
    total = cur.fetchone()[0]
    cur.close(); conn.close()
    print(f"\nImported {n} zone(s) into '{spot_name}'. Spot now has {total} zone(s).")

if __name__ == "__main__":
    main()