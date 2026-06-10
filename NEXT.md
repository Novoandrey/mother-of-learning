# NEXT — boot-файл проекта

> Только актуальное состояние. История: `CHANGELOG.md`, `chatlog/`
> (включая `chatlog/_legacy-NEXT-archive.md` — полные тексты прежних NEXT).
> Протокол старта сессии: `bash scripts/dev/status.sh` → этот файл →
> `tasks.md` активной спеки. Лимит файла: 150 строк / 10 KB (следит status.sh).
> Last updated: 2026-06-10 (chat 91 — Specify v2 + communication rules + cleanup; следующий чат: вердикт по пивоту → Clarify)

## Прод

- **v1.0.0** — https://theloopers.org (Hetzner CPX32 Helsinki, Dokploy,
  self-hosted Supabase; API `db.theloopers.org`, Studio только SSH-туннель,
  5432 закрыт наружу).
- Деплой: push в `main` → CI gate (lint + tsc + vitest) → Dokploy строит
  образ на боксе. Telegram-бот MrBranches шлёт ветки/PR в форум-топик.
- Бэкапы: R2, ночной cron 03:00 UTC, ротация 30 daily / 28 weekly;
  restore drill пройден на реальных данных — stop→healthy ~20 с (2026-06-07).
- Доступ к боксу: Andrey + Лёша + Никита (full-ops; `infra/server-access.md`).

## Дедлайны

- 2026-06-14 — spec-027 **T025**: погасить managed Supabase + Vercel
  (грейс с 2026-06-07, окно до 2026-06-21).

## Активная работа

1. **spec-022 Player Mobile Mode (PWA)** — **Specify v2** (re-scope chat 91:
   живой чарлист по системе Стасяна + кубы + импорт листов; деньги/предметы
   → P2; компендиум и билдер — фазы 2–3 эпика, отдельные спеки). Следующий
   шаг — **Clarify** (очередь вопросов в спеке).

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
| 039 | Заклинания + слоты (IDEA-029) | большая |
| 040 | Трекер трат на ход (action/bonus/reaction) | хвост Spec-007 |
| 041 | Факультативы → бонусы к статам (IDEA-037) | независимо |
| 042 | Система фидбека в приложении (IDEA-041) | независимо |

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

## Хвосты (не блокеры)

Помечены `(tail)` в tasks.md своих спек: 012 autogen-badge UI (T036–T039),
013/014/015/017 manual walkthroughs, 018 DDHC source name, pagination cap
10k нод (~1600 сейчас). Поднимать по запросу, не по умолчанию.

## Правила

- Код и процессы разработки: `mat-ucheniya/AGENTS.md` (канон).
- Boot-протокол, языки, режим работы: `meta/claude-project-instructions.md`
  (канон; текст в настройках Claude-проекта — копия, синхронизировать
  при изменении файла).
- Конец сессии: `bash scripts/dev/close-session.sh <slug>` → заполнить
  chatlog → обновить этот файл (только состояние!) → commit + push.
