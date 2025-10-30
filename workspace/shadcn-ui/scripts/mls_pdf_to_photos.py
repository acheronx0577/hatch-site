#!/usr/bin/env python3
"""
Hatch MLS PDF → Draft Photos
===========================

Utility script that mirrors the Codex reference workflow:
 1. Extract embedded images from an MLS PDF (via PyMuPDF / fitz)
 2. Pick the strongest cover shot (largest landscape image)
 3. Upload every image to the Hatch draft listing photos endpoint
 4. Patch the draft so `hasPhotos=true` and `photoCount=n`

Only the CLI arguments need to be supplied; defaults are sensible for local dev.

Requires: Python 3.10+, PyMuPDF (`pip install pymupdf requests`)
"""

from __future__ import annotations

import argparse
import hashlib
import mimetypes
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import fitz  # type: ignore
import requests


# --------------------------------------------------------------------------- #
# Helpers                                                                    #
# --------------------------------------------------------------------------- #


@dataclass
class ExtractedImage:
    path: Path
    width: int
    height: int
    area: int
    page_index: int
    img_index: int


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def hash_file(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            sha.update(chunk)
    return sha.hexdigest()


def ext_to_mime(extension: str) -> str:
    lookup = mimetypes.types_map.get(f".{extension.lower()}")
    if lookup:
        return lookup
    if extension.lower() in ("jpg", "jpeg"):
        return "image/jpeg"
    if extension.lower() == "png":
        return "image/png"
    if extension.lower() == "tif":
        return "image/tiff"
    return "application/octet-stream"


def sort_key_for_cover(img: ExtractedImage) -> Tuple[int, int, int]:
    """Largest landscape image wins; landscape prioritised before portrait."""
    is_landscape = 0 if img.width >= img.height else 1
    return (is_landscape, -img.area, img.page_index)


# --------------------------------------------------------------------------- #
# Extraction                                                                 #
# --------------------------------------------------------------------------- #


def extract_images(pdf_path: Path, output_dir: Path) -> List[ExtractedImage]:
    ensure_dir(output_dir)

    images: List[ExtractedImage] = []
    seen_hashes: set[str] = set()

    with fitz.open(pdf_path) as doc:
        for page_index, page in enumerate(doc):
            for img_index, (xref, *_rest) in enumerate(page.get_images(full=True)):
                base = doc.extract_image(xref)
                binary = base["image"]
                ext = base.get("ext", "jpeg")
                width = int(base.get("width", 0))
                height = int(base.get("height", 0))

                file_name = f"page{page_index + 1:02d}_img{img_index + 1:02d}.{ext}"
                out_path = output_dir / file_name
                out_path.write_bytes(binary)

                digest = hash_file(out_path)
                if digest in seen_hashes:
                    out_path.unlink(missing_ok=True)
                    continue
                seen_hashes.add(digest)

                images.append(
                    ExtractedImage(
                        path=out_path,
                        width=width,
                        height=height,
                        area=width * height,
                        page_index=page_index,
                        img_index=img_index,
                    )
                )

    return images


def order_for_upload(images: Sequence[ExtractedImage]) -> List[ExtractedImage]:
    if not images:
        return []
    return sorted(images, key=sort_key_for_cover)


# --------------------------------------------------------------------------- #
# Upload                                                                     #
# --------------------------------------------------------------------------- #


def upload_photo(
    session: requests.Session,
    url: str,
    token: str,
    photo: ExtractedImage,
    *,
    index: int,
    is_cover: bool,
    use_is_cover: bool,
    use_ordering: bool,
    timeout: float,
    max_retries: int,
) -> Tuple[bool, int, str]:
    mime = ext_to_mime(photo.path.suffix.lstrip("."))

    def _post() -> requests.Response:
        with photo.path.open("rb") as fh:
            files = {"file": (photo.path.name, fh, mime)}
            data = {}
            if use_is_cover:
                data["isCover"] = "true" if is_cover else "false"
            if use_ordering:
                data["order"] = str(index)

            headers = {"Authorization": f"Bearer {token}"}
            return session.post(url, files=files, data=data, headers=headers, timeout=timeout)

    attempt = 0
    while attempt < max_retries:
        attempt += 1
        try:
            response = _post()
            if 200 <= response.status_code < 300:
                return True, response.status_code, ""
            error = response.text[:500]
        except Exception as exc:  # noqa: BLE001
            response = None  # type: ignore[assignment]
            error = str(exc)

        if attempt >= max_retries:
            status = response.status_code if response else 0
            return False, status, error

        time.sleep(attempt)  # simple back-off

    return False, 0, "unreachable"


def patch_listing_status(
    session: requests.Session,
    url: str,
    token: str,
    *,
    photo_count: int,
    timeout: float,
) -> Tuple[bool, int, str]:
    payload = {"hasPhotos": photo_count > 0, "photoCount": photo_count}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        response = session.patch(url, json=payload, headers=headers, timeout=timeout)
        if 200 <= response.status_code < 300:
            return True, response.status_code, ""
        return False, response.status_code, response.text[:500]
    except Exception as exc:  # noqa: BLE001
        return False, 0, str(exc)


# --------------------------------------------------------------------------- #
# CLI                                                                        #
# --------------------------------------------------------------------------- #


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract and upload MLS photos from a PDF export.")
    parser.add_argument("--pdf", dest="pdf_path", required=True, help="Path to the MLS PDF export")
    parser.add_argument("--listing", dest="listing_id", required=True, help="Draft listing identifier")
    parser.add_argument("--api-base", dest="api_base", required=True, help="API base URL, e.g. https://api.example.com")
    parser.add_argument("--token", dest="api_token", required=True, help="Bearer token for the Hatch API")
    parser.add_argument("--output-dir", dest="output_dir", default="mls_photos", help="Temp directory for extracted images")
    parser.add_argument("--min-photos", dest="min_photos", type=int, default=5, help="Minimum required photo count")
    parser.add_argument("--timeout", dest="timeout", type=float, default=30.0, help="HTTP timeout in seconds")
    parser.add_argument("--retries", dest="retries", type=int, default=3, help="Upload retry attempts")
    parser.add_argument("--no-cover-flag", dest="use_is_cover", action="store_false", help="Skip sending isCover flag")
    parser.add_argument("--no-ordering", dest="use_ordering", action="store_false", help="Skip sending order index")
    parser.add_argument("--upload-path", dest="upload_path", default="/api/listings/{listing_id}/photos")
    parser.add_argument("--status-path", dest="status_path", default="/api/listings/{listing_id}/status")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)

    pdf_path = Path(args.pdf_path).expanduser().resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    output_dir = Path(args.output_dir).expanduser().resolve()

    print("==> Extracting images from PDF …")
    images = extract_images(pdf_path, output_dir)
    print(f"   Extracted {len(images)} image(s) to {output_dir}")

    if not images:
        raise SystemExit("No images found in the PDF. Aborting.")

    ordered = order_for_upload(images)
    cover = ordered[0]
    print(f"   Selected cover: {cover.path.name} ({cover.width}×{cover.height})")

    session = requests.Session()
    upload_url = f"{args.api_base.rstrip('/')}{args.upload_path.format(listing_id=args.listing_id)}"
    status_url = f"{args.api_base.rstrip('/')}{args.status_path.format(listing_id=args.listing_id)}"

    print("==> Uploading photos …")
    success_count = 0
    for idx, image in enumerate(ordered):
        ok, status, error = upload_photo(
            session,
            upload_url,
            args.api_token,
            image,
            index=idx,
            is_cover=(idx == 0),
            use_is_cover=args.use_is_cover,
            use_ordering=args.use_ordering,
            timeout=args.timeout,
            max_retries=max(args.retries, 1),
        )
        prefix = "✅" if ok else "⚠️ "
        detail = f"[{idx:02d}] {image.path.name}"
        suffix = f"(HTTP {status})"
        if error:
            suffix = f"{suffix} {error}"
        print(f"   {prefix} {detail} {suffix}")
        if ok:
            success_count += 1

    if success_count < args.min_photos:
        print(f"==> Uploaded {success_count} photo(s) — below required minimum {args.min_photos}.")
    else:
        print(f"==> Uploaded {success_count} photo(s). Meets minimum requirement ({args.min_photos}).")

    print("==> Patching listing status …")
    ok, status, error = patch_listing_status(
        session,
        status_url,
        args.api_token,
        photo_count=success_count,
        timeout=args.timeout,
    )
    if ok:
        print(f"   ✅ Listing marked photo-ready (hasPhotos=true, photoCount={success_count})")
    else:
        print(f"   ⚠️ Patch failed (HTTP {status}) {error}")

    print("==> DONE.")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
