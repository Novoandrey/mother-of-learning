# Монстры и статблоки

> База монстров кампании: SRD-сид из Open5e, дополнительные монстры с dnd.su
> и homebrew. Каждый монстр — нода типа `creature` с полным D&D 5e статблоком.
> Подключается в энкаунтер как participant; несколько экземпляров — независимые
> HP-пулы.

---

## Статблок

Схема полей в `nodes.fields jsonb` введена миграцией `018_statblock_fields.sql`.
Ключевые поля:

| Группа | Поля |
|---|---|
| Идентификация | `name`, `cr`, `type`, `size`, `alignment`, `source_doc` |
| Защита | `ac`, `ac_detail`, `max_hp`, `hp`, `hit_dice`, `proficiency_bonus` |
| Характеристики | `stats {str,dex,con,int,wis,cha}`, `saves`, `skills`, `senses`, `speed` |
| Сопротивления | `resistances`, `immunities`, `vulnerabilities`, `condition_immunities`, `languages` |
| Действия | `actions`, `bonus_actions`, `reactions`, `legendary_actions`, `legendary_budget`, `passives` |

Парсер — `lib/statblock.ts` (`parseStatblock(title, fields)`). Функция
защитно коерсирует JSONB: `null`/`undefined` → пустые значения. Если нода
не содержит боевого контента (нет actions, нет AC, нет HP) — возвращает `null`.

HP при добавлении в энкаунтер вычисляется функцией `computeMonsterHp(fields, method)`:
метод `average` (из `max_hp`/`hp`), `max`, `min` или `roll` по `hit_dice`.

---

## SRD-сид и dnd.su

- **Миграция `014_monster_seed.sql`** — первые монстры через ручной INSERT.
- **Миграция `019_srd_monsters_seed.sql`** — 10 монстров из SRD 2014 (Open5e):
  Goblin, Orc, Giant Spider, Troll, Mage, Medusa, Young Red Dragon, Adult Red
  Dragon, Lich, Vampire. Поле `source_doc = 'SRD 2014 (Open5e)'`, тег `srd`.
- **Миграции `107/108_monsters_mutate*.sql`** — полные статблоки для существующих
  монстров (миграция полей к формату 018).
- **Миграция `111_add_homebrew_monsters_set.sql`** — 6 homebrew-монстров:
  Ламасомбра, Халорин Яндрес, Джедар Пайк, Лестерис Сольдрей, Мицет, Ужас.
  `source_doc = 'Homebrew'`. HP по максимуму (per DM-запрос).

Все ноды монстров привязаны к кампании через `campaign_id`. GIN-индекс на
`nodes.fields` (миграция `018`) ускоряет `@>` containment-запросы по типу,
CR, тегам.

---

## Подключение в энкаунтер

Монстр добавляется из каталога через `addParticipantFromCatalog`
(`lib/encounter-actions.ts`). Поддерживаются:

- **Multi-instance** — несколько экземпляров одной ноды. Имена автоматически
  суффиксируются: «Goblin 1», «Goblin 2». Каждый экземпляр — отдельная строка
  в `encounter_participants` с независимым `current_hp`.
- **Legendary** — монстры с `legendary_budget > 0` получают индикатор
  legendary actions в гриде; бюджет расходуется в компоненте.
- **Реакции** — отображаются в панели статблока рядом с гридом.

---

## Homebrew-монстры

DM создаёт homebrew-монстров через форму создания ноды с типом `creature`
(каталог или вкладка монстров). Форма использует `default_fields` типа как
шаблон с полным набором полей статблока.

---

## Будущее

IDEA-056 (Phase B): структурированная экстракция способностей для encounter
assistant — автоматические подсказки DM при проведении боя. До реализации —
в [`roadmap/postponed.md`](../../roadmap/postponed.md).
