# Implementation Plan: Складчина (Real-money Chip-in)

**Spec**: `.specify/specs/017-contribution-pool/spec.md`
**Created**: 2026-04-26 (chat 72)
**Status**: Draft
**Estimated effort**: 1–2 chats. 1 миграция, 2 таблицы, 1 read
module, 1 actions module, 4 UI компонента, 1 новая top-level
page с двумя табами. Никаких триггеров поверх `transactions`,
никаких изменений в существующих таблицах.

---

## Architecture overview

Складчина — изолированная подсистема. Не трогает `transactions`,
`nodes`, петли, сессии, ноды. Делит с остальным приложением только
Supabase auth, `campaign_members`, `campaigns`, design tokens и
patterns из `/accounting`.

Четыре архитектурных шва:

1. **Две новые таблицы — `contribution_pools` (header) и
   `contribution_participants` (rows).** Связь FK + ON DELETE
   CASCADE. Никаких mirror-нод, никаких изменений существующих
   таблиц.
2. **Архивность — derived в SELECT.** Никаких triggers, никаких
   status enum'ов. Pool «закрыт» когда `(deleted_at IS NOT NULL)
   OR (every participant has paid_at IS NOT NULL)`. List и detail
   вьюхи фильтруют клиентским коэффициентом сразу после fetch'а
   (5–30 строк, JS-side filter тривиален) **или** SQL-стороной
   через подзапрос. Решение в § Archived computation.
3. **Single read surface — `lib/contributions.ts`.** Server-only.
   Возвращает плоские DTO. Hydration участников + автора +
   computed `archived` flag — в одном модуле, чтобы page-server
   просто звал `getContributionPools(campaignId)` и
   `getContributionPool(poolId)`.
4. **Single write surface — `app/actions/contributions.ts`.**
   Все mutations через server actions. Admin client + ручной
   role-check (паттерн из `categories.ts` / `transactions.ts`).
   RLS в БД — second line of defence; гейтинг в actions —
   первичный.

---

## Schema (migration 047)

Файл: `supabase/migrations/047_contribution_pools.sql`. Один
forward-only migration. Без data backfill (фича новая).

```sql
-- ============================================================================
-- Spec-017: Real-money chip-in (Складчина).
-- ============================================================================

