"""Snapshot nearby amenities (OpenStreetMap via Nominatim) for the listings area.

Writes work/amenities.json: {category: [{name, lat, lon}]}. The voice agent's
find_properties_near tool reads this so calls never wait on a live map API.

Run: uv run python scripts/fetch_amenities.py
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
from amenities import CATEGORY_QUERIES, listing_bbox  # noqa: E402

NOMINATIM = "https://nominatim.openstreetmap.org/search?"
HEADERS = {"User-Agent": "property-voice-agent/0.1 (hackathon demo)"}


def search(query: str, bbox: tuple[float, float, float, float]) -> list[dict]:
    south, west, north, east = bbox
    url = NOMINATIM + urllib.parse.urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "viewbox": f"{west},{north},{east},{south}",
            "bounded": 1,
            "limit": 50,
        }
    )
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=20) as r:
        return json.load(r)


def main() -> None:
    bbox = listing_bbox(pad=0.01)
    out: dict[str, list[dict]] = {}
    for category, queries in CATEGORY_QUERIES.items():
        seen: dict[tuple[float, float], dict] = {}
        for q in queries:
            try:
                for hit in search(q, bbox):
                    key = (round(float(hit["lat"]), 5), round(float(hit["lon"]), 5))
                    seen[key] = {
                        "name": hit.get("name") or q.title(),
                        "lat": float(hit["lat"]),
                        "lon": float(hit["lon"]),
                    }
            except Exception as error:  # keep going; partial data is still useful
                print(f"  ! {q}: {error}")
            time.sleep(1.1)  # Nominatim usage policy: max 1 request per second
        out[category] = list(seen.values())
        print(f"{category}: {len(out[category])}")
    path = ROOT / "work" / "amenities.json"
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
