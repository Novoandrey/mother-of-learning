# Chat 43 — Slice B ship + filter collapsible + item ownership guard, 2026-04-24

## Контекст (откуда пришли)
Chat 42 оставил Slice B (stash page as tabs) написанным локально, но не
закоммиченным — уперся в лимит tool-use. В этом чате коммитим Slice B,
плюс пользователь после визуального прогона прислал два новых запроса
и баг по скриншоту `/accounting`:

1. Filter bar занимает половину экрана — сделать collapsed-by-default.
2. Пометить «текущая» петлю в chip'ах.
3. Bug: при «Положить в общак» за PC (Британия) создаются две зеркальные
   транзакции («Британия → Общак» и «Общак → Британия») — предметы
   «из ниоткуда».

## Что сделано

**Slice B из chat 42 (не успел закоммитить):**
- `components/balance-hero.tsx` (new, server) — lighter sibling of
  `<WalletBlock>` без inline recent list.
- `components/balance-hero-client.tsx` (new, client) — hero card +
  «+ Транзакция» + own TransactionFormSheet (create-only).
- `components/stash-page-tabs.tsx` (new, client) — две таба,
  CSS-only toggle, оба panel'а всегда смонтированы (сохраняет
  ledger filter/scroll state при переключении).
- `components/ledger-list.tsx` — prop `fixedActorNodeId?: string`.
  Override `filters.pc`, скрывает actor-фильтр, прячет
  «N персонажей» summary.
- `components/ledger-filters.tsx` — prop `hideActorFilter?`.
- `app/c/[slug]/accounting/stash/page.tsx` — Header → BalanceHero →
  StashPageTabs(InventoryGrid + LedgerList(fixedActorNodeId)).
  Добавлен `searchParams` prop (Next 16 convention).

**Filter bar collapsible (chat 43):**
- `components/ledger-filters.tsx` переписан. Collapsed header:
  кнопка «Фильтры» + счётчик N + removable active-chip'ы +
  «Сбросить всё». Раскрытие — полная multi-group панель.
- Новый prop `currentLoopNumber?: number | null`. В развёрнутом
  виде — маркер «●» в chip'е текущей петли. В свёрнутом active-chip
  — подпись «Петля №3 · текущая».
- Пробросил через `<LedgerList>` (новый prop) из `/accounting` page
  и `/accounting/stash` page (обе уже имели `currentLoop`).

**Item ownership guard (BUG-fix):**
- `app/actions/transactions.ts` → `createItemTransfer` теперь
  агрегирует `item_qty` по (sender, item_name, loop_number) перед
  insert'ом. Если `owned < qty` — ошибка «У персонажа недостаточно
  «X» — есть N, нужно M. Сначала запишите получение предмета
  отдельной транзакцией.»
- Работает универсально: sender=PC → проверяем PC inventory;
  sender=stash → проверяем stash inventory. Match `item_name`
  точный (case-sensitive, trim). Loop-scoped (FR-015).

## Миграции
Нет.

## Коммиты
- `<sha>` `spec-011 polish Slice B + filter collapsible + item ownership guard`

## Действия пользователю (после чата)
- [x] typecheck + lint + 63 tests (build пропущен — см. ниже про песочницу)
- [ ] задеплоить (авто через main), дождаться Vercel build
- [ ] визуально проверить:
      - [ ] `/accounting` — filter bar свёрнут, активные фильтры чипами,
            клик по «Фильтры» раскрывает панель, петля с «●» помечена
      - [ ] `/accounting/stash` — те же фильтры внутри таба «Лента»
      - [ ] попытаться «Положить в общак» за PC без loot-записи →
            должно прилетать сообщение об ошибке
- [ ] T034 hand-walkthrough US1-US8 из TESTPLAN.md — теперь можно
      прогнать целиком

## Что помнить следующему чату
- **Про песочницу**: `npm run build` в моём контейнере иногда зависает
  (lock в `.next/`). В этой сессии я пропустил build, полагаясь на
  `tsc --noEmit` + `npm run lint` + `npm test`. Пользователь согласен
  что Vercel build + git revert работают как safety net. Если в
  следующем чате build снова виснет — `pkill -f "next build"`,
  `rm -rf mat-ucheniya/.next`, retry. Если всё равно — пропускаем.
- **IDEA-043** (collapse transfer pair) — теперь самый видимый UX
  артефакт после ownership guard'а. Пользователь на скриншоте видел
  пару «Британия → Общак / Общак → Британия» и принял за дубликаты.
  В `getLedgerPage` дедуп по `transfer_group_id` (оставить sender leg)
  решает — кроме случая когда `filters.pc` уже отсекает siblings.
  Активно не P0, но просится как следующий мелкий слайс.
- **T034 walkthrough** всё ещё не прогнан. Теперь stash-пайп должен
  работать «по честному» — прогон ожидается чистым.
