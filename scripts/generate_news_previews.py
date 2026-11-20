#!/usr/bin/env python3
"""Generate crawler-readable Open Graph pages for public Vida Unileira content."""

from __future__ import annotations

import html
import json
import shutil
import subprocess
import urllib.parse
from pathlib import Path
from typing import Any

COLLECTIONS = {"news": "news", "conheca": "conhecaUnila"}
LEGACY_PREVIEW_ALIASES = {
    "conheca": {
        "1c68b1b7-2d44-40c7-8eea-c759bf1f7abc": "91fda52e-f78f-4aa5-bdf1-494eceb8489e",
    },
}
SITE_URL = "https://spottedunila.github.io/UNILA-atualizado/"
STORAGE_ORIGIN = "https://spottedash-g7yfwvxv.manus.space"
FALLBACK_IMAGE_URL = urllib.parse.urljoin(SITE_URL, "icon-512.png")
SHARE_ROOT = Path(__file__).resolve().parents[1] / "share"
FETCH_PUBLIC_COLLECTIONS_SCRIPT = Path(__file__).with_name("fetch_public_collections.mjs")


def fetch_public_collections() -> dict[str, list[dict[str, Any]]]:
    """Fetch both collections before changing any generated preview pages."""
    result = subprocess.run(
        ["node", str(FETCH_PUBLIC_COLLECTIONS_SCRIPT)],
        capture_output=True,
        check=False,
        text=True,
        timeout=180,
    )
    if result.stderr:
        print(result.stderr, end="")
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "erro sem detalhes"
        raise RuntimeError(f"Falha ao consultar o Firestore pelo SDK Firebase: {detail}")
    try:
        records_by_collection = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("O SDK Firebase não retornou um JSON válido.") from error

    for collection in COLLECTIONS.values():
        records = records_by_collection.get(collection)
        if not isinstance(records, list) or not records:
            raise RuntimeError(
                f"A coleção {collection} não retornou registros; as prévias existentes foram preservadas."
            )
        if any(not isinstance(record, dict) or not record.get("id") for record in records):
            raise RuntimeError(f"A coleção {collection} contém um registro sem ID válido.")
    return records_by_collection


def normalized_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def meta_content(value: str) -> str:
    return html.escape(value, quote=True)


def public_image_url(value: Any) -> str:
    candidate = str(value or "").strip()
    if candidate.startswith("/manus-storage/"):
        candidate = urllib.parse.urljoin(STORAGE_ORIGIN, candidate)
    parsed = urllib.parse.urlsplit(candidate)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        return ""
    if parsed.username or parsed.password:
        return ""
    return candidate


def share_token(document_id: str) -> str:
    # Hex is URL-safe and deterministic, including for unusual Firestore document IDs.
    return document_id.encode("utf-8").hex()


def conheca_image(record: dict[str, Any]) -> str:
    has_modern_fields = "imageUrl" in record or "videoUrl" in record
    legacy_image = record.get("mediaUrl") if record.get("mediaType") == "image" else ""
    return (
        public_image_url(record.get("imageUrl") if has_modern_fields else legacy_image)
        or public_image_url(record.get("videoThumbUrl"))
        or FALLBACK_IMAGE_URL
    )


