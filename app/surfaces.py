from __future__ import annotations

import hashlib
import re
import unicodedata
from collections import defaultdict
from dataclasses import replace
from datetime import date, timedelta
from difflib import SequenceMatcher
from typing import Callable, Iterable

from .models import Article, Story

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

SOURCE_PRIORITY = {
    "ITmedia NEWS": 0,
    "ITmedia AI+": 1,
    "＠IT": 2,
    "Publickey": 3,
    "CNET Japan": 4,
    "Impress Watch": 5,
}

AI_KEYWORDS = {
    "ai",
    "chatgpt",
    "openai",
    "gemini",
    "claude",
    "llm",
    "copilot",
    "codex",
    "anthropic",
    "アンソロピック",
    "mythos",
    "ミトス",
    "生成ai",
    "人工知能",
    "エージェント",
    "大規模言語モデル",
}
SECURITY_KEYWORDS = {
    "cve",
    "rce",
    "脆弱性",
    "セキュリティ",
    "攻撃",
    "侵害",
    "マルウェア",
    "ランサム",
    "フィッシング",
    "サイバー",
    "vpn",
}
ENTERPRISE_KEYWORDS = {
    "企業",
    "業務",
    "運用",
    "障害",
    "サーバ",
    "データセンター",
    "インフラ",
    "バックアップ",
    "nas",
    "vdi",
    "microsoft 365",
}
DEVELOPMENT_KEYWORDS = {
    "github",
    "gitlab",
    "vscode",
    "vs code",
    "typescript",
    "python",
    "java",
    "api",
    "sdk",
    "devops",
    "開発",
    "プログラミング",
    "web標準",
    "エンジニア",
    "コード",
}
CLOUD_KEYWORDS = {
    "aws",
    "azure",
    "gcp",
    "cloud",
    "クラウド",
    "kubernetes",
    "docker",
    "serverless",
}
URGENT_KEYWORDS = {
    "緊急",
    "停止",
    "障害",
    "攻撃",
    "脆弱性",
    "閉鎖",
    "終了",
    "注意喚起",
}


def normalize_source(source: str) -> str:
    source = unicodedata.normalize("NFKC", (source or "").strip())
    if source in {"?IT", "@IT", "＠IT", "・IT"}:
        return "＠IT"
    if source.lower() in {"itmedia ai+", "itmedia ai plus"}:
        return "ITmedia AI+"
    return source


