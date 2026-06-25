# Видимость событий

> Кто что видит в кампании. Объясняет три режима видимости событий,
> почему по умолчанию всё открыто, и как архитектура рассчитана на
> туман войны без повторных миграций.

Все события приложения имеют поле `visibility` — JSONB трёх форм. На Day 1
всё создаётся с режимом `all` — открытая видимость по умолчанию. Архитектура
финальная сразу: когда добавится UI скрытых действий, миграций схемы не
нужно.

---

## Три режима видимости

| Форма `visibility` | Кто видит |
|---|---|
| `{"mode": "all"}` | Все участники кампании + spectator'ы |
| `{"mode": "dm_only"}` | Только DM и spectator с `see_all=true` |
| `{"mode": "characters", "character_ids": [...]}` | Только перечисленные персонажи + DM |

Режим `characters` — это «только эти PC знают». Используется для личных
квестов, секретных знаний, информации, которая не должна утечь в общий чат.

## Что есть в проде сейчас

**Поле `visibility` на `events` не существует** — универсального лога
событий ещё нет. Все данные открыты всем участникам кампании. RLS проверяет
только членство в кампании (`is_member(campaign_id)`), а не content-level
visibility.

Это сознательный выбор для MVP: игроки кооперируются, делятся информацией,
DM пишет подробные рекапы. Туман войны и скрытые действия — roadmap.

→ [`roadmap/visibility-and-sandbox.md`](../roadmap/visibility-and-sandbox.md)

## Целевая RLS-политика

В целевой архитектуре политика `events_select` проверяет `visibility` JSONB:

```sql
-- псевдокод
CASE
  WHEN visibility->>'mode' = 'all' THEN is_member(campaign_id)
  WHEN visibility->>'mode' = 'dm_only' THEN is_dm_or_owner(campaign_id) OR see_all(...)
  WHEN visibility->>'mode' = 'characters' THEN is_dm_or_owner(campaign_id)
    OR my_character_id IN (visibility->'character_ids')
END
```

Это один вызов RLS без приложенческого кода. Вся логика видимости —
в базе данных.

## Spectator с see_all

`spectator` — роль, которой ещё нет в проде (только `owner`/`dm`/`player`).
Spectator — это participant без управляемых персонажей: наблюдатель, зритель,
ассистент DM.

Опциональный флаг `participants.see_all: bool` даёт расширенный доступ —
spectator с `see_all=true` видит и `dm_only`-события. Нужен для соведущих
и трансляций.

→ [`roles-and-clients.md`](roles-and-clients.md)

## Партии — UI-агрегация, не security-граница

«Пачка» (party) — это состав сессии, группа PC которые ходили вместе.
Хранится как рёбра `participated_in` (session → character). Партия **не**
security-граница: «только партия X видит событие» выражается через
`mode='characters'` с явным перечислением ID — не через membership в пачке.
Это важно, потому что партии ad-hoc и меняются каждую сессию.

## Live broadcast как побочный эффект

Когда все события имеют `mode='all'`, трансляция кампании зрителям —
тривиальный случай: spectator без `see_all` видит ровно то же самое, что
и рядовой игрок. Никакой отдельной логики «публичной видимости».
→ [`roadmap/live-broadcast.md`](../roadmap/live-broadcast.md)

---

> Поле `visibility` — архитектурное решение «один раз и навсегда».
> UI туман-войны придёт позже, схема под него уже готова.
