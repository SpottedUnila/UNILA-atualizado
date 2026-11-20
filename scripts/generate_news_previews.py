#!/usr/bin/env python3
"""Generate crawler-readable Open Graph pages for public Vida Unileira news."""

from __future__ import annotations

import html
import json
import shutil
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

PROJECT_ID = "app-unila"
COLLECTION_URL = (
    f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
    "/databases/(default)/documents/news"
)
SITE_URL = "https://spottedunila.github.io/UNILA-atualizado/"
STORAGE_ORIGIN = "https://spottedash-g7yfwvxv.manus.space"
FALLBACK_IMAGE_URL = urllib.parse.urljoin(SITE_URL, "icon-512.png")
OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "share" / "news"
PAGE_SIZE = 300


def firestore_value(value: Any) -> Any:
    """Convert a Firestore REST Value to an ordinary Python value."""
    if not isinstance(value, dict):
        return None
    if "stringValue" in value:
        return value["stringValue"]
    if "timestampValue" in value:
        return value["timestampValue"]
    if "integerValue" in value:
        try:
            return int(value["integerValue"])
        except (TypeError, ValueError):
            return value["integerValue"]
    if "doubleValue" in value:
        return value["doubleValue"]
    if "booleanValue" in value:
        return value["booleanValue"]
    if "nullValue" in value:
        return None
    if "arrayValue" in value:
        return [firestore_value(item) for item in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {
            key: firestore_value(item)
            for key, item in value["mapValue"].get("fields", {}).items()
        }
    return None


def fetch_public_news() -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    page_token: str | None = None

    while True:
        params = {"pageSize": str(PAGE_SIZE)}
        if page_token:
            params["pageToken"] = page_token
        request = urllib.request.Request(
            f"{COLLECTION_URL}?{urllib.parse.urlencode(params)}",
            headers={
                "Accept": "application/json",
                "User-Agent": "VidaUnileira-NewsPreviewSync/1.0",
            },
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)

        for document in payload.get("documents", []):
            document_id = document.get("name", "").rsplit("/", 1)[-1]
            if not document_id:
                raise RuntimeError("Firestore returned a news document without an ID.")
            fields = document.get("fields", {})
            record = {key: firestore_value(value) for key, value in fields.items()}
            record["id"] = document_id
            documents.append(record)

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    # Do not delete all published preview pages if the endpoint unexpectedly returns empty.
    if not documents:
        raise RuntimeError("No public news records returned; refusing to remove existing previews.")
    return documents


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


def news_token(document_id: str) -> str:
    # Hex is URL-safe and deterministic, including for unusual Firestore document IDs.
    return document_id.encode("utf-8").hex()


def render_page(record: dict[str, Any], document_id: str) -> str:
    title = normalized_text(record.get("title")) or "Notícia Unileira"
    description_source = record.get("content") or record.get("shareText") or title
    description = normalized_text(description_source)
    if len(description) > 240:
        description = description[:237].rsplit(" ", 1)[0].rstrip(".,;: ") + "…"
    if not description:
        description = "Veja esta notícia no aplicativo Vida Unileira."

    image_url = (
        public_image_url(record.get("imageUrl"))
        or public_image_url(record.get("videoThumbUrl"))
        or FALLBACK_IMAGE_URL
    )
    token = news_token(document_id)
    preview_url = urllib.parse.urljoin(SITE_URL, f"share/news/{token}/")
    app_url = SITE_URL + "?" + urllib.parse.urlencode({"share": "news", "id": document_id})
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
    <a href="{escaped_app_url}">Abrir notícia no Vida Unileira</a>
  </main>
  <script>window.location.replace({escaped_js_app_url});</script>
</body>
</html>
"""


def main() -> None:
    records = fetch_public_news()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    expected_directories: set[str] = set()

    for record in records:
        document_id = str(record["id"])
        token = news_token(document_id)
        expected_directories.add(token)
        destination = OUTPUT_ROOT / token / "index.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        content = render_page(record, document_id)
        if not destination.exists() or destination.read_text(encoding="utf-8") != content:
            destination.write_text(content, encoding="utf-8", newline="\n")

    removed = 0
    for index_file in OUTPUT_ROOT.glob("*/index.html"):
        if index_file.parent.name not in expected_directories:
            shutil.rmtree(index_file.parent)
            removed += 1

    print(f"Sincronizadas {len(records)} páginas de prévia; removidas {removed} páginas obsoletas.")


if __name__ == "__main__":
    main()
