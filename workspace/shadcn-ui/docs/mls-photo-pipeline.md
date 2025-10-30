## MLS PDF → Draft Photo Pipeline

The `scripts/mls_pdf_to_photos.py` helper mirrors Codex's end-to-end flow for keeping draft listings photo-compliant.

### What it does

1. Extracts every image embedded in an MLS PDF export (via PyMuPDF).
2. Picks the strongest cover photo (largest landscape image).
3. Uploads each image to the Hatch API's draft photo endpoint in the correct order.
4. Marks the draft `hasPhotos=true` with the uploaded `photoCount`.

### Prerequisites

- Python 3.10+
- `pip install pymupdf requests`
- A Hatch API bearer token with permission to upload draft photos.

### Usage

```bash
python scripts/mls_pdf_to_photos.py \
  --pdf 360_Property_View3973.pdf \
  --listing draft_abc123 \
  --api-base https://api.yourdomain.com \
  --token "$HATCH_BEARER_TOKEN" \
  --output-dir tmp/mls_photos \
  --min-photos 5
```

Flags of note:

| Flag | Description |
| ---- | ----------- |
| `--pdf` | MLS export PDF with embedded images |
| `--listing` | Draft listing identifier (e.g. `draft_123`) |
| `--api-base` | API origin (e.g. `https://api.hatchcrm.com`) |
| `--token` | Bearer token used for both upload + status patch |
| `--output-dir` | Temporary directory for extracted images (default `mls_photos`) |
| `--min-photos` | Compliance minimum (default `5`) |
| `--no-cover-flag` | Skip sending the optional `isCover` flag |
| `--no-ordering` | Skip sending the optional `order` index |

The script prints a summary of each upload as well as the follow-up PATCH request that marks the draft photo-ready. It exits non-zero if the PDF cannot be read or no images are found.

### API expectations

- `POST {api-base}/api/listings/{listing_id}/photos` accepts `multipart/form-data` with `file`, optional `isCover`, and optional `order`.
- `PATCH {api-base}/api/listings/{listing_id}/status` accepts JSON `{ "hasPhotos": bool, "photoCount": number }`.

Adjust the script if your API uses different paths or requires additional payload fields; paths are configurable via `--upload-path` and `--status-path`.
