# NEXT — boot-файл проекта

> Только актуальное состояние. История: `CHANGELOG.md`, `chatlog/`
> (включая `chatlog/_legacy-NEXT-archive.md` — полные тексты прежних NEXT).
> Протокол старта сессии: `bash scripts/dev/status.sh` → этот файл →
> `tasks.md` активной спеки. Лимит файла: 150 строк / 10 KB (следит status.sh).
> Last updated: 2026-06-23 (chat «telegram-auth» — spec-046 реализован на ветке, ждёт PR+прод-катовер; spec-044 Mobile Ledger активна, фаза Clarify, C-00=Mini App)

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

1. **spec-044 Mobile Ledger — АКТИВНА, фаза Clarify.** Тонкий мобильный слой
   поверх готовой бухгалтерии 009–019 (бэкенд не трогаем): кошелёк, лента
   операций, быстрая запись (расход/доход/категория/день петли), переводы
   PC↔PC и PC↔общак, общак, realtime (DEBT-011 → Plan). **C-00 решён: никаких
   новых PWA — всё в существующем Telegram Mini App `/tg` (шелл/auth от 046);
   из P1 убран весь PWA-shell.** Открыто: C-01 (своя запись vs очередь —
   поднять из кода), C-02 (мульти-PC IA), C-03 (read-list предметов здесь vs
   022), C-04 (навигация-вкладка внутри `/tg`), C-05 (депозит в общак без
   аппрува — из кода). Спека: `.specify/specs/044-mobile-ledger/spec.md`.

2. **spec-046 Telegram Auth + Card — РЕАЛИЗОВАН на ветке
   `claude/046-telegram-auth-pc-card`, на прод НЕ мерджен (ждёт PR, T026).**
   `/tg` (initData → свой JWT → карточка PC с портретом в натуральном
   соотношении), ДМ-привязка `/c/<slug>/settings/telegram`, миграции 115/116,
   сид портретов. E2E на staging пройден. **Прод-катовер при мердже ↓.**

3. **Эпик «RPG-движок»** — канон `.specify/epics/rpg-engine/constitution.md`
   (E1–E11, R1–R12; карта v1.6.0: телега(046) ∥ ledger(044) → движок(045) →
   лист(022) → базы → форк → пирамида → классы → конструктор). **spec-045
   Engine Core — Specify draft, awaiting Clarify** (C-01…C-05; C-06=R6).
   Ресерч-решения D-1…D-13 ждут Андрея →
   `epics/rpg-engine/research/best-practices-review.md` (same-op, add↔mult,
   roll-эффекты, дельты vs LWW, R9-неопознанные). R6-прозрачность; spec-022
   ждёт 045; мана = DMG Spell Points (R12/FR-025).

## Прод-катовер 046 (при мердже ветки → `main`)

Полный чеклист — `046-telegram-auth-pc-card/operator-runbook.md` (ветка).
Кратко: PR → миграции **115+116 на прод** (Studio-туннель `ssh -L
8001:localhost:8001 andrey@37.27.254.49`) → прод-env `SUPABASE_JWT_SECRET`
(=`JWT_SECRET` стека) + `TELEGRAM_BOT_TOKEN` + build-arg
`NEXT_PUBLIC_R2_PORTRAIT_BASE=https://portraits.theloopers.org` (**без пробелов**
вокруг `=`!) → бот на `theloopers.org/tg` → сид с прод-env (`--commit`,
картинки в бакете уже есть, те же node-id ключи).

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
