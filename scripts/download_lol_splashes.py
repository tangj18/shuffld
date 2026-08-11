#!/usr/bin/env python3
"""Download all current League skin splashes and save compact WebP copies.

Install: python -m pip install requests Pillow
Example: python download_lol_splashes.py --width 480 --quality 65 --workers 8
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

BASE = "https://ddragon.leagueoflegends.com"
SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def slug(value: str) -> str:
    return SAFE.sub("_", value).strip("_") or "unnamed"


def splash_path(output: Path, skin: dict[str, Any]) -> Path:
    return (
        output
        / slug(skin["champion"])
        / f"{skin['num']:02d}_{slug(skin['name'])}.webp"
    )


def get_json(session: requests.Session, url: str) -> Any:
    response = session.get(url, timeout=45)
    response.raise_for_status()
    return response.json()


def download_one(
    version: str,
    skin: dict[str, Any],
    output: Path,
    width: int,
    quality: int,
) -> tuple[str, str, dict[str, Any]]:
    champion = skin["champion"]
    number = skin["num"]
    label = f"{champion} {skin['name']}"

    destination = splash_path(output, skin)

    if destination.exists() and destination.stat().st_size > 0:
        return "skipped", label, skin

    url = (
        f"{BASE}/cdn/img/champion/splash/"
        f"{champion}_{number}.jpg"
    )

    session = requests.Session()
    session.headers.update(
        {"User-Agent": "compact-lol-splash-downloader/1.0"}
    )

    response = session.get(url, timeout=60)

    # Data Dragon lists chromas alongside real skins but serves splash art only
    # for the base ones, so a 404 here is expected, not an error.
    if response.status_code == 404:
        return "missing", label, skin

    response.raise_for_status()

    with Image.open(io.BytesIO(response.content)) as image:
        image = image.convert("RGB")

        if image.width > width:
            height = round(image.height * width / image.width)
            image = image.resize(
                (width, height),
                Image.Resampling.LANCZOS,
            )

        destination.parent.mkdir(parents=True, exist_ok=True)

        temp = destination.with_suffix(".tmp")

        image.save(
            temp,
            "WEBP",
            quality=quality,
            method=6,
        )

        os.replace(temp, destination)

    return "downloaded", label, skin


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download compressed League splash art as WebP."
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/lol-splashes"),
        help="Output directory (default: public/lol-splashes)",
    )

    parser.add_argument(
        "--width",
        type=int,
        default=480,
        help="Maximum output width in pixels (default: 480)",
    )

    parser.add_argument(
        "--quality",
        type=int,
        default=65,
        help="WebP quality from 0 to 100 (default: 65)",
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Concurrent downloads (default: 8)",
    )

    parser.add_argument(
        "--champion",
        action="append",
        help="Only download this champion key; repeatable, e.g. --champion Ahri",
    )

    args = parser.parse_args()

    if args.width < 64:
        parser.error("width must be at least 64")

    if not 0 <= args.quality <= 100:
        parser.error("quality must be between 0 and 100")

    if args.workers < 1:
        parser.error("workers must be at least 1")

    args.output.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(
        {"User-Agent": "compact-lol-splash-downloader/1.0"}
    )

    version = get_json(
        session,
        f"{BASE}/api/versions.json",
    )[0]

    champions = get_json(
        session,
        f"{BASE}/cdn/{version}/data/en_US/champion.json",
    )["data"]

    requested = {
        champion.casefold()
        for champion in (args.champion or [])
    }

    skins: list[dict[str, Any]] = []

    for champion_key in champions:
        if requested and champion_key.casefold() not in requested:
            continue

        detail = get_json(
            session,
            f"{BASE}/cdn/{version}/data/en_US/champion/{champion_key}.json",
        )

        champion = detail["data"][champion_key]

        for skin in champion["skins"]:
            skins.append(
                {
                    "champion": champion_key,
                    "num": skin["num"],
                    "name": skin["name"],
                }
            )

    manifest_path = args.output / "manifest.json"

    print(
        f"Data Dragon {version}: "
        f"{len(skins)} splashes queued.\n"
        f"Saving to: {args.output.resolve()}\n"
    )

    downloaded = 0
    skipped = 0
    missing = 0
    failed = 0
    saved: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(
                download_one,
                version,
                skin,
                args.output,
                args.width,
                args.quality,
            )
            for skin in skins
        ]

        for future in as_completed(futures):
            try:
                status, label, skin = future.result()

                if status == "downloaded":
                    downloaded += 1
                    saved.append(skin)
                elif status == "skipped":
                    skipped += 1
                    saved.append(skin)
                else:
                    missing += 1

                print(f"{status:10} {label}")

            except Exception as error:
                failed += 1
                print(f"failed     {error}", file=sys.stderr)

    # The manifest is written last and lists only skins backed by a file, so the
    # app never builds a URL for splash art that was never saved. A --champion
    # run keeps the entries it did not touch.
    processed = {skin["champion"] for skin in skins}
    entries = list(saved)

    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))

        entries += [
            skin
            for skin in previous.get("skins", [])
            if skin["champion"] not in processed
        ]

    entries = [skin for skin in entries if splash_path(args.output, skin).exists()]
    entries.sort(key=lambda skin: (skin["champion"], skin["num"]))

    manifest = {
        "data_dragon_version": version,
        "width": args.width,
        "quality": args.quality,
        "skins": entries,
    }

    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        f"\nDone."
        f"\nDownloaded: {downloaded}"
        f"\nSkipped: {skipped}"
        f"\nNo splash art (chromas): {missing}"
        f"\nFailed: {failed}"
        f"\nManifest entries: {len(entries)}"
    )

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())