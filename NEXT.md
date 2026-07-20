# NEXT — boot-файл проекта

> Только актуальное состояние. История: `CHANGELOG.md`, `chatlog/`
> (включая `chatlog/_legacy-NEXT-archive.md` — полные тексты прежних NEXT).
> Протокол старта сессии: `bash scripts/dev/status.sh` → этот файл →
> `tasks.md` активной спеки. Лимит файла: 150 строк / 10 KB (следит status.sh).
> Last updated: 2026-07-20 — в прод: **MEDIA-01…04** (общая медиатека,
> варианты, legacy-import и назначение portrait из library); **MEDIA-05**
> реализована и ожидает merge + production smoke. Ранее: **spec-055 «Вылазки»** (игроцкая /tg-фича:
> меню вылазок → ход = пачка + расходники −общак + награда +общак + дата, событие
> в ленту; миг 124; PR #28) + **spec-054 «Мастер-сообщение»** (закреплённый дашборд
> ленты: петля/общак/балансы PC/предметы общака + лента под катом; PR #24–26) +
> хвост «🎁 Раздан лут» одним событием на applyEncounterLoot. Ранее: spec-053
> лента «Денежки, лут» (PR #19–23). Инфра: `TG_LEDGER_*` в Dokploy env.

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

**MEDIA-05 «Безопасное удаление»** — feature branch `codex/media-safe-deletion`:
member-gated usage summary + один guarded delete. Нет новой generic usage-таблицы:
все consumers используют FK `media_asset_id → media_assets ON DELETE RESTRICT`.
Осталось: PR → merge → production quickstart (`.specify/specs/065-media-safe-deletion/quickstart.md`).

**Следующий приоритет после smoke:** MEDIA-06 metadata/search — дать имя,
теги и поиск, чтобы ДМ находил нужный asset среди 140+ изображений. MEDIA-07
не начинать без новой Specify (независимые portrait/token crop configs).

Кода в активном полёте до MEDIA-05 не было — эпик ленты (053 → 054 → 055 + хвост лута) отгружен.
**Очередь спек** (приоритет Andrey, 2026-07-08): **Крафт (056)** → **Время (057 —
«где какие PC в таймлайне и когда»)** → **RPG-движок** (старт — импорт листа
Стасяна = US3 spec-022 поверх движка 045). Черновики 056/057 + импорт — draft-PR
#27; **Крафт перед стартом ждёт решения Andrey «насколько системный»** (лёгкий /
средний / полный 5e).

Долг: единый ключ инвентаря (/tg по имени vs десктоп node_id, вариант C — своя спека).

Дальше по бэклогу (не блокеры): **spec-045 Clarify** (эпик RPG-движка, ждёт
C-01…C-05 + D-1…D-13); **spec-030 Portraits P3** (ждёт C-05 + R2-write ключи);
**spec-020 PC Holdings** (Plan готов, ждёт Tasks).

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
| 053 | «Денежки, лут» (PR #19–23): TG-лента событий бухгалтерии в топик (`notifyLedgerEvent`→`after()`, таймаут 4с, `TG_LEDGER_*` в Dokploy env), апрувы игроков off (kill-switch `approvals_enabled`, дефолт off), Покупка v2 («оставить на руках» + наборы свои+общак + превью баланса), перенос/общак купленных предметов, десктоп DM-действия в ленту, событие «🔄 Началась новая петля — Петля N» на apply старта петли |
| 054 | Мастер-сообщение ленты (PR #24–26): закреплённый редактируемый дашборд в топик — петля + баланс общака + балансы PC деньгами + предметы общака, лента под катом `<blockquote expandable>`; обновление на каждое событие (`editMessageText` в `after()`), ротация на старте петли (старое замораживается, новое минтится, админ пинит). id в `campaigns.settings`. Рендерер сменный под Rich Messages (Bot API 10.1) |
| 055 | «Вылазки» (PR #28): игроцкая /tg-фича по модели доверия — меню доступных вылазок (шаблоны, добавляют игроки+ДМ) → ход (пачка PC + расходники −общак по цене каталога + награда +общак + дата) → одно событие в ленту. Таблицы `expeditions`/`expedition_runs` (миг 124), `runExpedition`. + хвост: `applyEncounterLoot` шлёт «🎁 Раздан лут, N строк» одним событием |

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
