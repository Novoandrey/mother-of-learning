# spec-011 — polish proposal (post-ship)

Written chat 41 after the initial hand-walkthrough surfaced UX gaps
in the shipped implementation. Two orthogonal improvements, phaseable
independently. See `chatlog/2026-04-24-chat41-*.md` for the discussion
that led here.

---

## Slice A — transaction row redesign (universal)

**Rationale:** current row is three lines of low-contrast text in a
bordered card. Takes lots of vertical space, doesn't scan, no color
on amounts, no actor→counterparty for transfers, poor accessibility
for players with weak vision.

### Design tokens

| Case | Amount text | Prefix |
|---|---|---|
| Income / incoming transfer | `text-emerald-700 font-semibold` | `+` |
| Expense / outgoing transfer | `text-red-700 font-semibold` | `−` |
| Item (qty) | `text-gray-700 font-semibold` | `×` |

- Primary text: `text-gray-900` (WCAG AAA 7:1 against white)
- Secondary text: `text-gray-600` (not `-400` — bump contrast)
- Day chip: `text-xs font-mono` in `bg-gray-50 rounded px-1.5 py-0.5`
- Amount font-size: 14–16px, bold, right-aligned
- Tap target: ≥44×44 px on mobile
- Edit/delete: visible on keyboard focus, not only hover
- Sign prefix + colour = two independent channels (colourblind-safe)

### Row layout (desktop, one line)

```
[day_chip] [actor_bit?] [main_text] [category_chip?] [amount]
```

- `day_chip`: `д.14` or `д.14·с.3` — tight, fixed left gutter
- `actor_bit`:
  - Ledger page (`showActor=true`): `🧑 Mirian` for money, `🧑 Mirian → 💰 Общак` for transfer/item
  - Per-actor pages (wallet block, stash): hidden (all rows share the actor)
- `main_text`:
  - money: `tx.comment` (fallback to category label if empty)
  - item: `{item_name} ×{qty}`
  - transfer: `tx.comment` (direction already in actor_bit)
- `category_chip`: optional, hidden on narrow viewports
- `amount`: right-aligned, colored per table above

### Row layout (mobile, ≤640 px)

Primary info wraps to max 2 lines:

```
[actor_bit?] [main_text]                    [amount]
[day_chip]   [category_chip?]
```

Amount stays fixed on the first line, right-aligned.

### New component

- `components/transaction-row.tsx` (client) — takes `tx`, `showActor`,
  `canEdit`, `onEdit`, `onDelete`. Replaces two existing row layouts.

### Files that change

- **new** `components/transaction-row.tsx`
- `components/wallet-block-client.tsx` — swap `RecentList` body for
  `<TransactionRow>` loop
- `components/ledger-list.tsx` — swap rows for `<TransactionRow>`

### Open question (Slice A)

**Transfer counterparty resolution.** Current `TransactionWithRelations`
may or may not expose the sibling leg's `actor_pc_id` / title. If not,
quickest path is a light data-layer extension: `rawToTransaction` adds a
`counterparty: { node_id, title, type_icon? } | null` field populated
via a sibling-leg query in `getRecentByPc` and the ledger query. Schema
stays unchanged.

---

## Slice B — stash page as tabs over ledger

**Rationale:** stash page's "last 10" list is a second-class copy of the
ledger UI. Users can't filter/search stash rows the same way they can on
`/accounting`. Duplicate UX. Move stash-specific history inside a tab
that literally is `<LedgerList>` pinned to the stash actor.

### Target structure

```
┌──────────────────────────────────────────────┐
│ 💰 Общак                    ← Бухгалтерия   │
│ Петля 3                                       │
├──────────────────────────────────────────────┤
│ BALANCE HERO (no embedded recent list)       │
│   234.00 gp · 0c·3s·234g·0p                  │
│   [+ Транзакция]                              │
├──────────────────────────────────────────────┤
│ [ Предметы · 5 ]  [ Лента транзакций ]       │
├──────────────────────────────────────────────┤
│                                                │
│ tab content                                   │
│                                                │
└──────────────────────────────────────────────┘
```

- Tab 1 "Предметы" — existing `<InventoryGrid>`, unchanged
- Tab 2 "Лента транзакций" — embed `<LedgerList fixedActorNodeId={stash.nodeId}>`

### What changes

1. Split `<BalanceHero>` out of `<WalletBlock>`:
   - `<BalanceHero>` = hero card only (heading + balance + "+ Транзакция")
   - `<WalletBlock>` keeps its current shape (hero + recent list) for PC pages
2. `<LedgerList>` gets an optional `fixedActorNodeId?: string`. When set,
   hide the actor-dropdown filter but keep everything else.
3. New `<StashPageTabs>` client wrapper holds the two-tab state.
4. Stash page composes: `<Header>` → `<BalanceHero>` → `<StashPageTabs>`.
   Drop the standalone items `<section>` (now inside the tab).

### Files that change

- **new** `components/balance-hero.tsx`
- **new** `components/stash-page-tabs.tsx` (client)
- `components/ledger-list.tsx` — add `fixedActorNodeId` prop, hide actor
  filter when set
- `components/wallet-block.tsx` — keep as-is OR (if consolidating)
  compose `<BalanceHero>` + the recent-list part
- `app/c/[slug]/accounting/stash/page.tsx` — rewire to hero + tabs

### Open questions (Slice B)

- Confirm `<LedgerList>`'s current API and filter machinery — last-known
  from spec-010 but may have drifted. Read the file before designing
  `fixedActorNodeId`.
- Keep `<WalletBlock>` unified (PC keeps recent list inline) or also
  tab-ify PC pages? Leaning: leave PC as-is for this pass (Slice C).

---

## Slice C — optional, apply tabs to PC pages

Same `<BalanceHero>` + `<StashPageTabs>` pattern for
`/c/[slug]/catalog/[id]` when type='character'. Tabs: `Недавние` / `Лента`.
Pure consistency win; no urgency.

---

## Recommended phasing

1. **Slice A first.** Universal visual improvement, touches 3 files,
   no structural refactor. Ship, collect feedback.
2. **Slice B second.** Row layout already looks good, so when tabs land
   the ledger-inside-stash view inherits the nice rows for free.
3. **Slice C later** if/when a PC accumulates lots of transactions.

---

## Estimate

- Slice A: ~1 chat session. Main work is careful design of
  `<TransactionRow>` + verifying counterparty data flow.
- Slice B: ~1 chat session. Mostly wiring; structural changes limited
  to extracting `<BalanceHero>` and adding one prop to `<LedgerList>`.
- Slice C: half a session if we take it.
