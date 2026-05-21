from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import Article, stories_to_dicts
from app.surfaces import build_edition, build_stories, group_by_facet, infer_category, normalize_source


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build static news surface editions.")
    parser.add_argument(
        "--input",
        default="data/articles.json",
        help="Input article JSON file.",
    )
    parser.add_argument(
        "--output-dir",
        default="docs/data",
        help="Directory for generated JSON.",
    )
    return parser.parse_args()


def parse_published_date(item: dict) -> date:
    published_at = str(item.get("published_at") or "").strip()
    if published_at:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(published_at, fmt).date()
            except ValueError:
                continue
    if item.get("date"):
        return date.fromisoformat(str(item["date"]))
    raise ValueError(f"published_at/date is required: {item.get('title', item.get('url'))}")


def load_articles(path: Path) -> list[Article]:
    raw_items = json.loads(path.read_text(encoding="utf-8-sig"))
    articles: list[Article] = []
    for item in raw_items:
        source = normalize_source(str(item.get("source", "ITmedia NEWS")))
        title = str(item["title"])
        category = str(item.get("category") or infer_category(title, source))
        importance = int(item.get("importance", item.get("score", 0)))
        if importance <= 0:
            continue
        articles.append(
            Article(
                source=source,
                published_date=parse_published_date(item),
                title=title,
                url=str(item["url"]),
                importance=importance,
                category=category,
                summary=str(item.get("summary", "")),
                reason=str(item.get("reason", "")),
                published_at=str(item.get("published_at", "")),
                created_at=str(item.get("created_at", "")),
            )
        )
    return articles


def iter_edition_dates(stories) -> list[date]:
    if not stories:
        return [date.today()]
    earliest = min(story.published_date for story in stories)
    latest = max(story.published_date for story in stories)
    current = earliest + timedelta(days=1)
    dates: list[date] = []
    while current <= latest + timedelta(days=1):
        dates.append(current)
        current += timedelta(days=1)
    return dates


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def build(input_path: Path | str = "data/articles.json", output_dir: Path | str = "docs/data") -> None:
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    articles = load_articles(input_path)
    stories = build_stories(articles)
    edition_dates = iter_edition_dates(stories)

    write_json(output_dir / "stories.json", stories_to_dicts(stories))

    grouped = group_by_facet(stories)
    write_json(
        output_dir / "archive-index.json",
        {key: [story.id for story in value] for key, value in grouped.items()},
    )

    editions_dir = output_dir / "editions"
    if editions_dir.exists():
        for stale_file in editions_dir.glob("*.json"):
            stale_file.unlink()
    manifest_entries = []
    for edition_date in edition_dates:
        edition = build_edition(stories, edition_date)
        edition_payload = {
            "edition_date": edition_date.isoformat(),
            "surfaces": {
                key: [story.id for story in surface_stories]
                for key, surface_stories in edition.items()
            },
        }
        filename = f"{edition_date.isoformat()}.json"
        write_json(editions_dir / filename, edition_payload)
        manifest_entries.append(
            {
                "date": edition_date.isoformat(),
                "path": f"data/editions/{filename}",
            }
        )

    write_json(
        output_dir / "manifest.json",
        {
            "default_edition_date": manifest_entries[-1]["date"],
            "editions": manifest_entries,
        },
    )

    print(
        f"Built {len(stories)} stories and {len(edition_dates)} editions "
        f"into {output_dir}"
    )


def main() -> None:
    args = parse_args()
    build(args.input, args.output_dir)


if __name__ == "__main__":
    main()


