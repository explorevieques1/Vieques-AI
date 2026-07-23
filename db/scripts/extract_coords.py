#!/usr/bin/env python3
"""
extract_coords.py

Parse a GeoJSON file of Point features and print each pin's
coordinates as "lat long" rounded to 4 decimal places.

Usage:
    python3 extract_coords.py untitled_map.geojson
"""

import json
import sys


def extract_coords(path):
    with open(path, "r") as f:
        data = json.load(f)

    features = data.get("features", [])
    pins = []

    for i, feature in enumerate(features, start=1):
        geometry = feature.get("geometry", {})
        if geometry.get("type") != "Point":
            continue  # skip polygons/lines, only pull point pins

        lon, lat = geometry["coordinates"][:2]
        name = feature.get("properties", {}).get("name") or f"Pin {i}"
        pins.append((name, round(lat, 4), round(lon, 4)))

    return pins


DEFAULT_PATH = "/home/giancarlo/Desktop/Vieques AI/data/untitled_map.geojson"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    pins = extract_coords(path)

    if not pins:
        print("No Point features found in the file.")
        return

    for name, lat, lon in pins:
        print(f"{name}  {lat} {lon}")


if __name__ == "__main__":
    main()