def render_page(
    record: dict[str, Any],
    document_id: str,
    kind: str,
    *,
    preview_document_id: str | None = None,
) -> str:
    if kind == "news":
        title = normalized_text(record.get("title")) or "Notícia Unileira"
        description_source = record.get("content") or record.get("shareText") or title
        image_url = (
            public_image_url(record.get("imageUrl"))
            or public_image_url(record.get("videoThumbUrl"))
            or FALLBACK_IMAGE_URL
        )
        body_label = "Abrir notícia no Vida Unileira"
    else:
        title = (
            normalized_text(record.get("title"))
            or normalized_text(record.get("caption"))
            or normalized_text(record.get("videoName"))
            or "Conheça a UNILA"
        )
        description_source = (
            record.get("imageCaption")
            or record.get("videoCaption")
            or record.get("caption")
            or record.get("content")
            or title
        )
        image_url = conheca_image(record)
        body_label = "Abrir publicação em Conheça a UNILA"
    description = normalized_text(description_source)
    if len(description) > 240:
        description = description[:237].rsplit(" ", 1)[0].rstrip(".,;: ") + "…"
    if not description:
        description = "Veja esta publicação no aplicativo Vida Unileira."

    token = share_token(preview_document_id or document_id)
    preview_url = urllib.parse.urljoin(SITE_URL, f"share/{kind}/{token}/")
    app_url = SITE_URL + "?" + urllib.parse.urlencode({"share": kind, "id": document_id})
    escaped_title = meta_content(title)
    escaped_description = meta_content(description)
    escaped_image = meta_content(image_url)
    escaped_preview_url = meta_content(preview_url)
    escaped_app_url = meta_content(app_url)
    escaped_js_app_url = json.dumps(app_url, ensure_ascii=True).replace("</", "<\\/")

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escaped_title} | Vida Unileira</title>
  <meta name="description" content="{escaped_description}">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="{escaped_preview_url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Vida Unileira">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="{escaped_title}">
  <meta property="og:description" content="{escaped_description}">
  <meta property="og:url" content="{escaped_preview_url}">
  <meta property="og:image" content="{escaped_image}">
  <meta property="og:image:secure_url" content="{escaped_image}">
  <meta property="og:image:alt" content="{escaped_title}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{escaped_title}">
  <meta name="twitter:description" content="{escaped_description}">
  <meta name="twitter:image" content="{escaped_image}">
  <style>
    :root {{ color-scheme: dark; }}
    body {{ margin: 0; padding: 2rem 1rem; background: #0f172a; color: #f8fafc; font: 16px/1.55 system-ui, sans-serif; }}
    main {{ max-width: 720px; margin: 0 auto; }}
    img {{ display: block; width: 100%; max-height: 420px; object-fit: cover; border-radius: 14px; }}
    h1 {{ line-height: 1.2; }}
    a {{ display: inline-block; margin-top: 1rem; padding: .75rem 1rem; border-radius: 10px; background: #16a34a; color: white; text-decoration: none; font-weight: 700; }}
  </style>
</head>
<body>
  <main>
    <img src="{escaped_image}" alt="{escaped_title}">
    <h1>{escaped_title}</h1>
    <p>{escaped_description}</p>
    <a href="{escaped_app_url}">{body_label}</a>
  </main>
  <script>window.location.replace({escaped_js_app_url});</script>
</body>
</html>
"""


def sync_kind(kind: str, records: list[dict[str, Any]]) -> tuple[int, int]:
    output_root = SHARE_ROOT / kind
    output_root.mkdir(parents=True, exist_ok=True)
    expected_directories: set[str] = set()

    for record in records:
        document_id = str(record["id"])
        token = share_token(document_id)
        expected_directories.add(token)
        destination = output_root / token / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        content = render_page(record, document_id, kind)
        if not destination.exists() or destination.read_text(encoding="utf-8") != content:
            destination.write_text(content, encoding="utf-8", newline="\n")

    records_by_id = {str(record["id"]): record for record in records}
    aliases_synced = 0
    for legacy_id, current_id in LEGACY_PREVIEW_ALIASES.get(kind, {}).items():
        current_record = records_by_id.get(current_id)
        if current_record is None:
            continue
        alias_token = share_token(legacy_id)
        expected_directories.add(alias_token)
        destination = output_root / alias_token / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        content = render_page(
            current_record,
            current_id,
            kind,
            preview_document_id=legacy_id,
        )
        if not destination.exists() or destination.read_text(encoding="utf-8") != content:
            destination.write_text(content, encoding="utf-8", newline="\n")
        aliases_synced += 1

    removed = 0
    for index_file in output_root.glob("*/index.html"):
        if index_file.parent.name not in expected_directories:
            shutil.rmtree(index_file.parent)
            removed += 1

    return len(records) + aliases_synced, removed


def main() -> None:
    records_by_collection = fetch_public_collections()
    for kind, collection in COLLECTIONS.items():
        synced, removed = sync_kind(kind, records_by_collection[collection])
        print(
            f"{kind}: sincronizadas {synced} páginas de prévia; "
            f"removidas {removed} páginas obsoletas."
        )


if __name__ == "__main__":
    main()