def normalize_title(title: str) -> str:
    text = unicodedata.normalize("NFKC", title or "").lower()
    text = re.sub(r"[「」『』【】\[\]（）()、。・,，:：;；!?！？\"'“”‘’]", " ", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^0-9a-zぁ-んァ-ヶ一-龥々ー\s.+#/-]", "", text)
    return text.strip()


def keyword_hits(text: str, keywords: set[str]) -> int:
    normalized = normalize_title(text)
    return sum(1 for keyword in keywords if keyword in normalized)


def infer_category(title: str, source: str = "", summary: str = "") -> str:
    normalized_source = normalize_source(source)
    search_text = f"{title} {summary}"
    normalized_text = normalize_title(search_text)
    if keyword_hits(search_text, SECURITY_KEYWORDS):
        return "セキュリティ"
    if keyword_hits(search_text, AI_KEYWORDS):
        return "AI"
    if normalized_source == "Publickey" or keyword_hits(search_text, DEVELOPMENT_KEYWORDS):
        return "開発"
    if keyword_hits(search_text, CLOUD_KEYWORDS):
        return "クラウド"
    if normalized_source == "＠IT" or keyword_hits(search_text, ENTERPRISE_KEYWORDS):
        return "企業IT"
    if re.search(r"半導体|gpu|nvidia|tsmc|intel|amd", normalized_text):
        return "半導体"
    if re.search(r"スマホ|iphone|android|switch|pc|端末|ガジェット", normalized_text):
        return "ガジェット"
    if re.search(r"買収|提携|決算|売上|事業|企業|市場", normalized_text):
        return "ビジネス"
    if re.search(r"規制|法令|法案|訴訟|個人情報|プライバシー", normalized_text):
        return "法規制"
    return "その他"


def article_search_text(article: Article) -> str:
    return f"{article.title} {article.summary}"


def infer_facets(article: Article) -> list[str]:
    facets: set[str] = set()
    text = article_search_text(article)
    source = normalize_source(article.source)
    category = article.category if article.category in CATEGORIES else infer_category(article.title, source, article.summary)

    if category == "AI" or keyword_hits(text, AI_KEYWORDS):
        facets.add("ai")
    if category == "セキュリティ" or keyword_hits(text, SECURITY_KEYWORDS):
        facets.add("security")
        facets.add("enterprise_it")
    if category in {"企業IT", "ビジネス"} or source == "＠IT" or keyword_hits(text, ENTERPRISE_KEYWORDS):
        facets.add("enterprise_it")
    if category == "開発" or source == "Publickey" or keyword_hits(text, DEVELOPMENT_KEYWORDS):
        facets.add("development")
    if category == "クラウド" or keyword_hits(text, CLOUD_KEYWORDS):
        facets.add("cloud")
        facets.add("development")

    return sorted(facets)


def story_similarity(left: Story, right: Article) -> float:
    title_ratio = SequenceMatcher(
        None,
        normalize_title(left.title),
        normalize_title(right.title),
    ).ratio()
    same_day_window = abs((left.published_date - right.published_date).days) <= 3
    return title_ratio if same_day_window else 0.0


def article_to_story(article: Article) -> Story:
    source = normalize_source(article.source)
    normalized = normalize_title(article.title)
    category = article.category if article.category in CATEGORIES else infer_category(article.title, source, article.summary)
    story_id = hashlib.sha1(
        f"{article.published_date.isoformat()}::{normalized}".encode("utf-8")
    ).hexdigest()[:12]
    facets = infer_facets(article)
    search_text = article_search_text(article)
    return Story(
        id=story_id,
        title=article.title,
        published_date=article.published_date,
        importance_score=article.importance,
        representative_source=source,
        representative_url=article.url,
        sources=[source],
        facets=facets,
        category=category,
        summary=article.summary,
        reason=article.reason,
        published_at=article.published_at,
        created_at=article.created_at,
        ai_relevance_score=keyword_hits(search_text, AI_KEYWORDS),
        practical_impact_score=(
            keyword_hits(search_text, SECURITY_KEYWORDS)
            + keyword_hits(search_text, ENTERPRISE_KEYWORDS)
        ),
        dev_cloud_relevance_score=(
            keyword_hits(search_text, DEVELOPMENT_KEYWORDS)
            + keyword_hits(search_text, CLOUD_KEYWORDS)
        ),
        urgency_score=keyword_hits(search_text, URGENT_KEYWORDS),
        utility_score=(
            keyword_hits(search_text, DEVELOPMENT_KEYWORDS)
            + keyword_hits(search_text, ENTERPRISE_KEYWORDS)
        ),
    )


def merge_article(story: Story, article: Article) -> Story:
    source = normalize_source(article.source)
    sources = sorted(set(story.sources + [source]), key=lambda s: SOURCE_PRIORITY.get(s, 99))
    facets = sorted(set(story.facets + infer_facets(article)))
    candidate = article_to_story(article)

    representative = story
    current_priority = SOURCE_PRIORITY.get(story.representative_source, 99)
    candidate_priority = SOURCE_PRIORITY.get(source, 99)
    if candidate_priority < current_priority:
        representative = replace(
            story,
            title=article.title,
            representative_source=source,
            representative_url=article.url,
            category=candidate.category,
            summary=article.summary,
            reason=article.reason,
            published_at=article.published_at,
            created_at=article.created_at,
        )

    fill_values = {}
    if not representative.summary and article.summary:
        fill_values["summary"] = article.summary
    if not representative.reason and article.reason:
        fill_values["reason"] = article.reason
    if not representative.published_at and article.published_at:
        fill_values["published_at"] = article.published_at
    if representative.category not in CATEGORIES and candidate.category:
        fill_values["category"] = candidate.category
    if fill_values:
        representative = replace(representative, **fill_values)

    return replace(
        representative,
        importance_score=max(story.importance_score, article.importance),
        sources=sources,
        article_count=story.article_count + 1,
        facets=facets,
        ai_relevance_score=max(story.ai_relevance_score, candidate.ai_relevance_score),
        practical_impact_score=max(
            story.practical_impact_score,
            candidate.practical_impact_score,
        ),
        dev_cloud_relevance_score=max(
            story.dev_cloud_relevance_score,
            candidate.dev_cloud_relevance_score,
        ),
        urgency_score=max(story.urgency_score, candidate.urgency_score),
        utility_score=max(story.utility_score, candidate.utility_score),
    )


def build_stories(articles: Iterable[Article]) -> list[Story]:
    stories: list[Story] = []
    for article in sorted(articles, key=lambda item: (item.published_date, item.title)):
        exact_match = next(
            (
                story
                for story in stories
                if normalize_title(story.title) == normalize_title(article.title)
                and abs((story.published_date - article.published_date).days) <= 3
            ),
            None,
        )
        if exact_match:
            merged = merge_article(exact_match, article)
            stories[stories.index(exact_match)] = merged
            continue

        conservative_match = next(
            (
                story
                for story in stories
                if story_similarity(story, article) >= 0.92
            ),
            None,
        )
        if conservative_match:
            merged = merge_article(conservative_match, article)
            stories[stories.index(conservative_match)] = merged
            continue

        stories.append(article_to_story(article))
    return stories


def sort_general(stories: Iterable[Story]) -> list[Story]:
    return sorted(
        stories,
        key=lambda story: (
            -story.importance_score,
            -story.urgency_score,
            -story.source_count,
            -story.published_date.toordinal(),
        ),
    )


def select_top_yesterday(stories: Iterable[Story], edition_date: date) -> list[Story]:
    target_date = edition_date - timedelta(days=1)
    yesterday = [story for story in stories if story.published_date == target_date]

    itmedia_candidates = [
        story
        for story in yesterday
        if story.has_itmedia_article and story.importance_score >= 4
    ]
    selected_itmedia = sort_general(itmedia_candidates)[:5]
    if len(selected_itmedia) < 5:
        fillers = [
            story
            for story in yesterday
            if story.has_itmedia_article
            and story.importance_score == 3
            and story.id not in {item.id for item in selected_itmedia}
        ]
        selected_itmedia.extend(sort_general(fillers)[: 5 - len(selected_itmedia)])

    external_candidates = [
        story
        for story in yesterday
        if not story.has_itmedia_article
        and story.importance_score >= 4
        and (
            story.urgency_score > 0
            or story.source_count >= 2
            or bool(set(story.facets) & {"ai", "enterprise_it", "security", "development", "cloud"})
        )
    ]
    selected_external = sort_general(external_candidates)[:3]
    return selected_itmedia + selected_external


def select_recent_important(stories: Iterable[Story], edition_date: date) -> list[Story]:
    end = edition_date - timedelta(days=1)
    start = end - timedelta(days=2)
    candidates = [
        story
        for story in stories
        if start <= story.published_date <= end and story.importance_score >= 4
    ]
    return sort_general(candidates)


def _select_specialized(
    stories: Iterable[Story],
    edition_date: date,
    required_facets: set[str],
    limit: int,
    minimum_score: int,
    include_score_two_when: Callable[[Story], bool] | None = None,
) -> list[Story]:
    target_date = edition_date - timedelta(days=1)
    candidates = [
        story
        for story in stories
        if story.published_date == target_date
        and bool(set(story.facets) & required_facets)
        and (
            story.importance_score >= minimum_score
            or (
                story.importance_score == 2
                and include_score_two_when is not None
                and include_score_two_when(story)
            )
        )
    ]
    return sort_general(candidates)[:limit]


def select_yesterday_ai(stories: Iterable[Story], edition_date: date) -> list[Story]:
    return _select_specialized(
        stories,
        edition_date,
        required_facets={"ai"},
        limit=15,
        minimum_score=3,
        include_score_two_when=lambda story: story.ai_relevance_score > 0,
    )


def select_yesterday_enterprise_it(
    stories: Iterable[Story],
    edition_date: date,
) -> list[Story]:
    return _select_specialized(
        stories,
        edition_date,
        required_facets={"enterprise_it", "security"},
        limit=15,
        minimum_score=3,
        include_score_two_when=lambda story: story.practical_impact_score > 0,
    )


def select_yesterday_development(stories: Iterable[Story], edition_date: date) -> list[Story]:
    return _select_specialized(
        stories,
        edition_date,
        required_facets={"development", "cloud"},
        limit=15,
        minimum_score=2,
    )


def build_edition(stories: Iterable[Story], edition_date: date) -> dict[str, list[Story]]:
    return {
        "top_yesterday": select_top_yesterday(stories, edition_date),
        "recent_important": select_recent_important(stories, edition_date),
        "yesterday_ai": select_yesterday_ai(stories, edition_date),
        "yesterday_enterprise_it": select_yesterday_enterprise_it(stories, edition_date),
        "yesterday_development": select_yesterday_development(stories, edition_date),
    }


def group_by_facet(stories: Iterable[Story]) -> dict[str, list[Story]]:
    grouped: dict[str, list[Story]] = defaultdict(list)
    for story in stories:
        grouped["all"].append(story)
        for facet in story.facets:
            grouped[facet].append(story)
    return grouped
