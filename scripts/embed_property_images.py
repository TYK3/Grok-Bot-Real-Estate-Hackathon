"""One-time preprocessing: embed property images as base64 bytes in the dataset.

For each property in the Hamptons lettings JSON, this downloads the images the
agent actually uses (floor plan first, then a few photos, then the EPC), resizes
them to a small "low-detail" size, JPEG-encodes them, and stores them inline as
base64 data URLs under a new ``image_data`` key.

At runtime the agent then loads these bytes directly from the dataset (see
``src/properties.get_property_images``) with no network fetch.

Usage:
    uv run python scripts/embed_property_images.py                # all properties
    uv run python scripts/embed_property_images.py --only 21932056
    uv run python scripts/embed_property_images.py --max-photos 3 --max-size 512
    uv run python scripts/embed_property_images.py --force        # re-embed existing
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import requests
from PIL import Image

DATA_PATH = Path(__file__).resolve().parent.parent / "work" / "hamptons_e14_2dr_lettings.json"


def _collect_urls(prop: dict[str, Any], max_photos: int) -> list[str]:
    urls: list[str] = []
    for url in prop.get("floorplans", []) or []:
        if url:
            urls.append(url)
    for url in (prop.get("images", []) or [])[:max_photos]:
        if url:
            urls.append(url)
    return urls


def _fetch_data_url(url: str, max_size: int, quality: int) -> str | None:
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content))
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception as exc:
        print(f"    ! failed {url}: {exc}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Embed only this property_id/reference")
    parser.add_argument("--max-photos", type=int, default=3)
    parser.add_argument("--max-size", type=int, default=512, help="Longest edge in px")
    parser.add_argument("--quality", type=int, default=80)
    parser.add_argument("--force", action="store_true", help="Re-embed even if present")
    args = parser.parse_args()

    with open(DATA_PATH, encoding="utf-8") as f:
        properties: list[dict[str, Any]] = json.load(f)

    targets = properties
    if args.only:
        targets = [
            p
            for p in properties
            if str(p.get("property_id")) == args.only or str(p.get("reference")) == args.only
        ]

    total = len(targets)
    for idx, prop in enumerate(targets, start=1):
        pid = prop.get("property_id")
        if prop.get("image_data") and not args.force:
            print(f"[{idx}/{total}] {pid}: already embedded, skipping")
            continue

        urls = _collect_urls(prop, args.max_photos)
        if not urls:
            print(f"[{idx}/{total}] {pid}: no images")
            prop["image_data"] = []
            continue

        print(f"[{idx}/{total}] {pid}: fetching {len(urls)} image(s)")
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(
                pool.map(lambda u: _fetch_data_url(u, args.max_size, args.quality), urls)
            )
        prop["image_data"] = [r for r in results if r]

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(properties, f, ensure_ascii=False, indent=2)

    size_mb = DATA_PATH.stat().st_size / (1024 * 1024)
    print(f"Done. Wrote {DATA_PATH} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
