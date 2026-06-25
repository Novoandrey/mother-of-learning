# Live broadcast и spectators

> Кампания разворачивается на глазах у зрителей: лог рассказывает
> историю каждой петли, события транслируются в реальном времени.
> Что уже работает в проде, что ещё предстоит построить.

---

## Realtime: текущее состояние

Supabase Realtime контейнер (`supabase/realtime:v2.76.5`) поднят и
работает в проде с 2026-06-23 (DEBT-011 закрыт). Миграция
`117_realtime_transactions_broadcast.sql` добавила broadcast-триггер
на вставку в `transactions` + RLS-политику на `realtime.messages`.
Клиент подписан в spec-044 Mobile Ledger: новая транзакция
распространяется на открытые кошельки и общак без перезагрузки.

WAL-слот стережёт `infra/wal-slot-monitor.sh` (cron каждые 10 минут,
Telegram-алерт при lag > 500 МБ).

Следующий потребитель realtime — spec-045 RPG Engine Core (live
обновление статов персонажа) и в будущем encounter-трекер (IDEA-009,
дочинг к spec-032).

---

## Spectator-аккаунт

В текущем проде роли три: `owner` / `dm` / `player`. Роль `spectator`
в схеме отсутствует. Целевая модель (из [`north-star.md`](../concepts/north-star.md) §3
и [`concepts/visibility.md`](../concepts/visibility.md)):

**Spectator** — это `participant` без `controlled_characters`. Видит
всё, что `visibility.mode='all'`, то есть ровно то же, что обычный
игрок. `dm_only`-события ему недоступны — автоматически, силой RLS.

Опциональный флаг `participants.see_all: bool` даёт расширенный доступ
(для содведущих, ассистентов-летописцев): такой spectator видит и
`dm_only`, и `characters`-события чужих персонажей. Это не отдельная
роль — просто поле на записи участника.

До того, как появится `spectator` как роль с явным UX: зрители
добавляются как `player` без привязанного PC. Работает, но нет
специализированного UI и нет `see_all`.

---

## Public-link broadcast

Цель — ссылка-токен без аккаунта: любой по ссылке видит live-feed
кампании как spectator. Механика: `campaigns` или отдельная таблица
`public_links` с `token: uuid`, поле `is_public` или `public_visibility`.
RLS-политика по токену из query param. Сейчас не реализовано; зависит
от того, когда появится UI зрителя.

---

## UI лога (целевой)

Сейчас «лог» — бухгалтерский ledger `/accounting` и лента летописи
(`chronicles`). Целевой интерактивный лог кампании — отдельная
поверхность с:

- **Фильтрами** по локации, PC, петле/дню, типу события.
- **Режимом авто-обновления** — новые события «вплывают» сверху,
  scroll-anchor держит позицию если пользователь скроллит историю.
- **Богатым рендерингом** строки события — иконка типа, имя актора,
  ссылка на ноду, результат (число/предмет/эффект).

Вдохновение — Disco Elysium: лог действий как нарратив, не как таблица.
Это долгосрочная цель; транспорт (Supabase Realtime) уже есть.

---

## Зависимости и порядок

1. Realtime-транспорт — **готов** (миграция 117, DEBT-011 закрыт).
2. Spectator-роль с UX — требует [`visibility-and-sandbox.md`](visibility-and-sandbox.md)
   (spec-033), которая добавит visibility-слой на ноды. После неё
   добавить `see_all` и отдельный spectator-режим — небольшой шаг.
3. Public-link — независим от visibility-слоя, можно делать отдельно.
4. Полноценный UI лога — после generic events table
   ([`generic-events-table.md`](generic-events-table.md));
   пока `transactions` не стали универсальным `events`, богатый лог
   будет неполным.

---

> См. также: [`concepts/visibility.md`](../concepts/visibility.md),
> [`west-marches.md`](west-marches.md) (параллельные сессии и rebroadcast),
> [`player-mobile.md`](player-mobile.md) (realtime в Mini App уже в проде).
