# Implementation Plan: PC Holdings Overview

**Spec**: `.specify/specs/020-pc-holdings-overview/spec.md`
**Created**: 2026-04-28
**Status**: Draft
**Estimated effort**: ~3–4 часа. **Миграций 0.** Один новый
read-query (`getHoldingsSummary`) + один thin row shim
(`<HistoryRowReadonly>`) + один client-side disclosure
(`<HiddenPcsDisclosure>`) + one server page. Всё остальное —
переиспользование существующих компонентов.

---

## Architecture overview

Spec-020 — чистый UI-слой. Никаких новых таблиц, никаких изменений
в server actions, RLS или pure helpers. Бизнес-логика балансов и
инвентаря уже есть:

- `getInventoryAt(actorNodeId, loopNumber, dayInLoop)` —
  возвращает inventory snapshot. Per-PC, скоупится по loop+day.
- `getLedgerPage(campaignId, filters, cursor, pageSize)` —
  paginated history с фильтром `actorPcId`. Возвращает уже
  hydrated rows с counterparty / sessions / category.
- `getCurrentLoop(campaignId)` — активная петля.
- `getStashNode(campaignId)` — общак (если есть).
- `<WalletBalance>` — render баланса.
- `<InventoryGrid>` — render инвентаря.
- `<TransactionRow>` — row history (с `canEdit={false}` подавляет
  edit-buttons; `onEdit`/`onDelete` — required props, передаём
  no-ops).

### Что нового

1. **Server query** `getHoldingsSummary(campaignId, loopNumber)` в
   новом `lib/holdings.ts` — один SQL, возвращает per-PC агрегат:
   баланс (gp-equivalent), tx-counter (исключая starter-setup),
   `lastActivityDay`, `isActive` флаг. Один проход по
   `transactions` для всей кампании, group by `actor_pc_id`.
   Это даёт header'ы всех карточек без N+1.

2. **Page** `app/c/[slug]/accounting/holdings/page.tsx` —
   server component. Параллельно:
   - `getMembership` (auth).
   - `getCurrentLoop` → если `null` → empty state.
   - `getCharactersForCampaign` (список PC + titles + аватары).
   - `getStashNode`.
   - `getHoldingsSummary` (наш новый).
   - `getInventoryAt` × N+1 (N PC активных + 1 stash). Вызовы
     параллелятся через `Promise.all`. **Не** запрашиваем
     inventory для неактивных PC на page load — ленивая загрузка
     при раскрытии disclosure'а (см. p. 4).
3. **Карточка `<PcHoldingsCard>`** — server component (для
   stash и активных PC). Принимает full data: pc, balance,
   inventory[], txCount, isStash. Сам рендерит header (имя +
   баланс sticky), inventory body, history collapse-bar.
4. **Карточка `<HiddenPcCard>`** — client-side variant для
   неактивных PC внутри disclosure'а. Рендерит **только**
   header. Body загружается по клику через server action
   `getHiddenPcDetailsAction(campaignId, pcId, loopNumber, day)`,
   возвращает `{ inventory, recentTx }`. Это позволяет
   избежать загрузки инвентарей для 23 неактивных PC при
   рендере страницы.
5. **Disclosure `<HiddenPcsDisclosure>`** — client wrapper
   с локальным state `expanded: boolean`. Default — collapsed.
   Внутри лениво рендерит `<HiddenPcCard>` × N когда раскрыт.
6. **History expansion `<HistoryExpander>`** — client wrapper
   на каждой раскрываемой карточке. Локальный state
   `{ open, rows, loading, error }`. По клику «Показать ▾» —
   server action `getHoldingsHistoryAction(campaignId, pcId,
   limit=10)` (тонкий wrapper над `getLedgerPage`). Рендерит
   ленту через `<HistoryRowReadonly>`.
7. **`<HistoryRowReadonly>`** — тонкий shim ~30 LOC. Один из
   двух вариантов:
   - **Variant A**: переиспользовать `<TransactionRow>` с
     `canEdit={false}`, `onEdit`/`onDelete` = no-op. Существующий
     row знает как рендерить себя без edit controls (см.
     `<TransactionRow>` line 157 — `{canEdit && (...)}`).
   - **Variant B**: написать с нуля компактную read-only row
     (минус counterparty hover, минус session link).
   Решение: **A** для MVP. Если визуально слишком тяжёлый —
   B в Phase 5 polish.
