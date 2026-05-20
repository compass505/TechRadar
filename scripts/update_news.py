from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import feedparser
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.surfaces import (  # noqa: E402
    AI_KEYWORDS,
    CLOUD_KEYWORDS,
    DEVELOPMENT_KEYWORDS,
    ENTERPRISE_KEYWORDS,
    SECURITY_KEYWORDS,
    keyword_hits,
    normalize_source,
)
from scripts.build_editions import build as build_editions  # noqa: E402

JST = ZoneInfo("Asia/Tokyo")
UTC = ZoneInfo("UTC")
DATA_PATH = ROOT / "data" / "articles.json"

FEEDS = [
    {
        "source": "ITmedia NEWS",
        "url": "https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml",
    },
    {
        "source": "Impress Watch",
        "url": "https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf",
    },
    {
        "source": "CNET Japan",
        "url": "https://japan.cnet.com/rss/index.rdf",
    },
    {
        "source": "＠IT",
        "url": "https://rss.itmedia.co.jp/rss/2.0/ait.xml",
    },
    {
        "source": "Publickey",
        "url": "https://www.publickey1.jp/atom.xml",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch, score, and build Tech Radar 505.")
    parser.add_argument(
        "--target-date",
        help="Target published date in JST. Defaults to yesterday.",
    )
    parser.add_argument(
        "--skip-openai",
        action="store_true",
        help="Use only deterministic scoring.",
    )
    return parser.parse_args()


def target_date_from_args(value: str | None) -> str:
    if value:
        return value
    return (datetime.now(JST).date() - timedelta(days=1)).isoformat()


def entry_datetime(entry) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if not parsed:
        return None
    return datetime(*parsed[:6], tzinfo=UTC).astimezone(JST)


def fetch_articles(target_date: str) -> list[dict]:
    articles: list[dict] = []
    seen_urls: set[str] = set()

    for feed in FEEDS:
        parsed = feedparser.parse(feed["url"])
        source = feed["source"]
        for entry in parsed.entries:
            title = str(getattr(entry, "title", "") or "").strip()
            url = str(getattr(entry, "link", "") or "").strip()
            published_at = entry_datetime(entry)
            if not title or not url or not published_at:
                continue
            if published_at.date().isoformat() != target_date:
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)
            articles.append(
                {
                    "source": normalize_source(source),
                    "date": target_date,
                    "title": title,
                    "url": url,
                    "published_at": published_at.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )

    return articles


def deterministic_score(article: dict) -> int:
    title = article["title"]
    source = normalize_source(article["source"])
    score = 1

    if keyword_hits(title, SECURITY_KEYWORDS):
        score += 2
    if keyword_hits(title, AI_KEYWORDS):
        score += 1
    if keyword_hits(title, ENTERPRISE_KEYWORDS | DEVELOPMENT_KEYWORDS | CLOUD_KEYWORDS):
        score += 1
    if source in {"＠IT", "Publickey"}:
        score += 1

    if re.search(r"脆弱|障害|停止|漏えい|攻撃|規制|訴訟", title):
        score += 1

    return max(1, min(score, 5))


def extract_json(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("OpenAI response must be a JSON array.")
    return data


def score_with_openai(articles: list[dict]) -> dict[str, int]:
    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {}

    from openai import OpenAI

    model = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
    client = OpenAI(api_key=api_key)
    payload = [
        {
            "source": article["source"],
            "title": article["title"],
            "url": article["url"],
        }
        for article in articles
    ]
    prompt = f"""
あなたは Tech Radar 505 のニュース編集者です。
以下の候補記事を 0〜5 の重要度で評価してください。
0 は掲載対象外、1 は低重要度、2 は通常掲載ライン、3 は重要、4 は非常に重要、5 は重大ニュースです。

今回のサイトでは、AI、企業IT、セキュリティ、開発、クラウドに関する実用性と影響度を重視します。
単なる小粒な製品紹介やキャンペーンは低めにしてください。

返答は次の形式の JSON 配列だけにしてください。
[
  {{"url": "...", "score": 3}}
]

候補:
{json.dumps(payload, ensure_ascii=False, indent=2)}
"""
    response = client.responses.create(model=model, input=prompt)
    scored = extract_json(response.output_text)
    result: dict[str, int] = {}
    for item in scored:
        url = str(item.get("url", "")).strip()
        try:
            score = int(item.get("score"))
        except (TypeError, ValueError):
            continue
        result[url] = max(0, min(score, 5))
    return result


def load_existing() -> list[dict]:
    if not DATA_PATH.exists():
        return []
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def save_articles(new_articles: list[dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    by_url = {
        str(article.get("url", "")).strip(): article
        for article in load_existing()
        if str(article.get("url", "")).strip()
    }
    for article in new_articles:
        by_url[article["url"]] = article

    merged = sorted(
        by_url.values(),
        key=lambda item: (item.get("date", ""), item.get("source", ""), item.get("title", "")),
    )
    DATA_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    target_date = target_date_from_args(args.target_date)
    articles = fetch_articles(target_date)

    if not articles:
        print(f"No articles found for {target_date}. Building site with existing data.")
        build_editions()
        return

    openai_scores = {} if args.skip_openai else score_with_openai(articles)
    scored_articles = []
    for article in articles:
        score = openai_scores.get(article["url"], deterministic_score(article))
        if score <= 0:
            continue
        scored_articles.append(
            {
                "source": article["source"],
                "date": article["date"],
                "title": article["title"],
                "url": article["url"],
                "score": score,
            }
        )

    save_articles(scored_articles)
    print(f"Saved {len(scored_articles)} articles for {target_date}.")
    build_editions()


if __name__ == "__main__":
    main()
