# NEXT — boot-файл проекта

> Только актуальное состояние. История: `CHANGELOG.md`, `chatlog/`
> (включая `chatlog/_legacy-NEXT-archive.md` — полные тексты прежних NEXT).
> Протокол старта сессии: `bash scripts/dev/status.sh` → этот файл →
> `tasks.md` активной спеки. Лимит файла: 150 строк / 10 KB (следит status.sh).
> Last updated: 2026-07-03 — в прод уехали: **spec-052 Inventory** (покупка/
> наборы/«Надето»), контент-миграция 122 (8 статуэток чудесной силы SRD + рен
> 7 «Инструмент бардов - X»), баг-фиксы /tg (P1 овердрафт общака, кредит-гонка
> мигр 123, loadMore, «Собрать ещё»), новое меню персонажа (6 видимых кнопок
> вместо ⋮), хотфикс зависания сабмитов снаряжения/покупки. Миграции 118–123
> на проде, staging=main. Портреты проверены на staging и проде.

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
- Realtime: контейнер `supabase/realtime:v2.76.5` поднят (DEBT-011 закрыт), едет
  через kong `/realtime/v1/`; WAL-слот стерегёт `infra/wal-slot-monitor.sh`
  (cron 10 мин, Telegram-алерт, порог 500 МБ).
- Доступ к боксу: Andrey + Лёша + Никита (full-ops; `infra/server-access.md`).

## Дедлайны

- (нет активных дедлайнов)

## Активная работа

Кода в полёте прямо сейчас нет — сессия отгрузила 052 + правки /tg. Развилка
«что дальше» (в приоритете — фидбек по бухгалтерии):

- **Фидбек по бухгалтерии** (spec-044 Mobile Ledger) — правки по итогам прод-
  использования. Andrey хочет заняться этим; собрать список правок → мини-спека/
  задачи.
- **spec-045 Clarify** (разблокировать эпик RPG-движка) — ждёт ответы Andrey
  C-01…C-05 + ресёрч-решения D-1…D-13.
- **spec-030 Portraits P3** (загрузка портретов из приложения) — ждёт C-05
  presigned-vs-proxy + R2-write ключи в env.
- **spec-020 PC Holdings** — Plan готов, ждёт Tasks.

> ⚠️ На локальном `main` непушнутый коммит `a0b9394 infra/portraits-seeding.md`
> (runbook). Docs-only PR застрянет на Quality gate ([[docs-only-pr-gate-gotcha]]) —
> довезти прицепом к ближайшему feature-PR или отдать Andrey на прямой push.

**Эпик «RPG-движок»** — канон `.specify/epics/rpg-engine/constitution.md`
(E1–E11, R1–R12; карта v1.6.0: телега(046) ∥ ledger(044) → движок(045) →
лист(022) → базы → форк → пирамида → классы → конструктор). **spec-045
Engine Core — Specify draft, awaiting Clarify** (C-01…C-05; C-06=R6).
Ресерч-решения D-1…D-13 ждут Андрея →
`epics/rpg-engine/research/best-practices-review.md` (same-op, add↔mult,
roll-эффекты, дельты vs LWW, R9-неопознанные). R6-прозрачность; spec-022
ждёт 045; мана = DMG Spell Points (R12/FR-025).

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
| 044 | Mobile Ledger — кошелёк/бухгалтерия игрока **в Mini App (046)** | ✅ в проде (chat 98) |
| 045 | RPG Engine Core: модули, эффекты, ресурсы, слой-0 | фундамент; Specify v2 |
| 022 | Player Mobile Mode v3 — лист поверх модулей | 045 P1; Mini App (046) |
| 046 | База контента: спеллы (+машинерия баз) | 045; поглощает 039 |
| 047 | Форк нод (копия + forked_from) | 045 |
| 048 | База контента: фиты + бэкграунды (+расы?) | 046 |
| 049 | Пирамида прогрессии (level-up руками) | 045 |
| 050 | База классов/подклассов + мана-максимум | 049 |
| 051 | Конструктор хоумбрю (effect-блоки) | 045, 047 |

Не нумеруются пока (мелочь/IDEA): Сиория-таб (IDEA-063), тасктрекер с
автосинком (IDEA-064), PillEditor v2, импорт из Google Sheets, панель
реакций/легендарок, IDEA-055, IDEA-056.

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
| 044 | Mobile Ledger в Telegram Mini App (`/tg`): кошелёк/бухгалтерия игрока, realtime-обновления, предметы в-из общака, стартовый набор |
| 046 | Telegram Mini App auth (real GoTrue session) + карточка PC с портретом; DM-привязка `/c/<slug>/settings/telegram`; миграции 115/116; сид 31 портрета |
| 030 | Portraits P1+2 (PR #9): карусель портретов на десктоп-нодах + каталог неписей в /tg (список/поиск → арт + markdown-статья). Миг 121, `seed-portraits` v2 (npc+creature). Арты засижены с R2 и проверены на staging+проде (2026-07-03). P3 (загрузка из app) — в очереди |
| 021 | Wiki editor (PR #10): правка статьи в /tg (гейтованный content-API) + wikilinks `[[Имя]]` на десктопе и в /tg. Десктоп-редактор статьи был и раньше (MarkdownContent) |
| 052 | Инвентарь v2 в /tg (PR #12): покупка (авто ниже порога / pending выше, коэффициент), контейнеры, наборы (one-tap + edit-on-buy), «Надето»/снаряжение, стартовое pre-equipped. Миграции 118–120 |
| — | Пост-релиз /tg (2026-07-03): контент — 8 статуэток чудесной силы SRD + рен 7 «Инструмент бардов - X» (миг 122, PR #13); фиксы — P1 овердрафт общака + кредит-гонка (миг 123) + loadMore + «Собрать ещё» (PR #14); UX — меню персонажа 6 видимых кнопок вместо ⋮ (PR #15); хотфикс зависания сабмитов снаряжения/покупки (PR #16) |

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
