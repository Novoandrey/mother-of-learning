# NEXT — boot-файл проекта

> Только актуальное состояние. История: `CHANGELOG.md`, `chatlog/`
> (включая `chatlog/_legacy-NEXT-archive.md` — полные тексты прежних NEXT).
> Протокол старта сессии: `bash scripts/dev/status.sh` → этот файл →
> `tasks.md` активной спеки. Лимит файла: 150 строк / 10 KB (следит status.sh).
> Last updated: 2026-06-12 (chat 95 — конституция v1.5.0; перенумерация эпика по порядку исполнения: ledger=044, движок=045; chat 94 — spec-043 Done)

## Прод

- **v1.0.0** — https://theloopers.org (Hetzner CPX32 Helsinki, Dokploy,
  self-hosted Supabase; API `db.theloopers.org`, Studio только SSH-туннель,
  5432 закрыт наружу).
- Деплой: **PR в `main`** (ruleset, гейт бежит и на PR) → merge → CI gate →
  Dokploy строит образ на боксе. Telegram-бот MrBranches шлёт ветки/PR.
- Staging: ветка `staging` → https://staging.theloopers.org, облачная
  Supabase-копия прода (refresh/reset/секреты — `infra/staging-runbook.md`).
- Бэкапы: R2, ночной cron 03:00 UTC, ротация 30 daily / 28 weekly;
  restore drill пройден на реальных данных — stop→healthy ~20 с (2026-06-07).
- Доступ к боксу: Andrey + Лёша + Никита (full-ops; `infra/server-access.md`).

## Дедлайны

- (нет активных дедлайнов)

## Активная работа

1. **Эпик «RPG-движок» (chat 93, 95)** — канон эпика:
   `.specify/epics/rpg-engine/constitution.md` (принципы E1–E11, решения
   R1–R8; создана по ревью Андрея). Карта: движок → лист → базы → форк →
   пирамида → классы → конструктор (копия в «Роадмап»); mobile first:
   критический путь spec-045 P1 → spec-022. **spec-045 Specify draft v2 —
   на ревью** (Clarify: C-01…C-05; C-06 закрыт R6). Ревизия chat 95: UX
   внутри движка (E1) — карточка модуля «что делает X» (FR-022), добавление
   с телефона (FR-023), реалтайм у всех (FR-024, E7; Realtime-сервис вернуть на бокс — вырезан в 024/T009);
   **прозрачность R6**: все читают все листы и модули, правка по правам.
   Внешний ресерч (Foundry AE, PF2e RE, MTG 613, DiceCloud, dnd5e
   Advancement, Nystrom, Supabase RT) → `epics/rpg-engine/research/
   best-practices-review.md`: P-01…P-15, предложения D-1…D-13 **ждут решений
   Андрея** (главные: same-op конфликт, add↔mult, roll-эффекты, дельты vs
   LWW, неопознанные предметы). Coverage-checklist заведён: Миряна — можно
   сейчас, Каэл — ждёт LSS-экспорт, Британия — источник не зафиксирован.
   spec-022 ждёт 045; design.md — UX-вход, ~80% переживает. Решения
   chat 95 поздно вечером: **R9** (неопознанные предметы — флаг
   `identified`, маскировка имени) и **R10 + spec-044 Mobile Ledger**
   (Specify draft — на ревью): параллельный трек поверх готовой
   бухгалтерии 009–019, кандидат на ПЕРВЫЙ PWA-шип, несёт PWA-шелл и
   реалтайм (DEBT-011). Решения D-1А…D-6А применены (R11), мана-система — R12/FR-025; мана-таблица = DMG Spell Points (подтверждено).

## Очередь до 030

- **spec-020 PC Holdings Overview** — Plan ready, awaiting Tasks.
- **spec-021 Wiki editor** — дизайн-пак получен, папка спеки не создана.

## Роадмап 030+ (номера зафиксированы chat 87)

