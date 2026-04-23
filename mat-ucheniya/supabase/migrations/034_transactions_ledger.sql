-- Миграция 034: Transactions ledger (spec-010).
--
-- Создаёт две новые таблицы для бухгалтерии:
--   * categories — справочник категорий (scope='transaction' сейчас,
--                  scope='item' добавит spec-015 без schema change).
--   * transactions — денежные операции, предметы и переводы.
--
-- Модель:
--   * День в петле — первичный temporal anchor; сессия опциональна.
--   * Денойминации хранятся как 4 раздельные int-колонки (cp/sp/gp/pp).
--     CHECK-констрейнты следят за согласованностью kind ↔ amounts.
--   * Transfer — две строки с общим transfer_group_id.
--
-- Для mat-ucheniya сидим 6 дефолтных категорий здесь же.
-- Новые кампании получат те же сиды через seedCampaignCategories
-- из initializeCampaignFromTemplate (см. lib/seeds/categories.ts).
--
-- ⚠️ Идемпотентна и неразрушительна: только CREATE TABLE / CREATE INDEX
-- / CREATE POLICY + INSERT ... ON CONFLICT DO NOTHING.
-- Rollback: drop table transactions; drop table categories;

begin;

-- ─────────────────────────── categories ───────────────────────────

create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  scope         text not null default 'transaction'
                 check (scope in ('transaction','item')),
  slug          text not null,
  label         text not null,
  sort_order    int  not null default 0,
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (campaign_id, scope, slug)
);

create index if not exists idx_categories_campaign_scope
  on categories (campaign_id, scope)
  where is_deleted = false;

alter table categories enable row level security;

drop policy if exists categories_select on categories;
create policy categories_select on categories
  for select to authenticated
  using (is_member(campaign_id));

-- Writes happen via admin client in server actions. Policy declared
-- as a safety net in case a future route forgets and uses the user
-- client directly.
drop policy if exists categories_modify on categories;
create policy categories_modify on categories
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- ─────────────────────────── transactions ───────────────────────────

create table if not exists transactions (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,

  -- actor & kind
  actor_pc_id        uuid references nodes(id) on delete set null,
  kind               text not null check (kind in ('money','item','transfer')),

  -- money amounts (signed; 0 for kind='item')
  amount_cp          int  not null default 0,
  amount_sp          int  not null default 0,
  amount_gp          int  not null default 0,
  amount_pp          int  not null default 0,

  -- item metadata
  item_name          text,

  -- classification + notes
  category_slug      text not null,
  comment            text not null default '',

  -- temporal anchor (day is primary; session is optional metadata)
  loop_number        int  not null,
  day_in_loop        int  not null,
  session_id         uuid references nodes(id) on delete set null,

  -- transfer linkage (both legs share this id)
  transfer_group_id  uuid,

  -- approval (for spec-014 future-proofing)
  status             text not null default 'approved'
                     check (status in ('pending','approved','rejected')),

  -- authorship & timestamps
  author_user_id     uuid not null references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- kind ↔ amount consistency
  constraint transactions_item_has_no_coins
    check (kind <> 'item'
           or (amount_cp = 0 and amount_sp = 0 and amount_gp = 0 and amount_pp = 0)),

  constraint transactions_item_has_name
    check (kind <> 'item' or (item_name is not null and length(item_name) > 0)),

  constraint transactions_money_no_item_name
    check (kind = 'item' or item_name is null),

  -- money/transfer must have at least one non-zero amount
  constraint transactions_money_nonzero
    check (kind = 'item'
           or amount_cp <> 0 or amount_sp <> 0 or amount_gp <> 0 or amount_pp <> 0),

  -- transfer has a group id
  constraint transactions_transfer_has_group
    check (kind <> 'transfer' or transfer_group_id is not null),

  -- day in valid range (loop length check happens at the app layer)
  constraint transactions_day_range
    check (day_in_loop between 1 and 365)
);

-- Primary ledger query: campaign feed, newest first
create index if not exists idx_tx_campaign_created
  on transactions (campaign_id, created_at desc);

-- Wallet aggregate: balance per (pc, loop)
create index if not exists idx_tx_pc_loop
  on transactions (actor_pc_id, loop_number, status)
  where actor_pc_id is not null;

-- Session drill-down ("all transactions on this session")
create index if not exists idx_tx_session
  on transactions (session_id)
  where session_id is not null;

-- Transfer pair lookup ("fetch the other leg")
create index if not exists idx_tx_transfer_group
  on transactions (transfer_group_id)
  where transfer_group_id is not null;

-- Filter by category in the ledger
create index if not exists idx_tx_campaign_category
  on transactions (campaign_id, category_slug);

-- ─────────────────────────── updated_at trigger ───────────────────────────

create or replace function touch_transactions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_transactions_updated_at on transactions;
create trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function touch_transactions_updated_at();

-- ─────────────────────────── RLS ───────────────────────────

alter table transactions enable row level security;

drop policy if exists tx_select on transactions;
create policy tx_select on transactions
  for select to authenticated
  using (is_member(campaign_id));

-- Same reasoning as categories_modify: writes go through admin client
-- in server actions. Finer-grained checks (player-owns-PC, transfer
-- counter-leg, etc.) live in the app layer.
drop policy if exists tx_modify on transactions;
create policy tx_modify on transactions
  for all to authenticated
  using (
    is_dm_or_owner(campaign_id)
    or author_user_id = auth.uid()
  )
  with check (
    is_dm_or_owner(campaign_id)
    or author_user_id = auth.uid()
  );

-- ─────────────────────────── Seed defaults для mat-ucheniya ───────────────────────────
--
-- Новые кампании получат те же категории через
-- seedCampaignCategories → initializeCampaignFromTemplate.
-- Здесь — догоняем уже существующую кампанию.

insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'transaction', v.slug, v.label, v.sort_order
  from campaigns c
 cross join (values
   ('income',   'Доход',   10),
   ('expense',  'Расход',  20),
   ('credit',   'Кредит',  30),
   ('loot',     'Добыча',  40),
   ('transfer', 'Перевод', 50),
   ('other',    'Прочее',  100)
 ) as v(slug, label, sort_order)
 where c.slug = 'mat-ucheniya'
on conflict (campaign_id, scope, slug) do nothing;

commit;

-- ─────────────────────────── Verify (manual) ───────────────────────────
--   select slug, label, sort_order
--     from categories
--    where scope = 'transaction'
--      and campaign_id = (select id from campaigns where slug = 'mat-ucheniya')
--    order by sort_order;
--
-- Ожидается: 6 строк, от income/10 до other/100.