8. **Server action** `app/actions/holdings.ts` — два action:
   - `getHiddenPcDetailsAction(campaignId, pcId, loopNumber,
     day)` для disclosure-карточки.
   - `getHoldingsHistoryAction(campaignId, pcId, limit=10)`
     для history expansion.
   Обе требуют membership; обе wrapper'ы над существующими
   `getInventoryAt` + `getLedgerPage`. Сервер actions нужны
   потому что lazy-load делается в client, а эти library-
   функции server-only (`createClient` через `cookies()`).

---

## File operations

### New files

```
mat-ucheniya/
├── app/
│   ├── actions/
│   │   └── holdings.ts                                    [NEW]
│   └── c/[slug]/accounting/holdings/
│       └── page.tsx                                       [NEW]
├── components/
│   ├── pc-holdings-card.tsx                               [NEW]
│   ├── hidden-pc-card.tsx                                 [NEW]
│   ├── hidden-pcs-disclosure.tsx                          [NEW]
│   ├── history-expander.tsx                               [NEW]
│   └── history-row-readonly.tsx                           [NEW]  (Variant A wrapper)
└── lib/
    └── holdings.ts                                        [NEW]
```

### Touched files

- `components/nav-tabs.tsx` — оставляем как есть. «Холдинги»
  не получает свой top-level tab — это под-страница
  бухгалтерии. Доступ через breadcrumb / link с
  `/accounting`.
- `app/c/[slug]/accounting/page.tsx` — добавить link
  «Холдинги →» в существующий header (рядом с уже
  существующими «Стэш / Стартовый сетап»). Один из этих
  трёх паттернов уже есть, копируем.

### No changes

- Никаких изменений в server actions
  (`app/actions/transactions.ts`, `stash.ts`, и т.д.).
- Никаких изменений в pure helpers
  (`lib/transaction-resolver.ts`, `lib/inventory-aggregation.ts`).
- Никаких изменений в RLS (всё через существующий
  `getMembership` гейт).

---

## Phase plan

### Phase 1 — Read query + types

**Goal**: `getHoldingsSummary` возвращает корректный массив для
тестовой кампании.

**Tasks**:
1. Создать `lib/holdings.ts`. Type:
   ```ts
   export type HoldingsSummaryRow = {
     actorPcId: string;
     balanceGp: number;            // aggregateGp(coins) summed
     txCountExclStarter: number;   // see SQL below
     lastActivityDay: number | null;
     isActive: boolean;            // txCountExclStarter > 0
   };
   ```
2. Реализовать `getHoldingsSummary(campaignId, loopNumber)`:
   - Один SELECT по `transactions`:
     ```sql
     SELECT
       actor_pc_id,
       SUM(amount_cp + amount_sp*10 + amount_gp*100 + amount_pp*1000) / 100.0 AS balance_gp,
       COUNT(*) FILTER (
         WHERE autogen_wizard_key IS NULL
            OR autogen_wizard_key NOT IN ('starting_money', 'starting_loan', 'stash_seed', 'starting_items')
       ) AS tx_count_excl_starter,
       MAX(day_in_loop) FILTER (
         WHERE autogen_wizard_key IS NULL
            OR autogen_wizard_key NOT IN ('starting_money', 'starting_loan', 'stash_seed', 'starting_items')
       ) AS last_activity_day
     FROM transactions
     WHERE campaign_id = $1
       AND loop_number = $2
       AND status = 'approved'
       AND actor_pc_id IS NOT NULL
     GROUP BY actor_pc_id;
     ```
   - Через Supabase client (`.from('transactions').select(...)`)
     с RPC, не raw SQL — соответствие codebase convention.
     **Альтернатива**: написать как Postgres function (RPC) для
     лучшей читаемости — решение в Phase 1 implementation. SUM
     в Supabase JS чуть громоздок.
3. Тесты `lib/__tests__/holdings.test.ts` — vitest:
   - Empty campaign → `[]`.
   - PC с только starter-setup транзакциями → `isActive=false`,
     `txCountExclStarter=0`, `balanceGp=` (стартовая сумма).
   - PC с mixed транзакциями → корректный баланс +
     корректный counter (только non-starter).
   - 3 PC параллельно → правильное partitioning.

**Done when**: 4-5 vitest тестов зелёные, тип экспортирован,
функция доступна для импорта в page.

### Phase 2 — Server actions для lazy load

**Goal**: client'ы могут лениво грузить инвентарь и историю.

