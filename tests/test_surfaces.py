from datetime import date
import unittest

from app.models import Story
from app.surfaces import (
    select_recent_important,
    select_top_yesterday,
    select_yesterday_ai,
    select_yesterday_development,
    select_yesterday_enterprise_it,
)


def story(
    story_id: str,
    day: str,
    score: int,
    sources: list[str],
    facets: list[str] | None = None,
    *,
    urgency: int = 0,
    ai: int = 0,
    practical: int = 0,
) -> Story:
    return Story(
        id=story_id,
        title=story_id,
        published_date=date.fromisoformat(day),
        importance_score=score,
        representative_source=sources[0],
        representative_url=f"https://example.com/{story_id}",
        sources=sources,
        facets=facets or [],
        urgency_score=urgency,
        ai_relevance_score=ai,
        practical_impact_score=practical,
    )


class SurfaceSelectionTests(unittest.TestCase):
    def test_top_uses_previous_day_and_source_slots(self) -> None:
        edition_date = date(2026, 5, 19)
        stories = [
            story("it-4", "2026-05-18", 4, ["ITmedia NEWS"]),
            story("it-3", "2026-05-18", 3, ["ITmedia NEWS"]),
            story("ext-4", "2026-05-18", 4, ["＠IT"], ["security"], urgency=1),
            story("today", "2026-05-19", 5, ["ITmedia NEWS"]),
        ]

        selected = select_top_yesterday(stories, edition_date)
        self.assertEqual([item.id for item in selected], ["it-4", "it-3", "ext-4"])

    def test_recent_important_includes_previous_day_with_three_day_window(self) -> None:
        edition_date = date(2026, 5, 19)
        stories = [
            story("d1", "2026-05-16", 4, ["ITmedia NEWS"]),
            story("d2", "2026-05-17", 4, ["ITmedia NEWS"]),
            story("d3", "2026-05-18", 5, ["ITmedia NEWS"]),
            story("outside", "2026-05-15", 5, ["ITmedia NEWS"]),
        ]

        selected = select_recent_important(stories, edition_date)
        self.assertEqual([item.id for item in selected], ["d3", "d2", "d1"])

    def test_specialized_surfaces_follow_previous_day_rules(self) -> None:
        edition_date = date(2026, 5, 19)
        stories = [
            story("ai3", "2026-05-18", 3, ["ITmedia NEWS"], ["ai"], ai=1),
            story("ai2", "2026-05-18", 2, ["ITmedia NEWS"], ["ai"], ai=1),
            story("ent2", "2026-05-18", 2, ["＠IT"], ["enterprise_it"], practical=1),
            story("dev2", "2026-05-18", 2, ["Publickey"], ["development"]),
            story("wrong-day", "2026-05-17", 5, ["Publickey"], ["development"]),
        ]

        self.assertEqual(
            [item.id for item in select_yesterday_ai(stories, edition_date)],
            ["ai3", "ai2"],
        )
        self.assertEqual(
            [item.id for item in select_yesterday_enterprise_it(stories, edition_date)],
            ["ent2"],
        )
        self.assertEqual(
            [item.id for item in select_yesterday_development(stories, edition_date)],
            ["dev2"],
        )


if __name__ == "__main__":
    unittest.main()
