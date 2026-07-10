"""
Scrape dnd.su spells into a JSON intermediate (spec-059, этап 1).

Форк scripts/scrape_dndsu.py (предметы, spec-018). Слой fetch / cache /
_html_to_markdown / _fetch_raw оставлен вербатим (кэш по sha1(url) —
two-domain-safe). discover_urls переписан под ДВЕ редакции и под реальный
формат индекса dnd.su (JSON-блоб `window.LIST`, а не <a href>).

Две редакции по двум доменам:
    * 2014 (5e14 / PH14) — основной домен dnd.su.
    * 2024 (5e24 / PH24) — поддомен next.dnd.su.
Пары матчатся ПО SLUG (хвост URL), у части заклинаний 2024 нет.

Usage:
    python scrape_dndsu_spells.py                    # полный прогон обеих редакций
    python scrape_dndsu_spells.py --limit 40         # smoke-тест (по 40 URL с домена)
    python scrape_dndsu_spells.py --max-level 5       # только заговоры..5-й круг
    python scrape_dndsu_spells.py --refresh           # сбросить дисковый кэш
    python scrape_dndsu_spells.py --output spells.json

Architecture:
    1. discover_urls(index_url, base) читает `window.LIST` JSON и достаёт
       поле `link` каждой карточки; отбрасывает /homebrew/.
    2. fetch_or_cached(url) -> markdown (кэш на диск, ключ sha1(url) —
       два домена не конфликтуют). Тесты кормят готовые markdown-fixtures
       из scripts/dndsu-spells-cache-fixtures/ напрямую, минуя сеть.
    3. parse_spell(md, url) -> Optional[SpellRecord] — разбор статблока
       одной страницы (любой редакции). Возвращает None для не-спелл
       страниц.
    4. run() делает два прохода (2014 + 2024) и сливает по slug:
       content <- 2014 body, content_2024 <- 2024 body (nullable).
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

# Third-party imports (requests / bs4 / html2text) импортируются ЛЕНИВО
# внутри методов Scraper, чтобы pure-парсеры (parse_spell и friends)
# тестировались только на stdlib.

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Два индекса, два BASE. ВНИМАНИЕ (разведка 2026-07-10): у next.dnd.su НЕТ
# пути /piece/spells/index-list/ (отдаёт 404) — рабочий индекс там это
# просто /spells/. У обоих доменов список заклинаний лежит JSON-блобом в
# `window.LIST`, а НЕ в <a href> (как предполагал вербатимный discover_urls
# предметов). Поэтому discover_urls парсит JSON.
DNDSU2014_INDEX = "https://dnd.su/piece/spells/index-list/"
DNDSU2014_BASE = "https://dnd.su"
DNDSU2024_INDEX = "https://next.dnd.su/spells/"
DNDSU2024_BASE = "https://next.dnd.su"

USER_AGENT = (
    "MoL spec-059 research bot "
    "(https://github.com/Novoandrey/mother-of-learning)"
)
RATE_LIMIT_S = 1.0
RETRY_BACKOFFS = (1, 2, 4, 8)  # seconds

SCRIPT_DIR = Path(__file__).parent
DEFAULT_CACHE_DIR = SCRIPT_DIR / "dndsu-spells-cache"
DEFAULT_OUTPUT = SCRIPT_DIR / "dndsu_spells.json"

log = logging.getLogger("scrape_dndsu_spells")

# ---------------------------------------------------------------------------
# Vocabulary maps (dnd.su source badges -> human book names)
# ---------------------------------------------------------------------------

# Бейдж источника в H2 заклинания короче, чем у предметов: PHB->PH.
# Codes ending in 14/24 = edition; для спеллов обе редакции оставляем, так
# что цифры отсекаем и обе редакции матчим по slug (см. parse_spell).
# Словарь расширяется по warning'ам "unknown source badge" после прогонов.
SPELL_SOURCE_BOOKS: dict[str, str] = {
    "PH": "Player's Handbook",
    "PHB": "Player's Handbook",
    "XGE": "Xanathar's Guide to Everything",
    "TCE": "Tasha's Cauldron of Everything",
    "SCAG": "Sword Coast Adventurer's Guide",
    "GGR": "Guildmasters' Guide to Ravnica",
    "AI": "Acquisition Incorporated",
    "EGW": "Explorer's Guide to Wildemount",
    "MOT": "Mythic Odysseys of Theros",
    "IDRF": "Icewind Dale: Rime of the Frostmaiden",
    "TCS": "Tasha's Cauldron of Everything",
    "FTD": "Fizban's Treasury of Dragons",
    "SCC": "Strixhaven: A Curriculum of Chaos",
    "AAG": "Astral Adventurer's Guide",
    "BPGG": "Bigby Presents: Glory of the Giants",
    "BMT": "The Book of Many Things",
    "PAM": "Planescape: Adventures in the Multiverse",
    "SDQ": "Dragonlance: Shadow of the Dragon Queen",
    "GHB": "Grim Hollow",
    "VRGR": "Van Richten's Guide to Ravenloft",
    "LR": "Lost Laboratory of Kwalish",
    "DoDk": "Dungeons of Drakkenheim",
}


# ---------------------------------------------------------------------------
# Data shape
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class SpellRecord:
    """Одно заклинание (пара редакций слита по slug).

    Поля level..classes/source берутся из базовой (2014) редакции; для
    2024-only заклинаний — из 2024. `content` — markdown-тело базовой
    редакции (для /tg-вики), `content_2024` — тело редакции 2024 (nullable,
    переключатель редакции на ноде показывается только при наличии).
    """

    slug: str
    title_ru: str
    title_en: Optional[str]
    level: int  # 0..9 (Заговор -> 0)
    school: Optional[str]
    casting_time: Optional[str]
    range: Optional[str]
    components: Optional[str]
    duration: Optional[str]
    concentration: bool
    ritual: bool
    classes: list[str]
    source: Optional[str]  # human book name
    source_short: Optional[str]  # dnd.su badge (PH, XGE, …)
    content: str  # markdown body (2014 base, or 2024 for 2024-only)
    content_2024: Optional[str]  # markdown body 2024 (nullable)
    dndsu_url: str
    dndsu_url_2024: Optional[str]
    _warnings: list[str] = dataclasses.field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# Pure parser helpers (no I/O, importable for tests)
# ---------------------------------------------------------------------------

# Заголовки, которые НЕ являются карточкой заклинания.
_NON_SPELL_H2 = {"Комментарии", "Галерея", "DnD.su"}

# Markdown-ссылка [text](url) — в редакции 2024 метки и значения статблока
# завёрнуты в ссылки на dnd.su-глоссарий; они мертвы в нашем приложении, так
# что раздеваем до текста и для парсинга полей, и для тела content.
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\((?:[^)]*)\)")


def strip_md_links(text: str) -> str:
    """`[Действие](/glossary/magic)` -> `Действие`. Прогоняем дважды на
    случай неглубоко вложенных ссылок в описании."""
    prev = None
    out = text
    for _ in range(3):
        out = _MD_LINK_RE.sub(r"\1", out)
        if out == prev:
            break
        prev = out
    return out


def _card_level(card: dict) -> Optional[int]:
    """Уровень заклинания из карточки `window.LIST` (для фильтра discovery).
    `level`: "Заговор" -> 0, "0".."9" -> int. None, если не распознан."""
    raw = str(card.get("level", "")).strip().lower()
    if not raw:
        return None
    if raw.startswith("заговор"):
        return 0
    m = re.match(r"\d+", raw)
    return int(m.group()) if m else None


def slugify(text: str) -> str:
    """URL-friendly Latin-only slug (fallback, если URL нестандартный)."""
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def url_to_slug_and_id(url: str) -> tuple[str, str]:
    """(numeric_id, slug) из канонического URL заклинания.

    >>> url_to_slug_and_id("https://dnd.su/spells/205-fireball/")
    ('205', 'fireball')
    >>> url_to_slug_and_id("https://next.dnd.su/spells/10514-fireball/")
    ('10514', 'fireball')

    SLUG (хвост) — ключ пары редакций (numeric id у 2014/2024 разный).
    """
    m = re.search(r"/spells/(\d+)-([a-z0-9-]+)/?", url)
    if not m:
        return ("0", slugify(url))
    return (m.group(1), m.group(2))


def _find_h2_index(lines: list[str]) -> int:
    """Индекс первой H2-строки заклинания (не Комментарии/Галерея)."""
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("## "):
            heading = s[3:].strip()
            if heading not in _NON_SPELL_H2:
                return i
    return -1


def parse_h2(line: str) -> Optional[dict]:
    """Разбор H2 заклинания.

    2014: `## Огненный шар [Fireball]PH14 [PH24](url "…")`
    2024: `##  Брызги кислоты [Acid Splash] [ ](url "…")` (без бейджа)

    Возвращает title_ru / title_en / source_badge / edition_digits.
    """
    body = line.strip()
    if not body.startswith("##"):
        return None
    body = body.lstrip("#").strip()
    if not body or body in _NON_SPELL_H2:
        return None
    # Раздеваем ссылки, чтобы бейдж [PH24](url) не мешал (превратится в
    # текст "PH24"); [Fireball] без скобок-ссылки не трогается.
    body = strip_md_links(body).strip()

    m = re.match(r"^(?P<ru>[^\[]+?)\s*\[(?P<en>[^\]]*)\](?P<tail>.*)$", body)
    if not m:
        # Заголовок без английского названия (редко). Всё — title_ru.
        return {
            "title_ru": body,
            "title_en": None,
            "source_badge": None,
            "edition_digits": "",
        }
    title_ru = m.group("ru").strip()
    title_en = m.group("en").strip() or None
    tail = m.group("tail").strip()

    badge_m = re.match(r"^(?P<badge>[A-Za-z]+)(?P<digits>\d{2})?", tail)
    source_badge = badge_m.group("badge") if badge_m else None
    edition_digits = (badge_m.group("digits") or "") if badge_m else ""
    return {
        "title_ru": title_ru,
        "title_en": title_en,
        "source_badge": source_badge,
        "edition_digits": edition_digits,
    }


# Строка уровня/школы (после раздевания ссылок):
#   "3 уровень, воплощение"
#   "2 уровень, некромантия (ритуал)"
#   "Заговор, вызов"
_LEVEL_LINE_RE = re.compile(
    r"^\*?\s*"
    r"(?P<level>Заговор|\d+\s+уровень)"
    r"\s*,\s*"
    r"(?P<school>[^(]+?)"
    r"(?P<ritual>\s*\(\s*ритуал\s*\))?"
    r"\s*$",
    re.IGNORECASE,
)


def _labeled(md: str, label_re: str) -> Optional[str]:
    """Значение bullet-строки вида `  * **<label>:** <value>` (учитывает
    ведущие пробелы и маркер `*` от html2text)."""
    m = re.search(
        r"^\s*\*?\s*\*\*\s*" + label_re + r"\s*:\s*\*\*\s*(?P<val>.+?)\s*$",
        md,
        re.MULTILINE | re.IGNORECASE,
    )
    return m.group("val").strip() if m else None


def parse_statblock(md: str) -> Optional[dict]:
    """Разбор bullet-статблока заклинания. Возвращает поля level..classes
    или None, если строка уровня не найдена (страница — не заклинание).

    Работает на РАЗДЕТОЙ от ссылок копии md (2024 заворачивает значения
    в ссылки на глоссарий).
    """
    plain = strip_md_links(md)
    lines = plain.splitlines()
    h2 = _find_h2_index(lines)
    scope = "\n".join(lines[h2:]) if h2 >= 0 else plain

    # Строка уровня/школы — первый bullet, подходящий под _LEVEL_LINE_RE.
    level: Optional[int] = None
    school: Optional[str] = None
    ritual = False
    for raw in scope.splitlines():
        lm = _LEVEL_LINE_RE.match(raw.strip())
        if lm:
            lvl_raw = lm.group("level").strip().lower()
            level = 0 if lvl_raw.startswith("заговор") else int(re.match(r"\d+", lvl_raw).group())
            school = lm.group("school").strip()
            ritual = lm.group("ritual") is not None
            break
    if level is None:
        return None

    # casting time: 2014 "Время накладывания", 2024 "Время сотворения".
    casting_time = _labeled(scope, r"Время\s+(?:накладывания|сотворения)")
    range_ = _labeled(scope, r"Дистанция")
    components = _labeled(scope, r"Компоненты")
    duration = _labeled(scope, r"Длительность")
    classes_raw = _labeled(scope, r"Классы")

    concentration = bool(duration and "концентрац" in duration.lower())

    classes: list[str] = []
    if classes_raw:
        classes = [c.strip() for c in classes_raw.split(",") if c.strip()]

    return {
        "level": level,
        "school": school,
        "ritual": ritual,
        "casting_time": casting_time,
        "range": range_,
        "components": components,
        "duration": duration,
        "concentration": concentration,
        "classes": classes,
    }


def parse_body(md: str) -> str:
    """Тело статьи (markdown) от H2-заголовка заклинания до '## Комментарии'
    / '## Галерея'. Раздевает ссылки, срезает навигационный хром
    ([Официальные]/[Homebrew]/[Распечатать]/Поиск), схлопывает пустые
    строки. Годно как content для /tg-вики-рендера.
    """
    lines = md.splitlines()
    h2 = _find_h2_index(lines)
    if h2 < 0:
        return ""
    end = len(lines)
    for i in range(h2 + 1, len(lines)):
        s = lines[i].strip()
        if s.startswith("## ") and s[3:].strip() in _NON_SPELL_H2:
            end = i
            break
    out: list[str] = []
    for raw in lines[h2:end]:
        s = strip_md_links(raw).rstrip()
        st = s.strip()
        if not st:
            out.append("")
            continue
        # Срезаем "* [Распечатать](javascript:…)" (после раздевания ссылки
        # остаётся "* Распечатать;)" — матчим по префиксу).
        if re.match(r"^\*\s*Распечатать", st):
            continue
        if st in {"Поиск", "Официальные", "Homebrew"}:
            continue
        if re.match(r"^\*\s*(Официальные|Homebrew)\s*$", st):
            continue
        out.append(s)
    text = "\n".join(out).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def parse_spell(md: str, url: str) -> Optional[SpellRecord]:
    """Разбор одной страницы заклинания (любой редакции) в SpellRecord.

    Возвращает None для не-спелл страниц (нет H2-карточки / нет строки
    уровня). `content` заполняется телом ЭТОЙ страницы; content_2024 = None
    (слияние редакций — в Scraper.run / merge_records).

    NB: edition-гейта как у предметов НЕТ — обе редакции живут на своих
    доменах и обе оставляются; редакция определяется по домену url при
    слиянии.
    """
    lines = md.splitlines()
    h2 = _find_h2_index(lines)
    if h2 < 0:
        log.debug("skip %s: нет H2-карточки заклинания", url)
        return None
    header = parse_h2(lines[h2])
    if header is None:
        log.debug("skip %s: H2 не распарсился", url)
        return None

    stat = parse_statblock(md)
    if stat is None:
        log.info("skip %s: H2 есть, но нет строки уровня (пустая карточка)", url)
        return None

    _id, slug = url_to_slug_and_id(url)
    badge = header["source_badge"] or None
    source = SPELL_SOURCE_BOOKS.get(badge) if badge else None
    warnings: list[str] = []
    if badge and not source:
        warnings.append(f"unknown_source_badge:{badge}")

    body = parse_body(md)

    return SpellRecord(
        slug=slug,
        title_ru=header["title_ru"],
        title_en=header["title_en"],
        level=stat["level"],
        school=stat["school"],
        casting_time=stat["casting_time"],
        range=stat["range"],
        components=stat["components"],
        duration=stat["duration"],
        concentration=stat["concentration"],
        ritual=stat["ritual"],
        classes=stat["classes"],
        source=source,
        source_short=badge,
        content=body,
        content_2024=None,
        dndsu_url=url.rstrip("/") + "/",
        dndsu_url_2024=None,
        _warnings=warnings,
    )


def merge_records(
    recs_2014: dict[str, SpellRecord],
    recs_2024: dict[str, SpellRecord],
) -> list[SpellRecord]:
    """Слияние по slug. База — 2014 (content). У 2024-версии тело кладётся
    в content_2024. 2024-only заклинания (нет 2014) становятся базой сами:
    content = их тело, content_2024 = None, warning 'only_2024'.
    """
    merged: dict[str, SpellRecord] = {}
    for slug, r in recs_2014.items():
        merged[slug] = r
    for slug, r24 in recs_2024.items():
        base = merged.get(slug)
        if base is not None:
            base.content_2024 = r24.content
            base.dndsu_url_2024 = r24.dndsu_url
        else:
            r24._warnings.append("only_2024")
            merged[slug] = r24
    return sorted(merged.values(), key=lambda r: (r.level, r.slug))


# ---------------------------------------------------------------------------
# Network layer
# ---------------------------------------------------------------------------


class Scraper:
    """fetch -> markdown -> parse для базы заклинаний (две редакции)."""

    def __init__(
        self,
        *,
        cache_dir: Path = DEFAULT_CACHE_DIR,
        output_path: Path = DEFAULT_OUTPUT,
        rate_limit_s: float = RATE_LIMIT_S,
        user_agent: str = USER_AGENT,
        limit: Optional[int] = None,
        max_level: Optional[int] = None,
        refresh: bool = False,
    ) -> None:
        self.cache_dir = cache_dir
        self.output_path = output_path
        self.rate_limit_s = rate_limit_s
        self.user_agent = user_agent
        self.limit = limit
        self.max_level = max_level
        self.refresh = refresh
        self._last_fetch_at: float = 0.0
        cache_dir.mkdir(parents=True, exist_ok=True)

    # -- discover_urls ------------------------------------------------------

    def discover_urls(self, index_url: str, base_url: str) -> list[str]:
        """Читает индекс (`window.LIST` JSON) и достаёт `link` каждой
        карточки. Отбрасывает /homebrew/. Абсолютизирует по base_url.

        (Вербатимный CSS-select предметов здесь не работает: у dnd.su/spells
        список рендерится JS из JSON-блоба, <a href> в HTML нет.)
        """
        html = self._fetch_raw(index_url)
        cards = self._extract_window_list(html)
        urls: list[str] = []
        for c in cards:
            href = c.get("link")
            if not href or not isinstance(href, str):
                continue
            if "/homebrew/" in href:
                continue
            # Фильтр уровня на этапе discovery (карточка индекса несёт
            # `level`: "Заговор" или "0".."9"). Ограничивает число FETCH-ей,
            # а не только пост-фильтрует — так level-capped прогон дешёвый.
            if self.max_level is not None and _card_level(c) is not None:
                if _card_level(c) > self.max_level:
                    continue
            url = href if href.startswith("http") else base_url + href
            urls.append(url.rstrip("/") + "/")
        # Дедуп с сохранением порядка.
        seen: set[str] = set()
        uniq = [u for u in urls if not (u in seen or seen.add(u))]
        if self.limit is not None:
            uniq = uniq[: self.limit]
        log.info("discover_urls(%s): %d URL", index_url, len(uniq))
        return uniq

    @staticmethod
    def _extract_window_list(html: str) -> list[dict]:
        """Достаёт массив cards из `window.LIST = {...}` через
        balanced-brace скан (JSON слишком большой для наивного regex)."""
        i = html.find("window.LIST")
        if i < 0:
            return []
        eq = html.find("=", i)
        start = html.find("{", eq)
        if start < 0:
            return []
        depth = 0
        end = -1
        for j in range(start, len(html)):
            ch = html[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        if end < 0:
            return []
        try:
            data = json.loads(html[start:end])
        except json.JSONDecodeError as exc:
            log.warning("window.LIST parse failed: %s", exc)
            return []
        cards = data.get("cards", [])
        return cards if isinstance(cards, list) else []

    # -- fetch_or_cached ----------------------------------------------------

    def fetch_or_cached(self, url: str) -> str:
        """markdown для `url`, дисковый кэш на промахе. Ключ sha1(url) —
        два домена не пересекаются (разные url -> разные ключи)."""
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
        """Polite GET с retry на 429/5xx и rate-limit. (Вербатим из
        scrape_dndsu.py.)"""
        import requests  # type: ignore

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
        """Срезает хром (nav/aside/footer/comments) и конвертит в markdown.
        (Вербатим из scrape_dndsu.py — форма fixtures совпадает.)"""
        from bs4 import BeautifulSoup  # type: ignore
        import html2text  # type: ignore

        soup = BeautifulSoup(html, "html.parser")
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
        center = soup.select_one("main .center") or soup.select_one("main") or soup
        h = html2text.HTML2Text()
        h.body_width = 0
        h.ignore_images = False
        h.ignore_links = False
        return h.handle(str(center))

    # -- run ----------------------------------------------------------------

    def _scrape_edition(self, index_url: str, base_url: str) -> dict[str, SpellRecord]:
        urls = self.discover_urls(index_url, base_url)
        out: dict[str, SpellRecord] = {}
        skipped = 0
        for i, url in enumerate(urls, start=1):
            try:
                md = self.fetch_or_cached(url)
                rec = parse_spell(md, url)
                if rec is None:
                    skipped += 1
                    continue
                if self.max_level is not None and rec.level > self.max_level:
                    continue
                out[rec.slug] = rec
                if i % 50 == 0:
                    log.info(
                        "%s: %d/%d (%d записей, %d пропущено)",
                        base_url,
                        i,
                        len(urls),
                        len(out),
                        skipped,
                    )
            except Exception as exc:  # noqa: BLE001
                log.error("failed on %s: %s", url, exc)
        log.info("%s: %d заклинаний (%d пропущено)", base_url, len(out), skipped)
        return out

    def run(self) -> None:
        recs_2014 = self._scrape_edition(DNDSU2014_INDEX, DNDSU2014_BASE)
        recs_2024 = self._scrape_edition(DNDSU2024_INDEX, DNDSU2024_BASE)
        merged = merge_records(recs_2014, recs_2024)
        payload = [r.to_dict() for r in merged]
        self.output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        with_2024 = sum(1 for r in merged if r.content_2024)
        log.info(
            "wrote %d spells (2014=%d, 2024-linked=%d) to %s",
            len(payload),
            len(recs_2014),
            with_2024,
            self.output_path,
        )
        warned = sum(1 for r in merged if r._warnings)
        if warned:
            log.warning("%d записей с _warnings", warned)
            badges = sorted(
                {
                    w.split(":", 1)[1]
                    for r in merged
                    for w in r._warnings
                    if w.startswith("unknown_source_badge:")
                }
            )
            if badges:
                log.warning("unknown source badges: %s", ", ".join(badges))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Scrape dnd.su spells (2 editions).")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--limit", type=int, default=None, help="max URLs per domain")
    parser.add_argument("--max-level", type=int, default=None, help="drop spells above this level")
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
        max_level=args.max_level,
        refresh=args.refresh,
    )
    scraper.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
