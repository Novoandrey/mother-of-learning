-- Migration 117: Realtime broadcast for transactions (spec-044, PL-3 / FR-009).
--
-- Makes every new transaction broadcast to a per-campaign private channel so
-- open Mini App viewers (wallet / feed / общак / balances) update live (E7).
-- Transactions are append-only, so broadcasting inserts is conflict-free.
--
-- Two pieces:
--   (1) AFTER INSERT trigger on `transactions` → `realtime.send(...)` into the
--       topic `campaign:<campaign_id>` (private). We send a compact payload
--       (ids + kind + status), not the coin columns — the client uses
--       `actor_pc_id` to know which wallet/feed to refresh and re-reads under
--       RLS. `realtime.send` captures its own errors, so a misconfigured
--       Realtime never breaks a transaction insert.
--   (2) RLS on `realtime.messages` so only campaign *members* may join
--       `campaign:<id>` — mirrors the `tx_select` policy (`is_member`). This is
--       the channel authorization (checked once on subscribe, per Supabase
--       Realtime Authorization).
--
-- ⚠️ HARD DEPENDENCY — apply order:
--   This migration references the `realtime` schema (`realtime.send`,
--   `realtime.messages`, `realtime.topic`). Those objects exist only once the
--   self-hosted **Realtime service is re-enabled (task T020 / DEBT-011)**.
--   Apply 117 **after** T020, on staging first (T019/T029), then prod.
--   Realtime broadcast-from-DB also runs a replication slot against
--   `realtime.messages` — add WAL slot-lag monitoring to the backup cron
--   (T021), the slot can grow and fill the CPX32 disk.
--
-- Idempotent: create-or-replace function, drop-if-exists trigger/policy.
--
-- Rollback (manual):
--   drop trigger if exists trg_broadcast_transaction_insert on public.transactions;
--   drop function if exists public.broadcast_transaction_insert();
--   drop policy if exists tx_campaign_members_can_read_broadcast on realtime.messages;

begin;

-- ─────────────────── 1. Trigger function + trigger ───────────────────
-- Not SECURITY DEFINER: transaction inserts go through the service-role
-- admin client (server actions), which can write `realtime.messages`; and
-- `realtime.send` swallows permission errors anyway. Keeping it INVOKER
-- avoids a security-definer function in the exposed `public` schema.
-- `search_path = ''` + fully-qualified names for hygiene.

create or replace function public.broadcast_transaction_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', NEW.id,
      'campaign_id', NEW.campaign_id,
      'actor_pc_id', NEW.actor_pc_id,
      'kind', NEW.kind,
      'status', NEW.status,
      'transfer_group_id', NEW.transfer_group_id
    ),
    'tx_insert',                                   -- event name
    'campaign:' || NEW.campaign_id::text,          -- topic
    true                                           -- private channel
  );
  return NEW;
end;
$$;

drop trigger if exists trg_broadcast_transaction_insert on public.transactions;
create trigger trg_broadcast_transaction_insert
  after insert on public.transactions
  for each row execute function public.broadcast_transaction_insert();

-- ─────────────────── 2. Channel authorization (RLS) ───────────────────
-- A member of campaign X may join `campaign:X`. The `like` guard keeps the
-- uuid cast from firing on non-campaign topics (and denies when topic is
-- null). `is_member` is the same helper `tx_select` uses, so realtime read
-- access matches ledger read access (E4).

alter table realtime.messages enable row level security;

drop policy if exists tx_campaign_members_can_read_broadcast on realtime.messages;
create policy tx_campaign_members_can_read_broadcast
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() like 'campaign:%'
    and public.is_member( (split_part(realtime.topic(), ':', 2))::uuid )
  );

commit;

-- ─────────────────── Verify (unambiguous ✅/❌) ───────────────────
select case
  when (select count(*) from pg_trigger
          where tgname = 'trg_broadcast_transaction_insert') = 1
   and (select count(*) from pg_policies
          where schemaname = 'realtime' and tablename = 'messages'
            and policyname = 'tx_campaign_members_can_read_broadcast') = 1
  then '✅ 117 ok — transactions broadcast trigger + realtime.messages RLS installed'
  else '❌ 117 FAILED — trigger or RLS policy missing'
end as result;
