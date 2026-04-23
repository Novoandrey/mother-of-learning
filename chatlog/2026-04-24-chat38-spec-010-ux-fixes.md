# Chat 38 — spec-010 UX fixes + data-driven default day, 2026-04-24

## Контекст (откуда пришли)

Chat 37 имплементил spec-010 полностью и запушил `0cc8a07`.
Пользователь начал играть формой и вскрылся UX-слой, которого
в спеке не было:

- Дефолтный день транзакции откатывался к фронтиру при повторном
  открытии формы — записал что-то на день 12, открыл форму
  заново, а там снова день 7.
- Loop number в форме был редактируемым number-input'ом, хотя
  меняется только через loops-страницу — выглядел editable,
  вводил в заблуждение.
- Day был спрятан за expand/collapse, хотя меняется ~в каждой
  транзакции — лишнее трение.
- Per-denom panel `amount-input`а был обёрнут в синий rounded
  box с padding'ом — sheet визуально раздувался на мобильном
  viewport'е.

Плюс пользователь попросил зафиксировать приоритеты работы
(данные → десктоп → мобилка) прямо в `AGENTS.md`, чтобы каждый
новый чат не уходил в ad-hoc мобильные фиксы.

## Что сделано

### Data-driven default day (helper)

- `lib/transactions.ts` — новый helper `computeDefaultDayForTx(pcId,
  loopNumber, loopId): Promise<number>`. Приоритет выбора дня:
  1. **Latest approved tx** для PC в этой петле (чтобы день не
     откатывался после ручной записи).
  2. **Frontier day** — `getCharacterFrontier(...).frontier`.
  3. `1`.
  Current-session day (IDEA-045) пропущен — встанет выше frontier
  когда roadmap-item дойдёт.
  `lib/loops` импортится динамически (`await import('./loops')`)
  чтобы не ловить циркулярку через общий Supabase-модуль.

### Callsites

- `components/wallet-block.tsx` — ~50 строк inline frontier-query
  через `createAdminClient` заменены одним `await
  computeDefaultDayForTx(...)`. `createAdminClient` и его импорт
  удалены. `defaultSessionId` теперь всегда `null` (определение
  session пока остаётся inline-задачей фронтира, но в form-sheet
  не прокидывается — в форме `session_id` берётся из `editing`
  или `null`).
- `app/c/[slug]/accounting/page.tsx` — добавлен prefetch
  `defaultDayByPcId: Record<string, number>` через `Promise.all`
  по `availablePcs`. Передаётся в `LedgerActorBar`. Литеральный
  `defaultDayInLoop={1}` убран.

### UI чистка

- `components/ledger-actor-bar.tsx` — prop `defaultDayInLoop:
  number` заменён на `defaultDayByPcId: Record<string, number>`.
  При монтировании `<TransactionFormSheet>`:
  `defaultDayByPcId[selectedPc.id] ?? 1`.
- `components/transaction-form.tsx`:
  - `loopNumber` теперь `const number` (без `useState`/
    `setLoopNumber`). Loop — контекст, не поле формы.
  - Удалены `captionExpanded` / `setCaptionExpanded`.
  - Expandable caption-блок заменён одной inline-строкой:
    «Петля N · День [input] · сессия/без сессии». Day —
    обычный number-input без expand.
- `components/amount-input.tsx` — `<div className="rounded-lg
  border border-blue-200 bg-blue-50/50 p-3">` вокруг per-denom
  panel заменён на `<>…</>`. Панель теперь сидит в потоке
  sheet'а без лишнего background'а и padding'а.

### Процессные файлы

- `mat-ucheniya/AGENTS.md` — новая секция «Current-phase
  priorities: data → desktop UX → mobile». Правило: мобилку
  отдельной спекой, точечные мобильные фиксы только если
  контрол вообще не кликабелен на телефоне.
- `backlog.md`:
  - **IDEA-051 [P2]** — стартовый капитал PC из класса/бэкграунда.
    Поле `starting_wealth: CoinSet` на PC-ноде, автогенерация
    income-транзакции на day 1 первой петли. Связь с IDEA-046
    (шаблоны) и будущей спекой PC creation.
  - **IDEA-052 [P3]** — meta: skill для Claude по UI/UX. В
    `/mnt/skills/user/ui-ux-principles/`. Правила из chat 37-38:
    «каждый expand = трение», «read-only не маскировать под
    editable», «плохой дефолт хуже отсутствия», «цвет =
    семантика». Примеры-антипаттерны из этого же чата.

## Миграции

Нет — только UI/lib правки.

## Коммиты

- `81a2c7a` `fix(spec-010): inline day input, data-driven default day priority`
- `91de992` `fix(spec-010): row-level delete for transfers calls deleteTransfer`

## Пост-пуш фикс (delete bug для переводов)

После смока на проде пользователь заметил: нажатие «уд.» на строке
перевода (в ledger или в recent-list кошелька) валится с ошибкой
«Удаление переводов — через deleteTransfer». Корень:
`handleDelete` в обоих клиентах звал `deleteTransaction(id)` без
учёта kind'а, а серверный action на `kind='transfer'` возвращает
эту ошибку и просит идти через `deleteTransfer(groupId)`.

Фикс:

- `components/ledger-row.tsx` — сигнатура prop'а `onDelete`
  расширена с `(id: string) => void` до `(row:
  TransactionWithRelations) => void`, в call site передаётся вся
  строка.
- `components/wallet-block-client.tsx` + `ledger-list-client.tsx`
  — `handleDelete(row)` ветвится по `row.kind === 'transfer' &&
  row.transfer_group_id`: для перевода зовёт `deleteTransfer`,
  для всего остального `deleteTransaction`. Confirm-подсказка
  для перевода говорит «обе стороны будут удалены».
- В `ledger-list-client` оптимистично прячет и second leg через
  `hiddenIds`, чтобы не мигал одинокий получатель до
  `router.refresh()`.

Редактирование перевода в форме уже работало (submit идёт через
`updateTransfer(groupId, patch)`, ownership пропускает автора) —
UI-кнопку «изм.» трогать не пришлось.

## Действия пользователю (после чата)

- [ ] smoke на проде: открыть форму, записать tx на день 10,
  закрыть, открыть заново — день должен остаться 10 (раньше
  откатывался к фронтиру).
- [ ] проверить `/accounting`: переключение PC-дропдауна
  меняет дефолтный день на соответствующий для выбранного
  персонажа.
- [ ] проверить мобильный viewport: amount-input per-denom
  panel не раздувает sheet.

## Что помнить следующему чату

- `npm install` в claude-sandbox'е ломается с ENOTEMPTY на
  cleanup-phase — tsc/lint/vitest локально не прогнаны.
  Полагаемся на Vercel build как на линтер; если красное —
  быстрый fix-up коммит.
- Session picker в форме (IDEA-045 / TECH-009) откладывается
  до рефакторинга current-session как DM-контекста.
- IDEA-052 (UX skill) — не обязательно делать прямо сейчас,
  но пока не сделан, каждый новый form-компонент нужно ревьюить
  на знакомые грабли.
- Следующий приоритет по roadmap'у — spec-011 Общий стах
  (переиспользует transfer primitive).
