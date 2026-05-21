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

from app.surfaces import infer_category, normalize_source  # noqa: E402
from scripts.build_editions import build as build_editions  # noqa: E402

JST = ZoneInfo("Asia/Tokyo")
UTC = ZoneInfo("UTC")
DATA_PATH = ROOT / "data" / "articles.json"

CATEGORIES = {
    "AI",
    "企業IT",
    "開発",
    "セキュリティ",
    "クラウド",
    "半導体",
    "ガジェット",
    "ビジネス",
    "法規制",
    "その他",
}

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
    parser = argparse.ArgumentParser(description="Fetch, select, summarize, and build Tech Radar 505.")
    parser.add_argument(
        "--target-date",
        help="Target published date in JST. Defaults to yesterday.",
    )
    parser.add_argument(
        "--skip-openai",
        action="store_true",
        help="Use deterministic fallback for local testing only. Production should use OpenAI.",
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


def fetch_articles(target_date: str) -> list[dict]:
    articles: list[dict] = []
    seen_urls: set[str] = set()

    for feed in FEEDS:
        parsed = feedparser.parse(feed["url"])
        source = normalize_source(feed["source"])
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
                    "source": source,
                    "title": title,
                    "url": url,
                    "published_at": published_at.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )

    return articles


def extract_json(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()
    data = json.loads(text)
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

    prompt = f"""
あなたはITニュース編集者です。
Tech Radar 505は、Tech Compass 505をニュースの網羅性側に発展させたサイトです。
取得元は複数媒体に広がりますが、重要度の判定基準はTech Compass 505と同じ厳しさにしてください。

以下の複数媒体RSS候補記事を、まず重要度0から5で絶対評価してください。
そのうえで、重要度1以上の記事だけを返してください。
重要なニュースが少ない場合は、少数でも構いません。
重要度0の記事は、候補が少なくても絶対に返さないでください。
候補が多い場合でも、広告色が強い記事、ランキング、キャンペーン、軽い小ネタは返さないでください。

選定基準:
- AI、企業IT、開発、セキュリティ、クラウド、半導体、OS、スマートフォン、ビジネス、法規制、プライバシーに関するニュースを重視する
- 技術トレンド、企業戦略、社会、仕事、生活への影響が大きいものを優先する
- 単なる小ネタ、広告色の強い記事、ランキング、キャンペーン、限定的な製品紹介は優先度を下げる
- 似たニュースが複数ある場合は、代表的な1件だけを選ぶ

重要度は0から5の整数で評価してください。
評価は厳しめにしてください。
重要度は保存期間にも使うため、迷った場合は高くしすぎず低めに評価してください。
追加ルール:
- 0と1の境界は「Tech Radar 505に載せる理由があるか」です。
- 1と2の境界は「掲載価値が明確か」です。
- 2と3の境界は「一部の読者に有用か、多くの読者が押さえるべきか」です。
- 3と4の境界は「知っておくべきか、判断や行動を変えうるか」です。
- 重要度4は社会、業界、開発者の広範囲に影響がある場合だけにしてください。
- 単なる新製品発表、新機能追加、キャンペーン、個別企業ニュースは原則2以下にしてください。市場構造、主要プラットフォーム、競争環境に広く波及する場合だけ3以上にしてください。
- 個人、芸能、炎上系の話題はIT社会への影響が明確でなければ2以下にしてください。
- セキュリティ事故は被害規模、影響を受ける利用者数、企業規模、再発防止への示唆で判定してください。
- AIニュースは「AI」という言葉があるだけでは高評価にせず、技術、規制、社会、業務、開発者への影響で判定してください。

重要度0:
- 掲載対象外
- Tech Radar 505の読者との関係が薄い
- 新規性が乏しい、既報の焼き直し、噂段階、広告・ランキング・軽い話題に近い
- 変化が小さく、知っても読者の理解や判断にほぼ影響しない
- 枠が余っても選ばない

重要度1:
- 掲載候補ではあるが低重要
- 読者に一定の関係があり、事実として新しい情報がある
- 影響は特定企業、特定製品、一部ユーザー、小規模な更新に限られる
- 知らなくても、多くの読者の判断はほぼ変わらない

重要度2:
- 掲載価値が明確にある
- 読者に関係する新情報があり、一定数の人の理解や判断に役立つ
- 単なる小ネタではなく、今後を追う意味がある
- ただし、影響範囲または変化量はまだ限定的で、多くの読者が必ず押さえるべき水準には届かない

重要度3:
- 重要ニュース
- 多くの読者が押さえる価値がある
- 主要企業、主要製品、主要技術、政策のいずれかに関する動きである
- 製品選択、事業判断、業界理解、今後の見通しのいずれかに明確な影響がある
- その日だけで終わらず、後から見ても意味が残る

重要度4:
- 非常に重要
- 多くの読者に関係し、主要企業、市場、技術動向、政策に関わる
- 読者の判断や行動を実際に変えうる
- 今後の競争環境、業界の流れ、主要プラットフォームの使われ方に強く影響する

重要度5:
- 重大ニュース
- 重要度4の条件を満たしたうえで、安全性、セキュリティ、法規制、社会的混乱のいずれかで重大なリスクがある
- 影響が広範囲かつ急速に及ぶ、または取り返しのつきにくい損失につながる
- 大規模サイバー攻撃、重大な規制変更、広範囲の障害、社会的混乱を伴う事故など
- 例外的に重要なニュースだけに使う

カテゴリは必ず次のどれかにしてください:
AI, 企業IT, 開発, セキュリティ, クラウド, 半導体, ガジェット, ビジネス, 法規制, その他

候補記事:
{candidates_json}

次のキーを持つJSON配列だけを返してください。説明文やコードブロックは不要です。
- source: 候補記事のsourceをそのまま入れる
- title
- url
- summary: 3行以内の日本語要約
- importance: 1から5の整数。重要度0の記事は返さない
- category
- reason: 選定理由を短く
- published_at
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
    title = str(item.get("title", "")).strip()
    if not title or not url:
        return None

    candidate = candidate_map.get(url, {})
    source = normalize_source(str(item.get("source") or candidate.get("source") or "").strip())
    category = str(item.get("category") or "").strip()
    if category not in CATEGORIES:
        category = infer_category(title=title, source=source)

    return {
        "source": source,
        "title": title,
        "url": url,
        "summary": str(item.get("summary", "")).strip(),
        "importance": normalize_importance(item.get("importance")),
        "category": category,
        "reason": str(item.get("reason", "")).strip(),
        "published_at": str(item.get("published_at") or candidate.get("published_at") or "").strip(),
        "created_at": now_jst_string(),
    }


def deterministic_fallback(articles: list[dict]) -> list[dict]:
    """Local-test fallback. GitHub production should use OpenAI selection."""
    selected = []
    for article in articles:
        title = article["title"]
        category = infer_category(title=title, source=article["source"])
        importance = 1
        if category in {"AI", "企業IT", "開発", "セキュリティ", "クラウド"}:
            importance += 1
        if re.search(r"脆弱|障害|停止|漏えい|攻撃|規制|訴訟|提携|買収|公開|廃止", title):
            importance += 1
        selected.append(
            {
                **article,
                "summary": "",
                "importance": min(5, importance),
                "category": category,
                "reason": "ローカル検証用のキーワード判定です。",
            }
        )
    return selected


def load_existing() -> list[dict]:
    if not DATA_PATH.exists():
        return []
    data = json.loads(DATA_PATH.read_text(encoding="utf-8-sig"))
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
    title = str(item.get("title", "")).strip()
    if not title or not url:
        return None

    source = normalize_source(str(item.get("source", "ITmedia NEWS")).strip())
    published_at = str(item.get("published_at", "")).strip()
    if not published_at and item.get("date"):
        published_at = f"{item['date']} 00:00:00"

    category = str(item.get("category") or "").strip()
    if category not in CATEGORIES:
        category = infer_category(title=title, source=source)

    return {
        "source": source,
        "title": title,
        "url": url,
        "summary": str(item.get("summary", "")).strip(),
        "importance": normalize_importance(item.get("importance", item.get("score", 1))),
        "category": category,
        "reason": str(item.get("reason", "")).strip(),
        "published_at": published_at,
        "created_at": str(item.get("created_at") or now_jst_string()).strip(),
    }


def save_articles(selected_articles: list[dict], candidate_articles: list[dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    candidate_map = {item["url"]: item for item in candidate_articles}
    by_url: dict[str, dict] = {}

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
    target_date = target_date_from_args(args.target_date)
    articles = fetch_articles(target_date)

    if not articles:
        print(f"No articles found for {target_date}. Building site with existing data.")
        save_articles([], [])
        build_editions()
        return

    selected_articles = deterministic_fallback(articles) if args.skip_openai else select_and_summarize_articles(articles)
    save_articles(selected_articles, articles)
    build_editions()


if __name__ == "__main__":
    main()

