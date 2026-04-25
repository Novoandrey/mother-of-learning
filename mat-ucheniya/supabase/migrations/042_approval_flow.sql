-- Миграция 042: Approval flow infrastructure (spec-014).
--
-- Делает три вещи:
--   (1) Добавляет 6 колонок на `transactions` для batch-группировки
--       плеер-сабмишенов и audit'а approve/reject действий:
--         * batch_id (nullable uuid) — общий id для всех рядов одной
--           multi-row сабмишена; NULL для DM-авто-апрувленных и autogen.
--         * approved_by_user_id, approved_at — кто и когда одобрил.
--         * rejected_by_user_id, rejected_at, rejection_comment — кто
--           отклонил, когда, и опциональный комментарий.
--   (2) Бэкфилит существующие approved-ряды (по правилу FR-040 они
--       все остаются approved): approved_at = created_at, по
--       approved_by_user_id ставим author_user_id (best-effort —
--       автор и единственный известный actor для исторических рядов).
--       После бэкфила добавляется CHECK-констрейнт на согласованность
--       (status ↔ audit-поля), запрещающий смешанные / противоречивые
--       состояния.
--   (3) Создаёт 3 partial-индекса для горячих read-путей очереди
--       (campaign+pending feed, batch lookup, author+pending feed).
--   (4) Создаёт `accounting_player_state` — крошечная таблица
--       (user_id, campaign_id, last_seen_acted_at) для FR-027 toast'а
--       («DM что-то сделал с твоими заявками с момента last seen»).
--       RLS — self-only, юзер видит/пишет только свою строку.
--
-- ⚠️ Полностью additive и идемпотентна: ADD COLUMN IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING.
-- Существующие данные не разрушаются — backfill только заполняет
-- пустые audit-колонки.
--
-- Rollback (manual):
--   alter table transactions
--     drop constraint if exists transactions_approval_consistency,
--     drop column if exists batch_id,
--     drop column if exists approved_by_user_id,
--     drop column if exists approved_at,
--     drop column if exists rejected_by_user_id,
--     drop column if exists rejected_at,
--     drop column if exists rejection_comment;
--   drop index if exists idx_tx_pending;
--   drop index if exists idx_tx_batch;
--   drop index if exists idx_tx_author_pending;
--   drop table if exists accounting_player_state;

begin;

-- ─────────────────────────── 1. ADD COLUMNS ───────────────────────────

alter table transactions
  add column if not exists batch_id uuid,
  add column if not exists approved_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_comment text;

-- ─────────────────────────── 2. BACKFILL ───────────────────────────
-- Все существующие ряды status='approved' (FR-040). Для них:
--   * approved_at <- created_at  (исторический момент апрува)
--   * approved_by_user_id <- author_user_id  (best-effort signal;
--     может быть NULL если автор был удалён через ON DELETE SET NULL).
-- Идемпотентно: WHERE approved_at IS NULL — повторный запуск пропустит
-- уже бэкфилленные строки.

update transactions
   set approved_at = created_at,
       approved_by_user_id = author_user_id
 where status = 'approved'
   and approved_at is null;

-- ─────────────────────────── 3. CHECK CONSTRAINT ───────────────────────────
-- Согласованность status ↔ audit-полей. Применяется ПОСЛЕ backfill,
-- иначе ALTER упадёт на исторических рядах.
--
-- Лояльно к ON DELETE SET NULL: для approved/rejected требуем NOT NULL
-- только timestamp; user_id может быть NULL (если юзер удалён). Это
-- сохраняет историю и не ломает кампании где юзеры уходили.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'transactions_approval_consistency'
       and conrelid = 'public.transactions'::regclass
  ) then
    alter table transactions
      add constraint transactions_approval_consistency
        check (
          case status
            when 'approved' then
              approved_at is not null
              and rejected_at is null
              and rejected_by_user_id is null
              and rejection_comment is null
            when 'rejected' then
              rejected_at is not null
              and approved_at is null
              and approved_by_user_id is null
            when 'pending' then
              approved_at is null
              and approved_by_user_id is null
              and rejected_at is null
              and rejected_by_user_id is null
              and rejection_comment is null
          end
        );
  end if;
end$$;

-- ─────────────────────────── 4. INDEXES ───────────────────────────
-- Все три partial — pending составляет ничтожную долю общего числа
-- рядов, partial-индексы дёшевы и селективны.

-- Queue feed: «все pending в кампании, новые сверху».
create index if not exists idx_tx_pending
  on transactions (campaign_id, created_at desc)
  where status = 'pending';

-- Batch lookup: «все ряды этой пачки» — для approve/reject batch
-- и для display одной пачки.
create index if not exists idx_tx_batch
  on transactions (batch_id)
  where batch_id is not null;

-- Author's own pending: «мои pending в этой кампании», игрокская
-- сторона очереди.
create index if not exists idx_tx_author_pending
  on transactions (author_user_id, campaign_id, created_at desc)
  where status = 'pending';

-- ─────────────────────────── 5. accounting_player_state ───────────────────────────
-- FR-027: toast «DM одобрил X / отклонил Y» при следующем заходе на
-- /accounting. Храним per-(user, campaign) timestamp последнего
-- увиденного DM-действия. Self-only RLS.

create table if not exists accounting_player_state (
  user_id              uuid not null references auth.users(id) on delete cascade,
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  last_seen_acted_at   timestamptz not null default '1970-01-01'::timestamptz,
  primary key (user_id, campaign_id)
);

alter table accounting_player_state enable row level security;

drop policy if exists aps_self on accounting_player_state;
create policy aps_self on accounting_player_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;

-- ─────────────────────────── Verify (manual) ───────────────────────────
--   -- 1. Бэкфил прошёл:
--   select count(*) from transactions
--    where status='approved' and approved_at is null;
--   -- Ожидается: 0.
--
--   -- 2. Индексы созданы:
--   select indexname from pg_indexes
--    where tablename='transactions'
--      and indexname in ('idx_tx_pending','idx_tx_batch','idx_tx_author_pending');
--   -- Ожидается: 3 строки.
--
--   -- 3. CHECK работает (должно упасть):
--   begin;
--     update transactions set approved_at = null
--      where status = 'approved' limit 1;
--   rollback;
--   -- Ожидается: ERROR violating transactions_approval_consistency.
--
--   -- 4. accounting_player_state создана с RLS:
--   select tablename, rowsecurity from pg_tables
--    where tablename = 'accounting_player_state';
--   -- Ожидается: rowsecurity = true.
