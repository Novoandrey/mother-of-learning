"""
Pytest-набор для scrape_dndsu_spells.parse_spell (spec-059, этап 1).

Форк test_scrape_dndsu.py. Гоняет чистые парсеры на реальных markdown-
fixtures из dndsu-spells-cache-fixtures/ (захвачены с живого dnd.su /
next.dnd.su). Сетевой слой здесь не тестируется.

Run:
    cd mat-ucheniya/scripts && python -m pytest test_scrape_dndsu_spells.py -v
"""

from __future__ import annotations

from pathlib import Path

from scrape_dndsu_spells import (
    SpellRecord,
    merge_records,
    parse_h2,
    parse_spell,
    strip_md_links,
    url_to_slug_and_id,
)

FIXTURES = Path(__file__).parent / "dndsu-spells-cache-fixtures"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def _fireball_2014() -> SpellRecord:
    return parse_spell(load("205-fireball.md"), "https://dnd.su/spells/205-fireball/")


def _fireball_2024() -> SpellRecord:
    return parse_spell(
        load("10514-fireball-2024.md"),
        "https://next.dnd.su/spells/10514-fireball/",
    )


# ---------------------------------------------------------------------------
# Helper unit tests
# ---------------------------------------------------------------------------


def test_url_to_slug_and_id_both_domains():
    assert url_to_slug_and_id("https://dnd.su/spells/205-fireball/") == ("205", "fireball")
    assert url_to_slug_and_id("https://next.dnd.su/spells/10514-fireball/") == (
        "10514",
        "fireball",
    )
    # slug (хвост) — общий ключ пары редакций, несмотря на разные id.
    assert url_to_slug_and_id("https://dnd.su/spells/205-fireball/")[1] == (
        url_to_slug_and_id("https://next.dnd.su/spells/10514-fireball/")[1]
    )


def test_strip_md_links():
    assert strip_md_links("[Действие](/glossary/magic)") == "Действие"
    assert strip_md_links("[3 уровень](/x), [Воплощение](/y)") == "3 уровень, Воплощение"
    # Не-ссылочные скобки (бейдж [Fireball]PH14) не трогаются.
    assert strip_md_links("[Fireball]PH14") == "[Fireball]PH14"


def test_parse_h2_2014_has_badge():
    h = parse_h2(
        '## Огненный шар [Fireball]PH14 [PH24](https://next.dnd.su/spells/10514-fireball "…")'
    )
    assert h["title_ru"] == "Огненный шар"
    assert h["title_en"] == "Fireball"
    assert h["source_badge"] == "PH"
    assert h["edition_digits"] == "14"


def test_parse_h2_2024_no_badge():
    h = parse_h2(
        '##  Огненный шар [Fireball] [ ](https://5e14.dnd.su/spells/205-fireball "…")'
    )
    assert h["title_ru"] == "Огненный шар"
    assert h["title_en"] == "Fireball"
    assert h["source_badge"] is None


# ---------------------------------------------------------------------------
# parse_spell — fireball 2014 (base edition)
# ---------------------------------------------------------------------------


def test_parse_spell_fireball_2014_fields():
    r = _fireball_2014()
    assert isinstance(r, SpellRecord)
    assert r.slug == "fireball"
    assert r.title_ru == "Огненный шар"
    assert r.title_en == "Fireball"
    assert r.level == 3
    assert r.school == "воплощение"
    assert r.casting_time == "1 действие"
    assert r.range == "150 футов"
    assert r.components.startswith("В, С, М")
    assert "гуано" in r.components
    assert r.duration == "Мгновенная"
    # Fireball — НЕ концентрация и НЕ ритуал (проверено по факту).
    assert r.concentration is False
    assert r.ritual is False
    assert r.classes == ["волшебник", "чародей"]
    assert r.source_short == "PH"
    assert r.source == "Player's Handbook"
    assert r.dndsu_url == "https://dnd.su/spells/205-fireball/"
    # content = markdown-тело (начинается с H2, содержит "На больших уровнях").
    assert r.content.startswith("## Огненный шар")
    assert "На больших уровнях" in r.content
    # После merge-а прогон одиночной страницы даёт content_2024=None.
    assert r.content_2024 is None
    assert r._warnings == []


