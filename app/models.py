from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable


@dataclass(frozen=True)
class Article:
    source: str
    published_date: date
    title: str
    url: str
    importance: int
    category: str = "その他"
    summary: str = ""
    reason: str = ""
    published_at: str = ""
    created_at: str = ""

    @property
    def score(self) -> int:
        """Backward-compatible alias for the first MVP scoring field."""
        return self.importance


@dataclass
class Story:
    id: str
    title: str
    published_date: date
    importance_score: int
    representative_source: str
    representative_url: str
    sources: list[str] = field(default_factory=list)
    article_count: int = 1
    facets: list[str] = field(default_factory=list)
    category: str = "その他"
    summary: str = ""
    reason: str = ""
    published_at: str = ""
    created_at: str = ""
    ai_relevance_score: int = 0
    practical_impact_score: int = 0
    dev_cloud_relevance_score: int = 0
    urgency_score: int = 0
    utility_score: int = 0

    @property
    def source_count(self) -> int:
        return len(set(self.sources))

    @property
    def has_itmedia_article(self) -> bool:
        return any(source.startswith("ITmedia") for source in self.sources)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "published_date": self.published_date.isoformat(),
            "importance_score": self.importance_score,
            "category": self.category,
            "summary": self.summary,
            "reason": self.reason,
            "published_at": self.published_at,
            "created_at": self.created_at,
            "representative_source": self.representative_source,
            "representative_url": self.representative_url,
            "sources": self.sources,
            "source_count": self.source_count,
            "article_count": self.article_count,
            "facets": self.facets,
            "ai_relevance_score": self.ai_relevance_score,
            "practical_impact_score": self.practical_impact_score,
            "dev_cloud_relevance_score": self.dev_cloud_relevance_score,
            "urgency_score": self.urgency_score,
            "utility_score": self.utility_score,
            "has_itmedia_article": self.has_itmedia_article,
        }


def stories_to_dicts(stories: Iterable[Story]) -> list[dict]:
    return [story.to_dict() for story in stories]
