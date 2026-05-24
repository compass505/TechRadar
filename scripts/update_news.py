from __future__ import annotations

import argparse
import html
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

from app.surfaces import CATEGORIES, infer_category, normalize_source  # noqa: E402
from scripts.build_editions import build as build_editions  # noqa: E402

JST = ZoneInfo("Asia/Tokyo")
UTC = ZoneInfo("UTC")
DATA_PATH = ROOT / "data" / "articles.json"

RETENTION_DAYS = {
    1: 7,
    2: 7,
    3: 30,
    4: 183,
    5: None,
}

FEEDS = [
    {
        "source": "ITmedia NEWS",
        "url": "https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml",
    },
    {
        "source": "ITmedia AI+",
        "url": "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml",
    },
    {
        "source": "＠IT",
        "url": "https://rss.itmedia.co.jp/rss/2.0/ait.xml",
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
        "source": "Publickey",
        "url": "https://www.publickey1.jp/atom.xml",
    },
]

EXCLUDED_TITLE_RE = re.compile(
    r"^(PR|広告)[:：]|Sponsored|スポンサー|【いつモノコト】|キャンペーン",
    re.IGNORECASE,
)
LOW_VALUE_TITLE_RE = re.compile(
    r"コラボ|新色|限定|セール|発売|コンデジ|ナップサック|スマートウォッチ|G-SHOCK",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch, select, summarize, and build TechRadar 505.")
    parser.add_argument(
        "--target-date",
        help="Target published date in JST. Defaults to yesterday, then falls back to the latest RSS date.",
    )
    parser.add_argument(
        "--skip-openai",
        action="store_true",
        help="Use deterministic fallback for local testing only. Production should use OpenAI.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing saved articles before writing newly fetched articles.",
    )
    return parser.parse_args()


def now_jst_string() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")


def target_date_from_args(value: str | None) -> str:
    if value:
        return value
    return (datetime.now(JST).date() - timedelta(days=1)).isoformat()


def entry_datetime(entry) -> datetime | None:
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if not parsed:
        return None
    return datetime(*parsed[:6], tzinfo=UTC).astimezone(JST)


def clean_text(value: object) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def entry_summary(entry) -> str:
    summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
    if summary:
        return clean_text(summary)

    content = getattr(entry, "content", None)
    if content:
        values = [clean_text(getattr(item, "value", "")) for item in content]
        return " ".join(value for value in values if value).strip()

    return ""


def is_excluded_title(title: str) -> bool:
    return bool(EXCLUDED_TITLE_RE.search(title))


def fetch_feed_articles() -> list[dict]:
    articles: list[dict] = []
    seen_urls: set[str] = set()

    for feed in FEEDS:
        parsed = feedparser.parse(feed["url"])
        source = normalize_source(feed["source"])
        for entry in parsed.entries:
            title = clean_text(getattr(entry, "title", ""))
            url = str(getattr(entry, "link", "") or "").strip()
            published_at = entry_datetime(entry)
            if not title or not url or not published_at:
                continue
            if url in seen_urls or is_excluded_title(title):
                continue

            seen_urls.add(url)
            summary = entry_summary(entry)
            articles.append(
                {
                    "source": source,
                    "title": title,
                    "url": url,
                    "summary": summary,
                    "published_date": published_at.date().isoformat(),
                    "published_at": published_at.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )

    return articles


def filter_articles_by_date(articles: list[dict], target_date: str) -> list[dict]:
    return [article for article in articles if article["published_date"] == target_date]


def latest_available_date(articles: list[dict]) -> str | None:
    today = datetime.now(JST).date().isoformat()
    candidates = sorted({article["published_date"] for article in articles if article["published_date"] <= today})
    return candidates[-1] if candidates else None


def extract_json(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1 or end <= start:
            raise
        data = json.loads(text[start : end + 1])
    if not isinstance(data, list):
        raise ValueError("OpenAI response must be a JSON array.")
    return data


def select_and_summarize_articles(articles: list[dict]) -> list[dict]:
    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(".env または環境変数に OPENAI_API_KEY を設定してください。")

    from openai import OpenAI

    model = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
    client = OpenAI(api_key=api_key)
    candidates_json = json.dumps(articles, ensure_ascii=False, indent=2)
    categories = ", ".join(sorted(CATEGORIES))

    prompt = f"""
あなたはITニュース編集者です。
TechRadar 505に掲載する価値がある記事だけを選び、重要度1から5で厳しめに評価してください。

選定方針:
- AI、企業IT、開発、セキュリティ、クラウド、半導体、ガジェット、ビジネス、法規制に関わるニュースを重視する
- 技術トレンド、企業戦略、社会や仕事への影響、開発者・情シス・経営判断に役立つ内容を優先する
- PR、広告、ランキング、キャンペーン、軽い小ネタ、単なる製品紹介は掲載価値を低く見る
- 似たニュースが複数ある場合は代表的な1件だけを選ぶ
- 重要度0の記事は絶対に返さない

重要度の目安:
- 1: 掲載価値はあるが影響範囲が狭い
- 2: 読者の理解や判断に役立つ
- 3: 多くの読者が押さえる価値がある重要ニュース
- 4: 業界、主要企業、開発者、情シス、規制、市場に大きく関わる
- 5: 安全性、セキュリティ、法規制、社会的混乱など重大リスクがある

カテゴリは必ず次から選んでください:
{categories}

候補記事:
{candidates_json}

返答はJSON配列だけにしてください。説明文やコードブロックは不要です。
各要素のキー:
- source: 候補記事のsource
- title: 候補記事のtitle
- url: 候補記事のurl
- summary: 3行以内の日本語要約
- importance: 1から5の整数
- category: 上記カテゴリのどれか
- reason: 選定理由を短く
- published_at: 候補記事のpublished_at
"""

    response = client.responses.create(model=model, input=prompt)
    return extract_json(response.output_text)


def normalize_importance(value) -> int:
    try:
        importance = int(value)
    except (TypeError, ValueError):
        return 0
    return min(5, max(0, importance))


def parse_datetime_for_sort(value) -> datetime:
    if not value:
        return datetime.min
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value), fmt)
        except ValueError:
            continue
    return datetime.min


def normalize_news_item(item: dict, candidate_map: dict[str, dict]) -> dict | None:
    url = str(item.get("url", "")).strip()
    title = clean_text(item.get("title", ""))
    if not title or not url:
        return None

    candidate = candidate_map.get(url, {})
    source = normalize_source(str(item.get("source") or candidate.get("source") or "").strip())
    summary = clean_text(item.get("summary") or candidate.get("summary") or "")
    category = str(item.get("category") or "").strip()
    if category not in CATEGORIES:
        category = infer_category(title=title, source=source, summary=summary)

    return {
        "source": source,
        "title": title,
        "url": url,
        "summary": summary,
        "importance": normalize_importance(item.get("importance")),
        "category": category,
        "reason": clean_text(item.get("reason", "")),
        "published_at": str(item.get("published_at") or candidate.get("published_at") or "").strip(),
        "created_at": now_jst_string(),
    }


def deterministic_importance(article: dict, category: str) -> int:
    text = f"{article['title']} {article.get('summary', '')}"
    if category == "その他" and not re.search(r"障害|停止|漏えい|攻撃|規制|訴訟|買収|提携|公開|廃止|注意喚起", text):
        return 0
    if LOW_VALUE_TITLE_RE.search(article["title"]) and not re.search(r"脆弱性|障害|停止|漏えい|攻撃|規制|訴訟|買収|提携", text):
        return 0

    importance = 1
    if category in {"AI", "企業IT", "開発", "セキュリティ", "クラウド"}:
        importance += 1
    if re.search(r"脆弱性|障害|停止|漏えい|攻撃|規制|訴訟|買収|公開|廃止|注意喚起", text):
        importance += 1
    if article["source"] in {"ITmedia NEWS", "ITmedia AI+", "＠IT", "Publickey"} and category != "その他":
        importance += 1
    return min(5, importance)


def deterministic_fallback(articles: list[dict]) -> list[dict]:
    """Local-test fallback. GitHub production should use OpenAI selection."""
    selected = []
    for article in articles:
        category = infer_category(
            title=article["title"],
            source=article["source"],
            summary=article.get("summary", ""),
        )
        importance = deterministic_importance(article, category)
        if importance <= 0:
            continue
        selected.append(
            {
                **article,
                "importance": importance,
                "category": category,
                "reason": "ローカル検証用のキーワード判定で選定",
            }
        )
    return selected


def load_existing() -> list[dict]:
    if not DATA_PATH.exists():
        return []
    try:
        data = json.loads(DATA_PATH.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError:
        print("既存の保存ニュースJSONが壊れているため、読み込みをスキップします。")
        return []
    return data if isinstance(data, list) else []


def retention_reference_datetime(item: dict) -> datetime:
    published_at = parse_datetime_for_sort(item.get("published_at"))
    if published_at != datetime.min:
        return published_at
    return parse_datetime_for_sort(item.get("created_at"))


def apply_retention(items: list[dict]) -> list[dict]:
    today = datetime.now(JST).date()
    kept_items: list[dict] = []
    removed_count = 0

    for item in items:
        importance = normalize_importance(item.get("importance", item.get("score")))
        retention_days = RETENTION_DAYS.get(importance, 7)
        if retention_days is None:
            kept_items.append(item)
            continue

        reference_date = retention_reference_datetime(item).date()
        if reference_date == datetime.min.date():
            kept_items.append(item)
            continue

        if reference_date >= today - timedelta(days=retention_days):
            kept_items.append(item)
        else:
            removed_count += 1

    if removed_count:
        print(f"保存期間を過ぎたニュースを{removed_count}件整理しました。")
    return kept_items


def sort_news(items: list[dict]) -> list[dict]:
    return sorted(
        items,
        key=lambda item: (
            parse_datetime_for_sort(item.get("published_at") or item.get("date")),
            normalize_importance(item.get("importance", item.get("score"))),
            parse_datetime_for_sort(item.get("created_at")),
        ),
        reverse=True,
    )


def migrate_existing_item(item: dict) -> dict | None:
    url = str(item.get("url", "")).strip()
    title = clean_text(item.get("title", ""))
    if not title or not url:
        return None

    source = normalize_source(str(item.get("source", "ITmedia NEWS")).strip())
    published_at = str(item.get("published_at", "")).strip()
    if not published_at and item.get("date"):
        published_at = f"{item['date']} 00:00:00"

    summary = clean_text(item.get("summary", ""))
    category = str(item.get("category") or "").strip()
    if category not in CATEGORIES:
        category = infer_category(title=title, source=source, summary=summary)

    return {
        "source": source,
        "title": title,
        "url": url,
        "summary": summary,
        "importance": normalize_importance(item.get("importance", item.get("score", 1))),
        "category": category,
        "reason": clean_text(item.get("reason", "")),
        "published_at": published_at,
        "created_at": str(item.get("created_at") or now_jst_string()).strip(),
    }


def save_articles(selected_articles: list[dict], candidate_articles: list[dict], *, replace: bool = False) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    candidate_map = {item["url"]: item for item in candidate_articles}
    by_url: dict[str, dict] = {}

    if not replace:
        for item in load_existing():
            migrated = migrate_existing_item(item)
            if migrated:
                by_url[migrated["url"]] = migrated

    saved_count = 0
    updated_count = 0
    for item in selected_articles:
        normalized = normalize_news_item(item, candidate_map)
        if not normalized:
            continue
        if normalized["importance"] == 0:
            print(f"除外: {normalized['title']} / 重要度0")
            continue

        url = normalized["url"]
        if url in by_url:
            original_created_at = by_url[url].get("created_at")
            by_url[url].update(normalized)
            if original_created_at:
                by_url[url]["created_at"] = original_created_at
            updated_count += 1
            print(f"更新: {normalized['title']} / 重要度{normalized['importance']} / {normalized['category']}")
        else:
            by_url[url] = normalized
            saved_count += 1
            print(f"保存: {normalized['title']} / 重要度{normalized['importance']} / {normalized['category']}")

    sorted_items = sort_news(apply_retention(list(by_url.values())))
    DATA_PATH.write_text(json.dumps(sorted_items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"保存完了: 新規{saved_count}件 / 更新{updated_count}件 / 合計{len(sorted_items)}件")


def main() -> None:
    args = parse_args()
    requested_date = target_date_from_args(args.target_date)
    all_articles = fetch_feed_articles()
    articles = filter_articles_by_date(all_articles, requested_date)
    target_date = requested_date

    if not articles and args.target_date is None:
        fallback_date = latest_available_date(all_articles)
        if fallback_date and fallback_date != requested_date:
            print(f"{requested_date} のRSS記事がないため、最新取得日の {fallback_date} に切り替えます。")
            target_date = fallback_date
            articles = filter_articles_by_date(all_articles, target_date)

    if not articles:
        print(f"{target_date} の記事が見つかりません。既存データからサイトを再生成します。")
        save_articles([], [], replace=args.replace)
        build_editions()
        return

    print(f"{target_date} の候補記事を {len(articles)} 件取得しました。")
    selected_articles = deterministic_fallback(articles) if args.skip_openai else select_and_summarize_articles(articles)
    save_articles(selected_articles, articles, replace=args.replace)
    build_editions()


if __name__ == "__main__":
    main()