| № | Спека | Зависит / зачем |
|---|---|---|
| 030 | Portraits — арты PC | первый потребитель R2 |
| 031 | Карта мира и локации | фундамент; кормит 035/036 |
| 032 | Реворк энкаунтеров (encounter-as-node) | prereq для 033/037 |
| 033 | DM sandbox (visibility) + концепт-редактор | клиент — 032 |
| 034 | Правила и хомрулы кампании | settings |
| 035 | DM session control (день/движение пачки) | нужна 031 |
| 036 | Pack/PC movement timeline | нужны 031+035 |
| 037 | Квесты | после 032 |
| 038 | Часы / проекты (clocks) | независимо |
| 039 | ~~Заклинания + слоты (IDEA-029)~~ | **поглощена эпиком**: слоты → 045, спеллы → 046 (chat 95) |
| 040 | Трекер трат на ход (action/bonus/reaction) | хвост Spec-007 |
| 041 | Факультативы → бонусы к статам (IDEA-037) | **сжата**: контент + грант поверх 047/048, машинерия — движок (chat 95) |
| 042 | Система фидбека в приложении (IDEA-041) | независимо |

## Эпик «RPG-движок» (канон: .specify/epics/rpg-engine/constitution.md)

| № | Спека | Зависит / зачем |
|---|---|---|
| 044 | Mobile Ledger — кошелёк/бухгалтерия игрока; PWA-шелл; **первый шип** | — параллельно движку |
| 045 | RPG Engine Core: модули, эффекты, ресурсы, слой-0 | фундамент; Specify v2 |
| 022 | Player Mobile Mode v3 — лист поверх модулей; **второй шип** | 045 P1; шелл 044 |
| 046 | База контента: спеллы (+машинерия баз) | 045; поглощает 039 |
| 047 | Форк нод (копия + forked_from) | 045 |
| 048 | База контента: фиты + бэкграунды (+расы?) | 046 |
| 049 | Пирамида прогрессии (level-up руками) | 045 |
| 050 | База классов/подклассов + мана-максимум | 049 |
| 051 | Конструктор хоумбрю (effect-блоки) | 045, 047 |

Не нумеруются пока (мелочь/IDEA): Сиория-таб (IDEA-063), тасктрекер с
автосинком (IDEA-064), PillEditor v2, импорт из Google Sheets, панель
реакций/легендарок, IDEA-055, IDEA-056. R2 поднимается открывающим
шагом spec-030 (кросс-проектный runbook в `infra/`).

## В проде (одной строкой; детали → CHANGELOG.md, chatlog/, архив NEXT)

| Спека | Что |
|---|---|
| 001 | Каталог сущностей: граф нод + рёбер, поиск, фильтры, создание |
| 002/005 | Трекер энкаунтера v3: инициатива, HP, условия, эффекты, лог |
| 003 | Петли и сессии как ноды графа |
| 006 | Auth + роли (owner / dm / player) |
| 007 | Чарник: статблоки, способности (этапы 1–3) |
| 009 | Loop progress bar + session packs |
| 010 | Transactions ledger — `/accounting` |
| 011 | Общак (stash): put/take, shortfall flow |
| 012 | Loop-start setup: кредит / монеты / предметы per-PC + автоген |
| 013 | Encounter loot → транзакции |
| 014 | Approval flow заявок игроков (pending/approve/reject) |
| 015 | Каталог предметов + инвентарь v2 |
| 016 | Дефолтные цены предметов |
| 017 | Складчина (contribution pool) |
| 018 | dnd.su магпредметы (844 шт., codegen-миграции) |
| 019 | Starter setup overview: один экран на все PC + apply |
| 023–027 | Инфра-эпик: бокс, self-hosted Supabase, бэкапы+drill, миграция, cutover |
| 028 | Доступ команде + авто-деплой (CI gate → Dokploy) + Telegram-бот |
| 029 | Read-only Postgres MCP: Claude видит БД из Desktop (туннель = выключатель) |
| 043 | Staging: облачная staging-БД + staging.theloopers.org + PR-only `main` |

## Хвосты (не блокеры)

Помечены `(tail)` в tasks.md своих спек: 012 autogen-badge UI (T036–T039),
013/014/015/017 manual walkthroughs, 018 DDHC source name, pagination cap
10k нод (~1600 сейчас), 043 T017 (цикл тиммейтом). Поднимать по запросу, не по умолчанию.

## Правила

- Код и процессы разработки: `mat-ucheniya/AGENTS.md` (канон).
- Boot-протокол, языки, режим работы: `meta/claude-project-instructions.md`
  (канон; текст в настройках Claude-проекта — копия, синхронизировать
  при изменении файла).
- Конец сессии: `bash scripts/dev/close-session.sh <slug>` → заполнить
  chatlog → обновить этот файл (только состояние!) → commit + push.
