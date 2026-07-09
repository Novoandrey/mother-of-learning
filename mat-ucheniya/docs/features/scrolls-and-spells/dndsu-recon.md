# Разведка dnd.su/spells — для spec-059 этап 1 (база заклинаний)

> Проведена Claude (2026-07-10) вручную через WebFetch/WebSearch. Закрывает
> Open #2 спеки (механика редакций) — **подтверждено**. Скрапер строится по
> этим фактам.

## Редакции 2014 / 2024

- **2014 (5e14 / PH14)** = основной домен `dnd.su`.
  Пример: `https://dnd.su/spells/205-fireball/`.
- **2024 (5e24)** = поддомен **`next.dnd.su`**.
  Пример: `https://next.dnd.su/spells/10514-fireball/`.
- Это РАЗНЫЕ страницы, разные numeric id, **одинаковый slug** (`fireball`).
  → пары двух редакций матчить **ПО SLUG** (хвост URL), не по id.
- «Не у всех есть 2024» = у заклинания нет страницы на `next.dnd.su`
  (существует только на dnd.su).
- Фильтр на странице списка: «5e24 / 5e14» (5e24 ведёт на next.dnd.su).

## Официальные vs homebrew

- Вкладки: `/spells/` (официальные) vs `/homebrew/spells/` (homebrew).
- Отсекать homebrew = игнорировать путь `/homebrew/`.

## Список / enumeration

- Страница `/spells/` — динамическая подгрузка («Загрузить больше»).
- Endpoint `/piece/spells/index-list/` (по аналогии с предметами
  `/piece/items/index-list/`) через WebFetch отдал пусто — но питон-скрапер
  предметов берёт индекс с User-Agent (`scripts/scrape_dndsu.py`, `INDEX_URL`,
  `discover_urls`). Скрапер спеллов делает так же для ОБОИХ доменов
  (dnd.su и next.dnd.su).

## Поля статблока заклинания (fireball, подтверждено)

Уровень (0–9), Школа магии, Время накладывания, Дистанция, Компоненты
(В/С/М + текст материального), Длительность, Концентрация (да/нет), Ритуал
(да/нет), Доступные классы, Подклассы (опц.), Источник (книга + тег редакции,
напр. «PH14»). Основной текст: абзац описания + раздел «На больших уровнях»
(повышение).

## Вывод для модели spell-ноды (этап 1)

- `nodes.content` (markdown) — тело статьи для /tg-вики-рендера; ДВЕ редакции:
  `content` (2014, всегда) + `content_2024` в `nodes.fields` (nullable) ИЛИ
  отдельные поля; переключатель редакции на экране ноды при наличии 2024.
- `nodes.fields`: level, school, casting_time, range, components, duration,
  concentration, ritual, classes, source, slug (для матча пар).
- Скрапер: форк `scrape_dndsu.py` → `scrape_dndsu_spells.py` (тот же
  кэш/fetch/html→md), discover по `/spells/` на dnd.su И next.dnd.su,
  парс-слой под спелл-поля. Codegen сид-миграций — по образцу
  `scripts/items-dndsu-codegen.ts` (прецедент предметов, spec-018).

## Прецедент — как предметы (spec-018) сидят новые кампании

Проверить в `scripts/items-dndsu-codegen.ts` + существующей разведке
`scripts/dndsu-recon.md`: предметы генерят per-campaign сид-миграции
(`NNN_dndsu_<источник>_items.sql`). Спеллы — тем же путём (свой набор
`NNN_dndsu_<источник>_spells.sql` или единый сид). Для НОВЫХ кампаний
воспроизвести тот же механизм заполнения.