# ---------------------------------------------------------------------------
# parse_spell — fireball 2024 (разная форма статблока)
# ---------------------------------------------------------------------------


def test_parse_spell_fireball_2024_fields():
    r = _fireball_2024()
    assert r.slug == "fireball"
    assert r.level == 3
    # 2024 капитализирует школу и не имеет бейджа источника в H2.
    assert r.school == "Воплощение"
    assert r.source_short is None
    # Метка отличается ("Время сотворения"), значение раздевается от ссылки.
    assert r.casting_time == "Действие"
    assert r.range == "150 футов"
    assert r.components.startswith("В, C, М") or r.components.startswith("В, С, М")
    assert r.classes == ["Волшебник", "Чародей"]
    assert r.concentration is False
    assert r.ritual is False


# ---------------------------------------------------------------------------
# parse_spell — cantrip / concentration / ritual
# ---------------------------------------------------------------------------


def test_parse_spell_cantrip_level_zero():
    r = parse_spell(load("13-acid-splash.md"), "https://dnd.su/spells/13-acid-splash/")
    assert r.slug == "acid-splash"
    assert r.level == 0  # «Заговор» -> 0
    assert r.school == "вызов"
    assert r.components == "В, С"  # без материального компонента
    assert r.classes == ["волшебник", "изобретатель", "чародей"]
    assert r.concentration is False
    assert r.ritual is False


def test_parse_spell_concentration_true():
    r = parse_spell(load("9-bless.md"), "https://dnd.su/spells/9-bless/")
    assert r.slug == "bless"
    assert r.level == 1
    assert r.concentration is True
    assert "Концентрация" in r.duration


def test_parse_spell_ritual_and_concentration():
    r = parse_spell(load("detect-magic.md"), "https://dnd.su/spells/186-detect-magic/")
    assert r.slug == "detect-magic"
    assert r.ritual is True
    assert r.concentration is True
    assert r.range == "На себя"


# ---------------------------------------------------------------------------
# parse_spell — negative cases
# ---------------------------------------------------------------------------


def test_parse_spell_non_spell_page_returns_none():
    assert parse_spell("# Just an article\n\nText.\n", "https://dnd.su/articles/1/") is None


def test_parse_spell_heading_without_level_returns_none():
    md = "## Некая статья [Article]PH14\n\n* Просто текст без уровня.\n\n## Комментарии\n"
    assert parse_spell(md, "https://dnd.su/spells/9999-x/") is None


# ---------------------------------------------------------------------------
# merge_records — слияние двух редакций по slug
# ---------------------------------------------------------------------------


def test_merge_links_2024_into_content_2024():
    r14 = _fireball_2014()
    r24 = _fireball_2024()
    merged = merge_records({r14.slug: r14}, {r24.slug: r24})
    assert len(merged) == 1
    m = merged[0]
    assert m.slug == "fireball"
    # База — 2014: content = тело 2014, content_2024 = тело 2024.
    assert m.content.startswith("## Огненный шар")
    assert m.content_2024 is not None
    assert m.dndsu_url_2024 == "https://next.dnd.su/spells/10514-fireball/"


def test_merge_spell_without_2024_has_null_content_2024():
    r14 = parse_spell(load("9-bless.md"), "https://dnd.su/spells/9-bless/")
    merged = merge_records({r14.slug: r14}, {})
    assert len(merged) == 1
    assert merged[0].content_2024 is None


def test_merge_2024_only_becomes_base():
    r24 = _fireball_2024()
    merged = merge_records({}, {r24.slug: r24})
    assert len(merged) == 1
    m = merged[0]
    assert m.content.startswith("## ")
    assert "only_2024" in m._warnings