-- Header table.
create table contribution_pools (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references campaigns(id) on delete cascade,
  created_by uuid not null
    references auth.users(id),
  title text not null
    check (char_length(title) between 1 and 100),
  payment_hint text
    check (payment_hint is null or char_length(payment_hint) <= 200),
  total numeric(12, 2) not null
    check (total > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_contribution_pools_campaign
  on contribution_pools (campaign_id, updated_at desc);

comment on table contribution_pools is
  'Spec-017 Складчина — real-money chip-in pool. Sidecar to the
   in-game ledger (spec-010/011); does not touch transactions.
   Archived = derived: deleted_at OR all participants paid.';

-- Participants (rows).
create table contribution_participants (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null
    references contribution_pools(id) on delete cascade,
  user_id uuid
    references auth.users(id) on delete set null,
  display_name text not null
    check (char_length(display_name) between 1 and 100),
  share numeric(12, 2) not null
    check (share >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_contribution_participants_pool
  on contribution_participants (pool_id);

create index idx_contribution_participants_user
  on contribution_participants (user_id)
  where user_id is not null;

comment on table contribution_participants is
  'Per-participant rows for a contribution pool. user_id NULL =
   ad-hoc (free-text name). display_name is always populated:
   snapshot for linked rows, raw for ad-hoc — display does not
   break if a member leaves the campaign.';

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-bump pool.updated_at when participants change so the list
-- view can sort by "last activity" coherently.
create or replace function bump_contribution_pool_updated_at()
returns trigger
language plpgsql
as $$
begin
  update contribution_pools
     set updated_at = now()
   where id = coalesce(new.pool_id, old.pool_id);
  return coalesce(new, old);
end;
$$;

create trigger trg_contribution_participants_bump_pool
  after insert or update or delete on contribution_participants
  for each row execute function bump_contribution_pool_updated_at();

-- Standard updated_at trigger on the pool itself.
create or replace function set_contribution_pool_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_contribution_pools_updated_at
  before update on contribution_pools
  for each row execute function set_contribution_pool_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table contribution_pools enable row level security;
alter table contribution_participants enable row level security;

-- Pools: SELECT for any campaign member.
create policy contribution_pools_select on contribution_pools
  for select using (is_member(campaign_id));

-- INSERT: any campaign member, must be self-author.
create policy contribution_pools_insert on contribution_pools
  for insert with check (
    is_member(campaign_id) and created_by = auth.uid()
  );

-- UPDATE: author or DM/owner. Soft-delete = UPDATE deleted_at.
create policy contribution_pools_update on contribution_pools
  for update using (
    created_by = auth.uid() or is_dm_or_owner(campaign_id)
  ) with check (
    created_by = auth.uid() or is_dm_or_owner(campaign_id)
  );

-- DELETE: blocked. Soft-delete only via UPDATE.
-- (No DELETE policy created → default-deny.)

-- Participants: SELECT for any member of the pool's campaign.
create policy contribution_participants_select on contribution_participants
  for select using (
    exists (
      select 1 from contribution_pools p
       where p.id = contribution_participants.pool_id
         and is_member(p.campaign_id)
    )
  );

-- Mutate (INSERT / UPDATE / DELETE): author of pool or DM/owner.
create policy contribution_participants_mutate on contribution_participants
  for all using (
    exists (
      select 1 from contribution_pools p
       where p.id = contribution_participants.pool_id
         and (p.created_by = auth.uid() or is_dm_or_owner(p.campaign_id))
    )
  ) with check (
    exists (
      select 1 from contribution_pools p
       where p.id = contribution_participants.pool_id
         and (p.created_by = auth.uid() or is_dm_or_owner(p.campaign_id))
    )
  );
```

Helper functions `is_member()` / `is_dm_or_owner()` уже определены
в миграции 024 — переиспользуем.

---

## Archived computation

Два варианта, выбираем **B**:

**A. JS-side fold.** Server fetches все pools кампании одним
запросом + все participants одним запросом, JS фолдит archived
status. Простой код, лишний row count для активной кампании ≤ 50
pools. Pro: 1 query; con: full participants scan для list view.

**B. SQL-side computed.** SELECT с subquery `EXISTS(unpaid)`:

```sql
select p.*,
       (p.deleted_at is not null) as is_deleted,
       not exists (
         select 1 from contribution_participants pp
          where pp.pool_id = p.id and pp.paid_at is null
       ) as is_all_paid
  from contribution_pools p
 where p.campaign_id = $1
 order by greatest(p.created_at, p.updated_at) desc;
```

Затем **в lib/contributions.ts** делаем второй pass — отдельный
запрос за participants только для needed pool IDs (текущая
вкладка). Pro: list view экономит участников active vs archive;
con: 2 query'я для list. Для list типа `Текущие` (~5–10 pools)
participants pull всё равно нужен — для отображения «ты должен X
₽» и progress.

**Принимаем B**. Реализация: `getContributionPoolsForList(campaign,
tab: 'active' | 'archived')` → query pool с computed flag, фильтр
по табу, потом IN-fetch participants для отображения.

---

## Read layer — `lib/contributions.ts`

Server-only. Чистые DTO out, без Supabase types в сигнатурах.

```ts
// Types
export type ContributionPool = {
  id: string
  campaignId: string
  createdBy: string
  authorDisplayName: string  // hydrated from user_profiles
  title: string
  paymentHint: string | null
  total: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  archived: boolean   // computed: deleted OR all-paid
}

export type ContributionParticipant = {
  id: string
  poolId: string
  userId: string | null   // null = ad-hoc
  displayName: string
  share: number
  paidAt: string | null
}

export type ContributionPoolWithRows = ContributionPool & {
  participants: ContributionParticipant[]
  paidSum: number       // sum of share where paid_at != null
  unpaidSum: number     // total - paidSum
}

// Functions
getContributionPoolsForList(
  campaignId: string,
  tab: 'active' | 'archived'
): Promise<ContributionPoolWithRows[]>

getContributionPool(poolId: string): Promise<ContributionPoolWithRows | null>

countActiveContributionPools(campaignId: string): Promise<number>
// for sidebar/tab badge if we want one (P3)
```

Hydration logic:
1. SELECT pools by `campaign_id`, computed flags, sorted desc.
2. JS filter by tab (active = `!archived`, archived = `archived`).
3. IN-fetch participants WHERE `pool_id IN (…filtered ids)`.
4. IN-fetch `user_profiles` для author display names + linked
   participant display names refresh (use snapshot if missing).
5. Build `paidSum` / `unpaidSum` per pool in JS.

---

## Server actions — `app/actions/contributions.ts`

```ts
// Создать pool с участниками атомарно.
createContributionPool(input: {
  campaignId: string
  title: string
  paymentHint: string | null
  total: number
  participants: Array<{
    userId: string | null
    displayName: string
    share: number
  }>
}): Promise<{ ok: true; poolId: string } | { ok: false; error: string }>

// Edit header (title / payment_hint / total).
updateContributionPoolHeader(input: {
  poolId: string
  title?: string
  paymentHint?: string | null
  total?: number
}): Promise<ActionResult>

// Replace participant set (used by edit form).
// Constraints: paid rows cannot be deleted; их share не может
// измениться. Действие отвергает запрос, если paid row missing
// или share differs.
replaceContributionParticipants(input: {
  poolId: string
  participants: Array<{
    id?: string  // present = update; absent = create
    userId: string | null
    displayName: string
    share: number
  }>
}): Promise<ActionResult>

// Mark/unmark paid — single row.
toggleParticipantPaid(input: {
  participantId: string
  paid: boolean
}): Promise<ActionResult>

// Soft-delete.
softDeleteContributionPool(poolId: string): Promise<ActionResult>
```

Все actions:
1. `getCurrentUser()` → 401 если null.
2. `getMembership(campaignId)` → 403 если null.
3. Role gate (author OR dm/owner) для mutate.
4. `createAdminClient()` для writes.
5. `revalidatePath('/c/<slug>/skladchina', 'page')` после mutate.
   Detail page revalidate если applicable.
6. Error мапы: validation errors → user-readable Russian text;
   RLS / FK errors → generic «Не удалось сохранить, попробуйте
   ещё раз» + console.error для debugging.

Validation:
- `createContributionPool`: title non-empty ≤ 100; total > 0;
  participants ≥ 1; `sum(shares) === total` с epsilon 0.005.
- `replaceContributionParticipants`: same sum check; paid rows
  preservation check.
- `updateContributionPoolHeader.total`: если `new_total <
  sum(paid)` → reject с user-friendly error.

---

## Pure helpers — `lib/contribution-split.ts`

Тестируется vitest'ом. Никаких side effects.

```ts
// Equal split с round-down + remainder в первой строке.
splitEqual(total: number, n: number): number[]
// splitEqual(4500, 6) → [750, 750, 750, 750, 750, 750]
// splitEqual(100, 3)  → [33.34, 33.33, 33.33] (cents-precise)
// splitEqual(0.05, 3) → [0.05, 0, 0]

// Sum check для form validation.
sumShares(shares: number[]): number

// «Может ли total быть уменьшен до X?» — для edit guard.
canReduceTotal(
  newTotal: number,
  participants: Array<{ share: number; paid: boolean }>
): { ok: true } | { ok: false; reason: string; paidSum: number }
```

15+ unit tests planned: edge cases (n=1, total=0.01, n=many,
non-divisible, 2-decimal precision, IEEE float edge cases).

---

## UI structure

### Page

`app/c/[slug]/skladchina/page.tsx` — server component.

```
Layout:
├── PageHeader (title «Складчина», описание 1 строкой)
├── Tabs: Текущие (default) | Архив
│   └── URL: ?tab=active (default) | ?tab=archived
├── Кнопка «+ Складчина» (top-right) — только active tab
└── List:
    ├── Active: <ContributionPoolCard> per pool
    └── Archive: <ContributionPoolCard archived /> per pool
```

URL — single source of truth для tab. Никакого client state для
переключения вкладок.

### Components

1. **`<ContributionPoolCard>`** (server-rendered).
   Один pool в списке. Layout:
   ```
   ┌─────────────────────────────────────────────┐
   │ Пицца 24 апреля           4 / 6 · 3000/4500 │
   │ Автор: Андрей · Тинькофф +7 999 555 12 34 ✕ │ <- copy btn
   │ ────────────────────────────────────────── │
   │ ☑ Андрей (автор)        750 ₽  · сдал      │
   │ ☑ Маша                  750 ₽  · сдал      │
   │ ☐ Вася                  750 ₽  · должен    │
   │ ☑ Петя (внешний)        750 ₽  · сдал      │
   │ ...                                          │
   │ [Редактировать] [Удалить]                    │ <- author/DM only
   └─────────────────────────────────────────────┘
   ```
   Чекбокс — `<form>` с `toggleParticipantPaid` action, optimistic
   update через `useOptimistic`. Кликабелен для author + DM, для
   остальных — read-only (disabled visual).

2. **`<ContributionPoolCreateForm>`** (client island).
   Open inline (или modal — решаем в impl, склоняюсь к inline
   collapse). Поля:
   - Название (text input, required, ≤ 100).
   - Реквизиты (text input, optional, ≤ 200).
   - Общая сумма (number input, required, > 0, 2-decimal).
   - Участники: 2-секционный picker:
     - **Из кампании** (checkbox list members кампании, multi).
     - **Свободно** (input + add button → array of strings).
   - Таблица per-participant share с кнопкой `Разделить поровну`
     (recalc через `splitEqual`).
   - Inline баннер «Сумма не бьётся: X ≠ Y» если sum mismatch.
   - `Создать` (disabled пока not valid) / `Отмена`.

3. **`<ContributionPoolEditForm>`** — re-uses Create form +
   pre-fills + paid-row freeze rules (rows с `paidAt != null`
   рендерятся read-only с lock icon).

4. **`<UserPaymentHint>`** — небольшой helper. Per-row подпись:
   - Автор → `Автор`.
   - Участник unpaid → `ты должен 750 ₽`.
   - Участник paid → `ты сдал ✓`.
   - Не участник → `не участвую` (gray).

### Sidebar nav entry

В `components/nav-tabs.tsx` добавить:

```ts
{ key: 'skladchina', href: 'skladchina', label: 'Складчина', icon: '🤝' },
```

Размещение — между `accounting` и `items` (по близости тематики:
бухгалтерия → real-money sidecar → предметы).

---

## Tasks ordering (для `tasks.md`)

Группы T:

**Phase 1: Schema (T001–T003)**
- T001: write migration 047 + apply locally + smoke `psql \d+`.
- T002: present migration file.
- T003: smoke RLS — членам видно, не-членам нет; author может
  insert + update; non-author player может только select.

**Phase 2: Pure helpers (T004–T005)**
- T004: `lib/contribution-split.ts` + vitest.
- T005: extend types if needed.

**Phase 3: Read layer (T006–T007)**
- T006: `lib/contributions.ts` — `getContributionPoolsForList`,
  `getContributionPool`.
- T007: hand-test — log от server component'а на реальной БД.

**Phase 4: Server actions (T008–T012)**
- T008: `createContributionPool`.
- T009: `updateContributionPoolHeader`.
- T010: `replaceContributionParticipants`.
- T011: `toggleParticipantPaid`.
- T012: `softDeleteContributionPool`.

**Phase 5: UI components (T013–T017)**
- T013: `<ContributionPoolCard>` server-rendered list item.
- T014: `<UserPaymentHint>` helper.
- T015: `<ContributionPoolCreateForm>` client island.
- T016: `<ContributionPoolEditForm>` (extends Create).
- T017: optimistic checkbox toggle (`useOptimistic`).

**Phase 6: Page + nav (T018–T020)**
- T018: `app/c/[slug]/skladchina/page.tsx` со скелетом + tabs.
- T019: `<ContributionPoolDetailPage>` если решим делать
  отдельную detail page (TBD — может всё уместно прямо в card).
  В черновике — карточки разворачиваются inline; отдельная
  detail page **не нужна** для MVP.
- T020: добавить «Складчина» в `components/nav-tabs.tsx`.

**Phase 7: Polish + walk-through (T021–T023)**
- T021: copy-payment-hint button (`navigator.clipboard`).
- T022: empty-state копирайт для обеих вкладок.
- T023: manual walkthrough US1 (full flow create → mark all paid
  → archive → undelete checkbox → restore to active).

**Phase 8: Close-out (T024)**
- T024: lint clean, vitest green, next build clean. Report
  numbers.

Estimated: 1 чат для phases 1–4 (data + actions), 1 чат для
phases 5–8 (UI + close-out). Если phases 1–4 идут гладко, можно
дотянуть в 1 чат.

---

## Out of scope (re-asserted)

- Detail page отдельная — карточки разворачиваются inline в
  списке; URL `?expanded=<poolId>` если хочется direct linking.
  Если в impl станет ясно что card-inline тяжелее detail page —
  пересмотрим, но default — inline.
- Pagination на любой вкладке. Лимит 100, если выйдем — добавим
  отдельной задачей.
- Cross-campaign view. P3.
- Notifications. Out of scope spec'ой.
- Currency picker. Out of scope spec'ой.
- Edit history / undo. Out of scope.

---

## Test strategy

- **Unit (vitest)**: `lib/contribution-split.ts` ≥ 15 тестов,
  edge cases (zero, one row, non-divisible, IEEE precision).
- **Integration (manual)**: walkthrough US1 acceptance scenarios
  (1–6) + US2 (edit) + US3 (delete) на live mat-ucheniya.
- **RLS smoke**: 3 кейса — author создаёт, member видит, outsider
  получает 0 строк. Запускается psql вручную перед merge.
- **Build smoke**: `next build` clean, no type errors, no lint
  errors.

Total tests: ~20 vitest (5 split helper edge + 10 sum/canReduce
edge + 5 hydration / formatting helpers).

---

## Constitution check (re-verified post-plan)

- ✅ I — Складчина вне петли (sidecar).
- ✅ II — paid flip = 1 row update.
- ✅ III-b — Top-level page, не вложена.
- ✅ IV — состояние в БД, derived archived в SELECT.
- ✅ V — paid_at flip in place; конституция допускает упрощение
  для side-фич.
- ✅ VI — mobile-first list view, форма ≤ 5 полей.
- ✅ VII — MVP альтернатив не требует.
- ✅ VIII — Supabase + Next.js, никакой новой инфры.
- ✅ IX — `is_member` / `is_dm_or_owner` — общие хелперы, не
  mat-ucheniya-specific.
- ✅ X — N/A.

---

## References

- `mat-ucheniya/AGENTS.md` — Next.js 16 caveat. Sidebar cache
  не затрагивается (новые таблицы, не nodes/node_types).
- `mat-ucheniya/supabase/migrations/024_auth_profiles_members_rls.sql` —
  определения `is_member()` / `is_dm_or_owner()`.
- `mat-ucheniya/app/actions/categories.ts` — pattern для
  server-action role gate.
- `mat-ucheniya/lib/transactions.ts` — pattern для read layer +
  IN-fetch hydration.
- `mat-ucheniya/components/accounting-sub-nav.tsx` — pattern для
  sub-tabs URL-driven (если нужен будет).
- `.specify/specs/017-contribution-pool/spec.md` — этот план
  реализует.

---

### Status: **Draft**. Awaiting confirmation → Tasks phase.
