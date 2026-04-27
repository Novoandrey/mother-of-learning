"""
Pytest suite for scrape_dndsu.parse_item.

Run:
    cd mat-ucheniya/scripts && python3 -m pytest test_scrape_dndsu.py -v

The parser is exercised against the markdown fixtures in
``dndsu-cache-fixtures/``. Network code is not tested here (covered
manually during the T011 full scrape run).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scrape_dndsu import (
    ItemRecord,
    map_category,
    map_rarity,
    map_slot,
    parse_first_bullet,
    parse_header,
    parse_item,
    url_to_slug_and_id,
)

FIXTURES = Path(__file__).parent / "dndsu-cache-fixtures"


def load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Helper unit tests (small, fast)
# ---------------------------------------------------------------------------


def test_map_rarity_known_words():
    assert map_rarity("обычный") == "common"
    assert map_rarity("необычное") == "uncommon"
    assert map_rarity("редкая") == "rare"
    assert map_rarity("очень редкий") == "very-rare"
    assert map_rarity("Легендарный") == "legendary"
    assert map_rarity("артефакт") == "artifact"


def test_map_rarity_variable():
    assert map_rarity("качество варьируется") is None
    assert map_rarity("редкость варьируется") is None


def test_map_category_basic():
    assert map_category("Оружие (любое)") == "weapon"
    assert map_category("Доспех (средний или тяжёлый)") == "armor"
    assert map_category("Кольцо") == "magic-item"
    assert map_category("Чудесный предмет") == "wondrous"


def test_map_slot_weapon_inference():
    assert map_slot("Оружие (длинный меч)") == "1-handed"
    assert map_slot("Оружие (двуручный меч)") == "2-handed"
    assert map_slot("Оружие (длинный лук)") == "ranged"


def test_url_to_slug_and_id():
    assert url_to_slug_and_id("https://dnd.su/items/1-adamantine-armor/") == (
        "1",
        "adamantine-armor",
    )
    assert url_to_slug_and_id("https://dnd.su/items/2489-bloodwell-vial/") == (
        "2489",
        "bloodwell-vial",
    )


# ---------------------------------------------------------------------------
# Header / first-bullet structural tests
# ---------------------------------------------------------------------------


def test_parse_header_adamantine():
    header = parse_header(load("1-adamantine-armor.md"))
    assert header is not None
    assert header["title_ru"] == "Адамантиновый доспех"
    assert header["title_en"] == "Adamantine armor"
    assert header["source_badge"] == "DMG"
    assert header["edition"] == "5e14"


def test_parse_header_5e24_skip():
    """Synthetic 2024-edition page must be flagged via edition='5e24'."""
    md = "## Some Item [Some Item]DMG24\n\n* Чудесный предмет, обычный\n\n## Комментарии\n"
    header = parse_header(md)
    assert header is not None
    assert header["edition"] == "5e24"


def test_parse_first_bullet_umbrella_weapon():
    bullet = parse_first_bullet(load("160-weapon-1-2-3.md"))
    assert bullet is not None
    assert bullet["kind"] == "umbrella"
    assert bullet["type_clause"] == "Оружие (любое)"
    assert bullet["requires_attunement"] is False
    assert bullet["tiers"] == [(1, "uncommon"), (2, "rare"), (3, "very-rare")]


def test_parse_first_bullet_umbrella_bloodwell():
    bullet = parse_first_bullet(load("2489-bloodwell-vial.md"))
    assert bullet is not None
    assert bullet["kind"] == "umbrella"
    assert bullet["type_clause"] == "Чудесный предмет"
    assert bullet["requires_attunement"] is True
    assert bullet["tiers"] == [(1, "uncommon"), (2, "rare"), (3, "very-rare")]


def test_parse_first_bullet_single_with_parenthetical_comma():
    """Adamantine armor's type clause has a comma inside parentheses —
    must NOT be split between type_clause and rarity_phrase."""
    bullet = parse_first_bullet(load("1-adamantine-armor.md"))
    assert bullet is not None
    assert bullet["kind"] == "single"
    assert bullet["type_clause"] == "Доспех (средний или тяжёлый, кроме шкурного)"
    assert bullet["rarity_phrase"].lower() == "необычный"
    assert bullet["requires_attunement"] is False


def test_parse_first_bullet_single_with_attunement():
    bullet = parse_first_bullet(load("161-weapon-of-warning.md"))
    assert bullet is not None
    assert bullet["kind"] == "single"
    assert bullet["type_clause"] == "Оружие (любое)"
    assert bullet["rarity_phrase"].lower() == "необычное"
    assert bullet["requires_attunement"] is True


# ---------------------------------------------------------------------------
# Full parse_item tests — non-umbrella
# ---------------------------------------------------------------------------


def test_parse_item_adamantine_armor_full():
    records = parse_item(
        load("1-adamantine-armor.md"),
        "https://dnd.su/items/1-adamantine-armor/",
    )
    assert len(records) == 1
    r = records[0]
    assert isinstance(r, ItemRecord)
    assert r.srd_slug == "adamantine-armor"
    assert r.title_ru == "Адамантиновый доспех"
    assert r.title_en == "Adamantine armor"
    assert r.category == "armor"
    assert r.rarity == "uncommon"
    assert r.requires_attunement is False
    assert r.slot == "body"
    assert r.weight_lb is None
    assert r.price_range_text == "101-500 зм"
    assert "адамантином" in r.description_ru
    assert "критические попадания" in r.description_ru
    assert r.source_book == "Dungeon Master's Guide"
    assert r.source_book_short == "DMG"
    assert r.edition == "5e14"
    assert r.dndsu_url == "https://dnd.su/items/1-adamantine-armor/"
    assert r._warnings == []


def test_parse_item_weapon_of_warning_full():
    records = parse_item(
        load("161-weapon-of-warning.md"),
        "https://dnd.su/items/161-weapon-of-warning/",
    )
    assert len(records) == 1
    r = records[0]
    assert r.srd_slug == "weapon-of-warning"
    assert r.title_ru == "Оружие предупреждения"
    assert r.title_en == "Weapon of warning"
    assert r.category == "weapon"
    assert r.rarity == "uncommon"
    assert r.requires_attunement is True
    assert r.slot == "1-handed"  # generic weapon, no parenthetical hint
    assert r.price_range_text == "101-500 зм"
    assert "преимуществом проверки инициативы" in r.description_ru
    assert r.source_book == "Dungeon Master's Guide"
    assert r.source_book_short == "DMG"
    assert r.edition == "5e14"


# ---------------------------------------------------------------------------
# Full parse_item tests — umbrella expansion
# ---------------------------------------------------------------------------


def test_parse_item_weapon_1_2_3_emits_three_records():
    records = parse_item(
        load("160-weapon-1-2-3.md"),
        "https://dnd.su/items/160-weapon-1-2-3/",
    )
    assert len(records) == 3
    titles_ru = [r.title_ru for r in records]
    assert titles_ru == ["Оружие, +1", "Оружие, +2", "Оружие, +3"]
    titles_en = [r.title_en for r in records]
    assert titles_en == ["Weapon, +1", "Weapon, +2", "Weapon, +3"]
    rarities = [r.rarity for r in records]
    assert rarities == ["uncommon", "rare", "very-rare"]
    slugs = [r.srd_slug for r in records]
    assert slugs == [
        "weapon-plus-1",
        "weapon-plus-2",
        "weapon-plus-3",
    ]
    # Shared fields:
    for r in records:
        assert r.category == "weapon"
        assert r.requires_attunement is False
        assert r.dndsu_url == "https://dnd.su/items/160-weapon-1-2-3/"
        assert "бонус к броскам атаки и урона" in r.description_ru
        assert r.edition == "5e14"
        assert r.source_book_short == "DMG"


def test_parse_item_bloodwell_vial_emits_three_records_with_shared_attunement():
    records = parse_item(
        load("2489-bloodwell-vial.md"),
        "https://dnd.su/items/2489-bloodwell-vial/",
    )
    assert len(records) == 3
    titles_ru = [r.title_ru for r in records]
    assert titles_ru == [
        "Флакон с кровью, +1",
        "Флакон с кровью, +2",
        "Флакон с кровью, +3",
    ]
    rarities = [r.rarity for r in records]
    assert rarities == ["uncommon", "rare", "very-rare"]
    slugs = [r.srd_slug for r in records]
    assert slugs == [
        "bloodwell-vial-plus-1",
        "bloodwell-vial-plus-2",
        "bloodwell-vial-plus-3",
    ]
    for r in records:
        assert r.category == "wondrous"
        assert r.requires_attunement is True  # shared across tiers
        assert r.dndsu_url == "https://dnd.su/items/2489-bloodwell-vial/"
        assert r.source_book_short == "TCE"
        assert r.source_book == "Tasha's Cauldron of Everything"
        assert "Кость Хитов" in r.description_ru


# ---------------------------------------------------------------------------
# Edition gate
# ---------------------------------------------------------------------------


def test_parse_item_skips_5e24():
    md = (
        "## Sample Item [Sample Item]DMG24\n"
        "\n"
        "* Чудесный предмет, обычный\n"
        "* Описание.\n"
        "\n"
        "## Комментарии\n"
    )
    records = parse_item(md, "https://dnd.su/items/9999-sample-item/")
    assert records == []


def test_parse_item_returns_empty_for_non_item_page():
    records = parse_item("# Just an article\n\nText.\n", "https://dnd.su/articles/1/")
    assert records == []


def test_parse_item_returns_empty_for_empty_card():
    """Akmon-style page: H1 navigation present, but the H2 item card with
    type/rarity bullet is missing — content was likely migrated to 5e24.
    Parser must return [] without crashing."""
    records = parse_item(
        load("2107-akmon-empty-card.md"),
        "https://dnd.su/items/2107-akmon-hammer-of-purphoros/",
    )
    assert records == []