**Tasks**:
1. `app/actions/holdings.ts`:
   ```ts
   export async function getHiddenPcDetailsAction(
     campaignId: string,
     pcId: string,
     loopNumber: number,
     day: number,
   ): Promise<{ ok: true; inventory: InventoryRow[] } | { ok: false; error: string }>

   export async function getHoldingsHistoryAction(
     campaignId: string,
     pcId: string,
     limit?: number,
   ): Promise<{ ok: true; rows: TransactionWithRelations[]; total: number }
              | { ok: false; error: string }>
   ```
2. Каждый action:
   - `getMembership` гейт → `error: 'Нет доступа'`.
   - Wrap `getInventoryAt` / `getLedgerPage`.
   - Try/catch → строковая ошибка.
3. Тесты — нет (это thin wrappers; тестить
   через playwright позже).

**Done when**: actions компилируются + вызываются с тестовой
страницы без ошибок.

### Phase 3 — `<PcHoldingsCard>` server component

**Goal**: одна карточка PC рендерится с baseline data.

**Tasks**:
1. `components/pc-holdings-card.tsx`:
   - Props: `{ pc: { id, title, avatar? }, balance: Wallet,
     balanceGp: number, inventory: InventoryRow[], txCount:
     number, isStash: boolean, campaignSlug: string,
     loopNumber: number, day: number }`.
   - Layout: header (sticky внутри карточки) + body.
   - Header:
     - Slate icon (PC аватар или 🏦 для stash).
     - Title (имя или «Общак»).
     - Right: gp-баланс (font-mono, цветной indicator если 0/негатив).
   - Body:
     - `<InventoryGrid items={inventory} ... />`.
     - `<HistoryExpander pcId={pc.id} txCount={txCount}
        campaignId={campaignId} />` (client wrapper).
2. Минимальная стилизация: rounded-lg border, padding,
   gap. Никакого custom design — соответствует
   `<PcStarterConfigBlock>` визуально.

**Done when**: одна карточка рендерится в test-page, header
sticky работает на iframe-resize.

### Phase 4 — Page assembly

**Goal**: вся страница работает с happy-path данными.

**Tasks**:
1. `app/c/[slug]/accounting/holdings/page.tsx` — server component.
2. Параллельный fetch (см. § Architecture / page структура).
3. Empty state: `currentLoop === null` → `<EmptyHoldingsState />`
   с link на `/loops`.
4. Стэш карточка: рендер `<PcHoldingsCard isStash={true} ... />`.
5. Активные карточки: filter по `summary.isActive`, sort by
   `balanceGp` desc, render каждую `<PcHoldingsCard />`.
6. Disclosure: filter не-активных, передать массив в
   `<HiddenPcsDisclosure pcs={...} campaignId loopNumber />`.
7. Loop-context bar над списком: «Петля N · день M».

**Done when**: страница рендерится в проде, видны все
ожидаемые карточки + disclosure.

### Phase 5 — Disclosure + lazy load

**Goal**: `<HiddenPcsDisclosure>` раскрывается, грузит
inventory'ы лениво.

**Tasks**:
1. `components/hidden-pcs-disclosure.tsx` — `'use client'`.
   - State `expanded: boolean`.
   - Render `<button>` + count + chevron.
   - При expanded — рендерит `<HiddenPcCard pcId balance={...}
      campaignId loopNumber day />` × N.
2. `components/hidden-pc-card.tsx` — `'use client'`.
   - Header — имя + баланс (data из props summary).
   - Body — collapsed by default, кликом раскрывается.
   - При раскрытии body — `getHiddenPcDetailsAction` →
     `<InventoryGrid>` + `<HistoryExpander>`.
   - Loading state: spinner внутри body.
3. Sort внутри disclosure — by name asc (FR-012).

**Done when**: disclosure раскрывается, individual cards
раскрываются, inventory грузится без блокировки others.

### Phase 6 — History expander

**Goal**: «Показать историю» работает на любой карточке.

**Tasks**:
1. `components/history-expander.tsx` — `'use client'`.
   - Props `{ pcId, txCount, campaignId, campaignSlug }`.
   - State `{ open, rows, loading, error }`.
   - Если `txCount === 0` → render disabled bar «Транзакций
     нет в этой петле».
   - Иначе — bar «Показать историю (N) ▾».
   - При open: fetch через `getHoldingsHistoryAction`.
   - Render через `<HistoryRowReadonly>` × N.
   - Внизу — `<Link href="/c/<slug>/accounting?pc=<pcId>">
     Все транзакции →</Link>` (FR-015).
2. `components/history-row-readonly.tsx`:
   - Wrapper над `<TransactionRow>` с `canEdit={false}` +
     no-op `onEdit`/`onDelete`.
   - Если визуально тяжёлый — переписать на собственный
     компактный layout. Решение в implementation.

