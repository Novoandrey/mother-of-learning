"""
Scrape dnd.su magic items into a JSON intermediate.

Spec-018 — see .specify/specs/018-dndsu-magic-items/{spec,plan,tasks}.md.

Usage:
    python3 scrape_dndsu.py                       # full run, default output
    python3 scrape_dndsu.py --limit 20            # smoke test
    python3 scrape_dndsu.py --refresh             # invalidate disk cache
    python3 scrape_dndsu.py --from-id 200         # resume from item id 200
    python3 scrape_dndsu.py --output items.json   # custom output path

Architecture (post-T001/T002 recon, chat 76):
    1. discover_urls() fetches https://dnd.su/piece/items/index-list/ once,
       parses ~934 item links via BeautifulSoup.
    2. fetch_or_cached(url) returns markdown for a page. On miss it does
       requests.get -> strip nav/aside/footer/comments -> html2text ->
       cache to disk. Tests bypass the fetch and feed pre-rendered
       markdown fixtures from scripts/dndsu-cache-fixtures/ directly.
    3. parse_item(markdown, url) returns list[ItemRecord]:
         []   for skipped (wrong edition)
         [r]  for ordinary items
         [r1, r2, r3]  for umbrella items (rarity tier expansion;
                       see plan.md "Umbrella items" section).
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import Iterable, Optional

# Third-party imports are imported lazily inside Scraper methods so that
# `parse_item` and friends can be unit-tested without requests/bs4/html2text
# installed (only stdlib is needed for parsing markdown fixtures).

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

INDEX_URL = "https://dnd.su/piece/items/index-list/"
BASE_URL = "https://dnd.su"
USER_AGENT = (
    "MoL spec-018 research bot "
    "(https://github.com/Novoandrey/mother-of-learning)"
)
RATE_LIMIT_S = 1.0
RETRY_BACKOFFS = (1, 2, 4, 8)  # seconds

SCRIPT_DIR = Path(__file__).parent
DEFAULT_CACHE_DIR = SCRIPT_DIR / "dndsu-cache"
DEFAULT_OUTPUT = SCRIPT_DIR / "dndsu_items.json"

# Module-level logger so pure-fn helpers (parse_item) can surface skip
# reasons without taking a logger argument.
log = logging.getLogger("scrape_dndsu")

# ---------------------------------------------------------------------------
# Vocabulary maps (Russian dnd.su strings -> our enum slugs)
# ---------------------------------------------------------------------------

# Rarity word stems -> rarity slug.
# Match against the lowercased rarity phrase; first stem hit wins.
# Order matters: "необычн" must come before "обычн" (substring trap),
# and "очень редк" before "редк". The `артефакт` stem is at the end.
RARITY_MAP: list[tuple[str, str]] = [
    ("необычн", "uncommon"),
    ("очень редк", "very-rare"),
    ("обычн", "common"),
    ("редк", "rare"),
    ("легендарн", "legendary"),
    ("артефакт", "artifact"),
]

# Top-level type word -> our category_slug.
# Order matters: weapons/armor checked before generic "wondrous".
CATEGORY_MAP: list[tuple[str, str]] = [
    ("оружие", "weapon"),
    ("доспех", "armor"),
    ("щит", "armor"),
    ("кольцо", "magic-item"),
    ("плащ", "wondrous"),
    ("амулет", "wondrous"),
    ("сапоги", "wondrous"),
    ("ботинки", "wondrous"),
    ("перчатки", "wondrous"),
    ("рукавицы", "wondrous"),
    ("шлем", "wondrous"),
    ("корона", "wondrous"),
    ("диадема", "wondrous"),
    ("пояс", "wondrous"),
    ("зелье", "consumable"),
    ("свиток", "consumable"),
    ("жезл", "magic-item"),
    ("палочка", "magic-item"),
    ("посох", "magic-item"),
    ("чудесный предмет", "wondrous"),
]
DEFAULT_CATEGORY = "magic-item"

# Top-level type word -> our slot_slug (lossy).
SLOT_MAP: list[tuple[str, str]] = [
    ("кольцо", "ring"),
    ("плащ", "cloak"),
    ("амулет", "amulet"),
    ("талисман", "amulet"),
    ("сапоги", "boots"),
    ("ботинки", "boots"),
    ("перчатки", "gloves"),
    ("рукавицы", "gloves"),
    ("шлем", "headwear"),
    ("корона", "headwear"),
    ("диадема", "headwear"),
    ("пояс", "belt"),
    ("щит", "shield"),
    ("доспех", "body"),
]

# Source-code badge -> human-readable book name.
# Codes ending in `14` are 5e14 books; `24` would mean 5e24 (we skip those).
SOURCE_BOOKS: dict[str, str] = {
    "DMG": "Dungeon Master's Guide",
    "PHB": "Player's Handbook",
    "MM": "Monster Manual",
    "XGE": "Xanathar's Guide to Everything",
    "TCE": "Tasha's Cauldron of Everything",
    "VRGR": "Van Richten's Guide to Ravenloft",
    "IDRF": "Icewind Dale: Rime of the Frostmaiden",
    "WBtW": "The Wild Beyond the Witchlight",
    "BGDA": "Baldur's Gate: Descent into Avernus",
    "CoS": "Curse of Strahd",
    "EGtW": "Explorer's Guide to Wildemount",
    "ERLW": "Eberron: Rising from the Last War",
    "FToD": "Fizban's Treasury of Dragons",
    "GGR": "Guildmasters' Guide to Ravnica",
    "MTF": "Mordenkainen's Tome of Foes",
    "MOoT": "Mythic Odysseys of Theros",
    "AI": "Acquisition Incorporated",
    "VGM": "Volo's Guide to Monsters",
    "BPGotG": "Bigby Presents: Glory of the Giants",
    "TBoMT": "The Book of Many Things",
    "JttRC": "Journeys through the Radiant Citadel",
    "KftGV": "Keys from the Golden Vault",
    "SaiS": "Spelljammer: Adventures in Space",
    "PSAitM": "Planescape: Adventures in the Multiverse",
    "HotDQ": "Hoard of the Dragon Queen",
    "SCC": "Strixhaven: A Curriculum of Chaos",
    "TfYP": "Tales from the Yawning Portal",
    "ToA": "Tomb of Annihilation",
    "WDH": "Waterdeep: Dragon Heist",
    "WDMM": "Waterdeep: Dungeon of the Mad Mage",
    "VEoR": "Vecna: Eve of Ruin",
    "DSotDQ": "Dragonlance: Shadow of the Dragon Queen",
    "CM": "Candlekeep Mysteries",
    "CRCotN": "Critical Role: Call of the Netherdeep",
    "GoS": "Ghosts of Saltmarsh",
    "OotA": "Out of the Abyss",
    "PotA": "Princes of the Apocalypse",
    "PaB": "Phandelver and Below: The Shattered Obelisk",
    "LMoP": "Lost Mine of Phandelver",
    "SKT": "Storm King's Thunder",
    "RoT": "The Rise of Tiamat",
    "IMR": "Infernal Machine Rebuild",
}


# ---------------------------------------------------------------------------
# Data shape
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class ItemRecord:
    """One catalog entry. Umbrellas emit N records (one per rarity tier)."""

    srd_slug: str
    title_ru: str
    title_en: Optional[str]
    category: str
    rarity: Optional[str]
    requires_attunement: bool
    slot: Optional[str]
    weight_lb: Optional[float]
    price_range_text: Optional[str]
    description_ru: str
    source_book: Optional[str]
    source_book_short: Optional[str]
    edition: str
    dndsu_url: str
    _warnings: list[str] = dataclasses.field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# Pure parser helpers (no I/O, importable for tests)
# ---------------------------------------------------------------------------

# Header line in markdown: `## Title [English Title]CODE` (CODE may have edition
# suffix, e.g. DMG14). The shape is parsed structurally in `_split_header_line`
# rather than via a single monolithic regex — too many optional fields confuse
# Python's regex engine with non-greedy quantifiers.

# Umbrella first-bullet: "<тип>, редкость варьируется (+1 X, +2 Y, +3 Z[, требуется настройка ...])".
# Note: `.+?` for type_clause (allows commas inside parentheticals like
# "Доспех (средний или тяжёлый, кроме шкурного)"). The literal phrase
# "редкость варьируется" anchors the boundary.
UMBRELLA_RE = re.compile(
    r"^\s*\*\s+"
    r"(?P<type_clause>.+?)"
    r",\s*редкость\s+варьируется\s*"
    r"\(\s*(?P<tiers>(?:\+\d+\s+[а-яё ]+?,\s*)+\+\d+\s+[а-яё ]+?)"
    r"(?P<attunement_clause>\s*,\s*требуется\s+настройк[ауи][^)]*)?"
    r"\s*\)\s*\.?\s*$",
    re.MULTILINE | re.IGNORECASE,
)

# Single-record first bullet: "<тип>, <редкость>[ (требуется настройка ...)]".
# Rarity phrase is an enumerated alternation so type_clause (`.+?`) can stretch
# past parenthetical commas without being eaten by a generic `[а-яё ]+?`.
SINGLE_BULLET_RE = re.compile(
    r"^\s*\*\s+"
    r"(?P<type_clause>.+?)"
    r",\s*(?P<rarity_phrase>"
    r"очень\s+редк[а-яё]*"
    r"|обычн[а-яё]*"
    r"|необычн[а-яё]*"
    r"|редк[а-яё]*"
    r"|легендарн[а-яё]*"
    r"|артефакт[а-яё]*"
    r"|качество\s+варьируется"
    r")"
    r"(?P<attunement_clause>\s*\(\s*требуется\s+настройк[ауи][^)]*\))?"
    r"\s*\.?\s*$",
    re.MULTILINE | re.IGNORECASE,
)

PRICE_RE = re.compile(
    r"^\s*\*\s+\*\*Рекомендованная стоимость:\*\*\s*(?P<price>.+?)\s*$",
    re.MULTILINE,
)

# Tier list inside umbrella regex: "+1 необычный", "+2 редкий", etc.
TIER_RE = re.compile(r"\+(?P<n>\d+)\s+(?P<rarity>[а-яё ]+?)(?=,|$)", re.IGNORECASE)


def map_rarity(phrase: str) -> Optional[str]:
    """Map a Russian rarity phrase to our slug; None for 'качество варьируется'."""
    p = phrase.lower().strip()
    if "качество варьируется" in p or "варьируется" in p:
        return None
    for stem, slug in RARITY_MAP:
        if stem in p:
            return slug
    return None


def map_category(type_clause: str) -> str:
    """Top-level category slug from the type clause (e.g. 'Оружие (длинный меч)')."""
    t = type_clause.lower().strip()
    for needle, slug in CATEGORY_MAP:
        if needle in t:
            return slug
    return DEFAULT_CATEGORY


def map_slot(type_clause: str) -> Optional[str]:
    """Equipment slot slug, with weapon-shape inference."""
    t = type_clause.lower().strip()
    if "оружие" in t:
        # Weapon parenthetical: "(длинный лук)", "(двуручный меч)" etc.
        if "двуручн" in t or "большой меч" in t or "глефа" in t:
            return "2-handed"
        if (
            "лук" in t
            or "арбалет" in t
            or "праща" in t
            or "метательн" in t
            or "духовая трубка" in t
            or "сеть" in t
        ):
            return "ranged"
        return "1-handed"
    for needle, slug in SLOT_MAP:
        if needle in t:
            return slug
    return None


def _split_header_line(line: str) -> Optional[dict]:
    """Split an item-header line of one of these shapes:

        "## Title [English Title]CODE"
        "## Title [English Title]CODE14"
        "## Title [English Title]CODE14 [CODE24](url \"...\")"
        "## Title CODE"  (no English title; rare)
        "## Title"        (rare; no badge — leave both as None)

    Returns a dict with keys title_ru / title_en / source_badge /
    edition_digits, or None if the line does not have at least a title.
    """
    body = line[3:].strip()  # drop leading "## "
    if not body:
        return None

    # Bracketed English title is optional. Anchor on `[` to split.
    bracket_m = re.match(r"^(?P<title_ru>[^\[]+?)\s*\[(?P<title_en>[^\]]+)\](?P<tail>.*)$", body)
    if bracket_m:
        title_ru = bracket_m.group("title_ru").strip()
        title_en = bracket_m.group("title_en").strip() or None
        tail = bracket_m.group("tail").strip()
    else:
        # No English-title bracket. Title runs until first whitespace+badge OR EOL.
        # Heuristic: look for trailing ALL-CAPS token that may be a source badge.
        m2 = re.match(r"^(?P<title_ru>.+?)\s+(?P<tail>[A-Z][A-Za-z0-9]*)\s*$", body)
        if m2:
            title_ru = m2.group("title_ru").strip()
            title_en = None
            tail = m2.group("tail").strip()
        else:
            return {
                "title_ru": body,
                "title_en": None,
                "source_badge": None,
                "edition_digits": "",
            }

    # tail = e.g. "DMG14" or "DMG14 [DMG24](https://next.dnd.su/...)" or empty.
    badge_m = re.match(r"^(?P<badge>[A-Za-z]+)(?P<digits>\d{2})?", tail)
    source_badge = badge_m.group("badge") if badge_m else None
    edition_digits = (badge_m.group("digits") or "") if badge_m else ""

    return {
        "title_ru": title_ru,
        "title_en": title_en,
        "source_badge": source_badge,
        "edition_digits": edition_digits,
    }


def parse_header(md: str) -> Optional[dict]:
    """Extract title_ru/title_en/source_badge/edition from the H2 line.

    Returns None if no recognisable item heading is present (not an item page).
    Strict edition gate: edition_digits == "24" -> caller treats as skip.
    """
    for line in md.splitlines():
        if not line.startswith("## "):
            continue
        if line.strip() in {"## Комментарии", "## Галерея", "## DnD.su"}:
            continue
        parts = _split_header_line(line)
        if not parts:
            continue
        edition = "5e24" if parts["edition_digits"] == "24" else "5e14"
        return {
            "title_ru": parts["title_ru"],
            "title_en": parts["title_en"],
            "source_badge": parts["source_badge"],
            "edition": edition,
            "edition_digits": parts["edition_digits"],
        }
    return None


def parse_first_bullet(md: str) -> Optional[dict]:
    """Locate the first `*` bullet that looks like the type/rarity line.

    Returns dict with kind='umbrella' or 'single' plus parsed groups, or None.
    """
    # Skip the page-chrome bullet section (top-of-page navigation block) — the
    # type/rarity line always sits AFTER the H2 item title. So scan from the
    # first H2 item heading downwards.
    lines = md.splitlines()
    h2_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("## ") and line.strip() not in {
            "## Комментарии",
            "## Галерея",
            "## DnD.su",
        }:
            h2_idx = i
            break
    if h2_idx < 0:
        return None

    # Search bullets after the heading.
    body = "\n".join(lines[h2_idx:])
    um = UMBRELLA_RE.search(body)
    if um:
        tiers: list[tuple[int, str]] = []
        for tm in TIER_RE.finditer(um.group("tiers") + ","):
            n = int(tm.group("n"))
            rarity = map_rarity(tm.group("rarity"))
            tiers.append((n, rarity or "uncommon"))  # fallback shouldn't fire
        return {
            "kind": "umbrella",
            "type_clause": um.group("type_clause").strip(),
            "tiers": tiers,
            "requires_attunement": um.group("attunement_clause") is not None,
        }

    sm = SINGLE_BULLET_RE.search(body)
    if sm:
        return {
            "kind": "single",
            "type_clause": sm.group("type_clause").strip(),
            "rarity_phrase": sm.group("rarity_phrase").strip(),
            "requires_attunement": sm.group("attunement_clause") is not None,
        }
    return None


def parse_price(md: str) -> Optional[str]:
    m = PRICE_RE.search(md)
    return m.group("price").strip() if m else None


def parse_description(md: str) -> str:
    """Capture body text from after the first non-meta bullet up to '## Комментарии'.

    The heuristic: the description is everything between the type/rarity bullet
    (and optional price bullet) and the next `## ` heading, with bullet markers
    and the price line stripped.
    """
    lines = md.splitlines()
    # Find first item H2 heading.
    start = -1
    for i, line in enumerate(lines):
        if line.startswith("## ") and line.strip() not in {
            "## Комментарии",
            "## Галерея",
            "## DnD.su",
        }:
            start = i
            break
    if start < 0:
        return ""
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("## "):
            end = i
            break

    body_lines = lines[start + 1 : end]

    # Drop type/rarity bullet, price bullet, image bullets, and the [Распечатать]
    # bullet. Keep description bullets (their leading `* ` is stripped).
    out: list[str] = []
    for raw in body_lines:
        line = raw.rstrip()
        s = line.strip()
        if not s:
            out.append("")
            continue
        # Skip metadata bullets.
        if re.match(r"^\*\s*\[", s):  # `* [Распечатать](...)`
            continue
        if re.match(r"^\*\s*!\[", s):  # `* ![](image)`
            continue
        if re.match(r"^\*\s*\*\*Рекомендованная стоимость", s):
            continue
        # First-bullet (type/rarity) — detect by reusing UMBRELLA_RE / SINGLE_BULLET_RE.
        if UMBRELLA_RE.match(s) or SINGLE_BULLET_RE.match(s):
            continue
        # Strip leading bullet marker on description bullets.
        s = re.sub(r"^\*\s+", "", s)
        out.append(s)

    text = "\n".join(out).strip()
    # Collapse 3+ newlines to 2.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def slugify(text: str) -> str:
    """URL-friendly Latin-only slug. Used as a stable srd_slug component
    derived from the dnd.su URL path (preferred) or English title fallback."""
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s


def url_to_slug_and_id(url: str) -> tuple[str, str]:
    """Extract (numeric_id, slug_part) from a canonical dnd.su item URL.

    >>> url_to_slug_and_id("https://dnd.su/items/2489-bloodwell-vial/")
    ('2489', 'bloodwell-vial')
    """
    m = re.search(r"/items/(\d+)-([a-z0-9-]+)/?", url)
    if not m:
        return ("0", slugify(url))
    return (m.group(1), m.group(2))


def parse_item(md: str, url: str) -> list[ItemRecord]:
    """Parse one item-page markdown into 0..N ItemRecord entries.

    Returns:
        []  for non-item pages or 5e24 pages (edition gate) or empty cards.
        [r] for ordinary single-record items.
        [r, r, r] for umbrella items (one per rarity tier).

    Skip reasons are logged at DEBUG (expected: missing heading) or INFO
    (noteworthy: heading present but body emptied — likely migrated to 5e24).
    """
    header = parse_header(md)
    if header is None:
        log.debug("skip %s: no item heading", url)
        return []
    if header["edition"] == "5e24":
        log.debug("skip %s: 5e24 edition", url)
        return []

    bullet = parse_first_bullet(md)
    if bullet is None:
        # Heading exists but type/rarity bullet does not — page exists but
        # body is empty (e.g. content moved to next.dnd.su).
        log.info("skip %s: heading present but no type/rarity bullet (empty card)", url)
        return []

    price_text = parse_price(md)
    description = parse_description(md)

    item_id, url_slug = url_to_slug_and_id(url)
    category = map_category(bullet["type_clause"])
    slot = map_slot(bullet["type_clause"])

    badge = header["source_badge"] or None
    source_book = SOURCE_BOOKS.get(badge) if badge else None
    warnings: list[str] = []
    if badge and not source_book:
        warnings.append(f"unknown_source_badge:{badge}")

    base_kwargs = dict(
        title_en=header["title_en"],
        category=category,
        requires_attunement=bullet["requires_attunement"],
        slot=slot,
        weight_lb=None,  # not exposed in dnd.su markup
        price_range_text=price_text,
        description_ru=description,
        source_book=source_book,
        source_book_short=badge,
        edition=header["edition"],
        dndsu_url=url.rstrip("/") + "/",
    )

    if bullet["kind"] == "single":
        rarity = map_rarity(bullet["rarity_phrase"])
        if rarity is None and bullet["rarity_phrase"]:
            warnings.append(f"unknown_rarity:{bullet['rarity_phrase']!r}")
        return [
            ItemRecord(
                srd_slug=f"dndsu-{item_id}-{url_slug}",
                title_ru=header["title_ru"],
                rarity=rarity,
                _warnings=warnings,
                **base_kwargs,
            )
        ]

    # Umbrella: emit N records.
    # Russian title may read "Оружие, +1, +2, +3" OR "Оружие +1, +2, +3"
    # (with or without leading comma). English usually has no leading comma.
    _strip_re = r"(?:\s*,)?\s*\+\d+(?:\s*,\s*\+\d+)*\s*$"
    base_title = re.sub(_strip_re, "", header["title_ru"]).strip()
    base_title_en = (
        re.sub(_strip_re, "", header["title_en"]).strip()
        if header["title_en"]
        else None
    )

    records: list[ItemRecord] = []
    for plus_n, rarity_slug in bullet["tiers"]:
        records.append(
            ItemRecord(
                srd_slug=f"dndsu-{item_id}-{url_slug}-plus-{plus_n}",
                title_ru=f"{base_title}, +{plus_n}",
                rarity=rarity_slug,
                _warnings=list(warnings),
                **{
                    **base_kwargs,
                    "title_en": (
                        f"{base_title_en}, +{plus_n}" if base_title_en else None
                    ),
                },
            )
        )
    return records


# ---------------------------------------------------------------------------
# Network layer
# ---------------------------------------------------------------------------


class Scraper:
    """Coordinates fetch -> markdown preprocess -> parse for the catalog."""

    def __init__(
        self,
        *,
        cache_dir: Path = DEFAULT_CACHE_DIR,
        output_path: Path = DEFAULT_OUTPUT,
        rate_limit_s: float = RATE_LIMIT_S,
        user_agent: str = USER_AGENT,
        limit: Optional[int] = None,
        from_id: Optional[int] = None,
        refresh: bool = False,
    ) -> None:
        self.cache_dir = cache_dir
        self.output_path = output_path
        self.rate_limit_s = rate_limit_s
        self.user_agent = user_agent
        self.limit = limit
        self.from_id = from_id
        self.refresh = refresh
        self._last_fetch_at: float = 0.0
        cache_dir.mkdir(parents=True, exist_ok=True)

    # -- discover_urls ------------------------------------------------------

    def discover_urls(self) -> list[str]:
        """Plan A: fetch the global index and parse <a href> per item card."""
        from bs4 import BeautifulSoup  # type: ignore

        html = self._fetch_raw(INDEX_URL)
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        for a in soup.select(".list-item__spell a.list-item-wrapper"):
            href = a.get("href")
            if not href:
                continue
            url = href if href.startswith("http") else BASE_URL + href
            urls.append(url.rstrip("/") + "/")

        if self.from_id is not None:
            urls = [u for u in urls if self._url_id(u) >= self.from_id]
        if self.limit is not None:
            urls = urls[: self.limit]
        log.info("discover_urls: %d URLs", len(urls))
        return urls

    @staticmethod
    def _url_id(url: str) -> int:
        m = re.search(r"/items/(\d+)-", url)
        return int(m.group(1)) if m else 0

    # -- fetch_or_cached ----------------------------------------------------

    def fetch_or_cached(self, url: str) -> str:
        """Return markdown text for `url`, populating disk cache on miss."""
        cache_key = hashlib.sha1(url.encode("utf-8")).hexdigest()
        cache_path = self.cache_dir / f"{cache_key}.md"

        if self.refresh and cache_path.exists():
            cache_path.unlink()

        if cache_path.exists():
            log.debug("cache hit: %s", url)
            return cache_path.read_text(encoding="utf-8")

        html = self._fetch_raw(url)
        markdown = self._html_to_markdown(html)
        cache_path.write_text(markdown, encoding="utf-8")
        log.debug("cache miss -> saved: %s", url)
        return markdown

    def _fetch_raw(self, url: str) -> str:
        """Polite GET with retry on 429/5xx and rate limiting."""
        import requests  # type: ignore

        # Rate limit: at least rate_limit_s between requests.
        now = time.monotonic()
        delta = now - self._last_fetch_at
        if delta < self.rate_limit_s:
            time.sleep(self.rate_limit_s - delta)

        headers = {"User-Agent": self.user_agent}
        last_exc: Optional[Exception] = None
        for attempt, backoff in enumerate(RETRY_BACKOFFS):
            try:
                resp = requests.get(url, headers=headers, timeout=30)
                self._last_fetch_at = time.monotonic()
                if resp.status_code == 200:
                    return resp.text
                if resp.status_code in (429, 500, 502, 503, 504):
                    log.warning(
                        "fetch %s -> %d, retrying in %ds (attempt %d/%d)",
                        url,
                        resp.status_code,
                        backoff,
                        attempt + 1,
                        len(RETRY_BACKOFFS),
                    )
                    time.sleep(backoff)
                    continue
                resp.raise_for_status()
            except requests.RequestException as exc:  # type: ignore
                last_exc = exc
                log.warning(
                    "fetch %s raised %s, retrying in %ds", url, exc, backoff
                )
                time.sleep(backoff)
        if last_exc:
            raise last_exc
        raise RuntimeError(f"failed to fetch {url} after {len(RETRY_BACKOFFS)} retries")

    @staticmethod
    def _html_to_markdown(html: str) -> str:
        """Strip page chrome (nav/aside/footer/comments) and convert to markdown.

        The fixtures in scripts/dndsu-cache-fixtures/ are already in this
        format (one ## title-line, type/rarity bullet, optional price bullet,
        description paragraphs, then '## Комментарии' boundary).
        """
        from bs4 import BeautifulSoup  # type: ignore
        import html2text  # type: ignore

        soup = BeautifulSoup(html, "html.parser")
        # Drop chrome.
        for selector in [
            "header",
            "footer",
            "aside",
            "nav",
            "#aside",
            "script",
            "style",
            "noscript",
        ]:
            for el in soup.select(selector):
                el.decompose()
        # The central column has class="center" inside <main>.
        center = soup.select_one("main .center") or soup.select_one("main") or soup
        h = html2text.HTML2Text()
        h.body_width = 0
        h.ignore_images = False
        h.ignore_links = False
        return h.handle(str(center))

    # -- run ----------------------------------------------------------------

    def run(self) -> None:
        urls = self.discover_urls()
        all_records: list[ItemRecord] = []
        skipped = 0
        for i, url in enumerate(urls, start=1):
            try:
                md = self.fetch_or_cached(url)
                records = parse_item(md, url)
                if not records:
                    skipped += 1
                all_records.extend(records)
                if i % 50 == 0:
                    log.info(
                        "%d/%d processed (%d records, %d skipped)",
                        i,
                        len(urls),
                        len(all_records),
                        skipped,
                    )
            except Exception as exc:  # noqa: BLE001
                log.error("failed on %s: %s", url, exc)
        payload = [r.to_dict() for r in all_records]
        self.output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log.info(
            "wrote %d records (from %d URLs, %d skipped) to %s",
            len(payload),
            len(urls),
            skipped,
            self.output_path,
        )
        warned = sum(1 for r in all_records if r._warnings)
        if warned:
            log.warning("%d records carry _warnings", warned)
            unique_badges = sorted(
                {
                    w.split(":", 1)[1]
                    for r in all_records
                    for w in r._warnings
                    if w.startswith("unknown_source_badge:")
                }
            )
            if unique_badges:
                log.warning("unknown source badges: %s", ", ".join(unique_badges))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Scrape dnd.su magic items.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--from-id", type=int, default=None)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    scraper = Scraper(
        cache_dir=args.cache_dir,
        output_path=args.output,
        limit=args.limit,
        from_id=args.from_id,
        refresh=args.refresh,
    )
    scraper.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
