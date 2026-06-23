# NEXT — boot-файл проекта

> Только актуальное состояние. История: `CHANGELOG.md`, `chatlog/`
> (включая `chatlog/_legacy-NEXT-archive.md` — полные тексты прежних NEXT).
> Протокол старта сессии: `bash scripts/dev/status.sh` → этот файл →
> `tasks.md` активной спеки. Лимит файла: 150 строк / 10 KB (следит status.sh).
> Last updated: 2026-06-23 (chat 97 — spec-044 фидбэк-раунд закрыт на ветке
> [миниатюры/кредит/общак-предметы/вёрстка/мобильный вход], ждёт мобильного
> ретеста + PR; новая spec-052 Inventory — Specify draft, awaiting Clarify)

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

1. **spec-044 Mobile Ledger — на ветке `claude/044-mobile-ledger`, фидбэк-раунд
   закрыт, в staging, зелёный (418 vitest).** P0–P3 + 6 правок хэнд-теста
   (Cloudflare-миниатюры, кредит петли 500 ЗМ/1×/авто, предметы в-из общака,
   карточка без скролла, **фикс мобильного входа** через `setSession`). **Ждёт:
   мобильный ретест (чтение+запись; если запись падает → токен в экшены) → PR
   T030 → realtime T019–T021 (прод DEBT-011).** Спека: `044-mobile-ledger/spec.md`.

2. **spec-052 Inventory — НОВАЯ, Specify draft, awaiting Clarify.** Поверх 044:
   контейнеры (передача/забор), покупка за голду, наборы (создают+покупают
   одной кнопкой), статус «Надето». **Бухгалтерию не трогает** (ходы=item-tx,
   покупка=деньги+предмет; новое — флаг «Надето» + наборы). Дальше **Clarify**
   (C-01..C-10). Спека: `052-inventory-containers-sets/spec.md`.

3. **spec-046 Telegram Auth + Card — РЕАЛИЗОВАН на ветке
   `claude/046-telegram-auth-pc-card`, на прод НЕ мерджен (ждёт PR, T026).**
   `/tg` (initData → свой JWT → карточка PC с портретом в натуральном
   соотношении), ДМ-привязка `/c/<slug>/settings/telegram`, миграции 115/116,
   сид портретов. E2E на staging пройден. **Прод-катовер при мердже ↓.**

4. **Эпик «RPG-движок»** — канон `.specify/epics/rpg-engine/constitution.md`
   (E1–E11, R1–R12; карта v1.6.0: телега(046) ∥ ledger(044) → движок(045) →
   лист(022) → базы → форк → пирамида → классы → конструктор). **spec-045
   Engine Core — Specify draft, awaiting Clarify** (C-01…C-05; C-06=R6).
   Ресерч-решения D-1…D-13 ждут Андрея →
   `epics/rpg-engine/research/best-practices-review.md` (same-op, add↔mult,
   roll-эффекты, дельты vs LWW, R9-неопознанные). R6-прозрачность; spec-022
   ждёт 045; мана = DMG Spell Points (R12/FR-025).

## Прод-катовер 046 (при мердже ветки → `main`)

Полный чеклист — `046-telegram-auth-pc-card/operator-runbook.md` (ветка). Кратко:
PR → миграции 115+116 на прод (Studio-туннель) → прод-env `SUPABASE_JWT_SECRET` +
`TELEGRAM_BOT_TOKEN` + build-arg `NEXT_PUBLIC_R2_PORTRAIT_BASE` (без пробелов вокруг `=`!) → бот `/tg` → сид (те же node-id ключи).

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
| 044 | Mobile Ledger — кошелёк/бухгалтерия игрока **в Mini App (046)** | АКТИВНА; параллельно движку |
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