**Done when**: history expansion на любой карточке
загружает 10 строк, ссылка «Все транзакции →» ведёт на
существующий ledger UI с корректным `?pc=<id>` filter'ом.

### Phase 7 — Polish + Edge cases

**Goal**: страница соответствует FR.

**Tasks**:
1. Edge case: пустая кампания (нет PC) → empty state
   «Персонажей в кампании пока нет».
2. Edge case: кампания без активной петли → empty state
   с link на /loops (Phase 4 задание).
3. Edge case: все PC неактивны → надпись над disclosure'ом
   «В этой петле пока никто не активничал».
4. Edge case: stash пустой (нет seed transactions) →
   карточка stash рендерится с балансом 0 + empty inventory.
5. Mobile: карточки full-width на < 640px, header sticky
   внутри карточки.
6. Кликабельный loop-context → `/loops` (FR-020).
7. Ссылка с `/accounting/page.tsx` на `/holdings`.

**Done when**: вся spec проверена ручным walkthrough'ом
на mat-ucheniya prod.

---

## Performance considerations

### Page load

- `getHoldingsSummary` — один SQL, вся кампания, ~50-100 ms.
- `getCharactersForCampaign` — кэширован.
- `getCurrentLoop` — кэширован.
- `getInventoryAt` × (1 stash + N активных PC) параллельно
  через `Promise.all`. На mat-ucheniya N ≈ 5-10 активных в
  любой момент (большинство из 29 не активны в текущей
  петле). Каждый вызов ~50ms. Параллельно → ~50ms total.
- **Total page render**: ~150-200 ms на проде. ОК для FR-SC-001
  (< 3 секунд).

### History lazy load

- 1 PC × 10 rows ledger query — ~50ms через `getLedgerPage`.
- Если DM раскроет 5 одновременно → 5 запросов параллельно
  через 5 server action calls. ~50ms каждый, не блочит UI.

### Hidden disclosure expansion

- 23 неактивных PC × `getInventoryAt` = 23 параллельных
  запросов когда disclosure раскрыт. ~50ms каждый. Total
  ~100ms (с лимитом connections в pool, но 23 параллельных
  Supabase JS не должно ломать pool). Spinner per-card во
  время загрузки.
- **Не блокируем render самого disclosure'а** — карточки
  показывают header сразу (data из summary), body грузится
  лениво.

---

## Open questions for implementation

1. **Inventory per hidden PC**: грузить inventory вместе с
   header при раскрытии disclosure'а или только при
   раскрытии конкретной карточки внутри?
   - **Decision (recommend)**: только при раскрытии карточки.
     В большинстве случаев disclosure раскроется чтобы найти
     одного-двух PC, остальных DM скроллит мимо. Не
     загружать 23 inventory сразу.
2. **History row visual**: использовать `<TransactionRow>`
   как есть с `canEdit={false}` или написать минимальный
   собственный компонент?
   - **Decision (recommend)**: A для MVP, B если визуально
     тяжёлый. Решается в Phase 6 implementation.
3. **`getHoldingsSummary` через RPC vs JS-агрегация**:
   - **Decision (recommend)**: попробовать через
     Supabase JS chain (`select` + group via filter), если
     слишком сложно — Postgres function в новой миграции
     `045_holdings_summary.sql`. Это **может изменить**
     количество миграций в плане с 0 до 1, поэтому решение
     обязательно в Phase 1, до ухода в остальные фазы.

## Risks & mitigations

| Риск | Mitigation |
|---|---|
| `aggregateGp` на стороне SQL даёт floating-point дрейф | Использовать integer cp в SQL, делить на 100.0 в JS на финальном этапе. Existing `aggregateGp` уже это делает. |
| 23 параллельных `getInventoryAt` рвут Supabase pool | Если станет проблемой — батчить по 5, или объединить в один SQL `WHERE actor_pc_id IN (...)`. Не оптимизируем pre-emptively. |
| `<TransactionRow>` слишком тяжёлый для read-only ленты | Phase 6 fallback на B. |
| `is_starter_setup` не существует в схеме (schema marker = `autogen_wizard_key`) | **Уже учтено в плане**. Spec FR-007/013 говорят про `is_starter_setup`, но реальный маркер — `autogen_wizard_key NOT IN (...)`. SQL запросы использует правильный маркер. |
| User clicks history expand на 29 карточек одновременно | Server actions параллельные, Supabase pool справится. Если нет — debounce. |

---

## Tasks

См. `tasks.md` (создаётся в Tasks phase).
