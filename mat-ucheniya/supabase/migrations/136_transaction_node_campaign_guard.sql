-- 136: transaction node references must not cross campaign boundaries.
--
-- `transactions` references polymorphic `nodes(id)` for actors, sessions and
-- catalog items. A simple FK verifies only that a node exists; this trigger
-- also verifies it belongs to the transaction's campaign. Server actions
-- perform the same check for friendly errors, while this guard protects every
-- current and future write path.

begin;

create or replace function public.enforce_transaction_node_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_pc_id is not null and not exists (
    select 1 from public.nodes
    where id = new.actor_pc_id and campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'transactions.actor_pc_id must belong to transactions.campaign_id';
  end if;

  if new.session_id is not null and not exists (
    select 1 from public.nodes
    where id = new.session_id and campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'transactions.session_id must belong to transactions.campaign_id';
  end if;

  if new.item_node_id is not null and not exists (
    select 1 from public.nodes
    where id = new.item_node_id and campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'transactions.item_node_id must belong to transactions.campaign_id';
  end if;

  return new;
end;
$$;

-- It is only a trigger implementation, never a public RPC endpoint.
revoke all on function public.enforce_transaction_node_campaign() from public, anon, authenticated;

drop trigger if exists transactions_campaign_node_guard on public.transactions;
create trigger transactions_campaign_node_guard
  before insert or update of campaign_id, actor_pc_id, session_id, item_node_id
  on public.transactions
  for each row
  execute function public.enforce_transaction_node_campaign();

commit;

-- Verification: the trigger is installed and its implementation is not
-- executable through Supabase's public API roles.
select
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.transactions'::regclass
      and tgname = 'transactions_campaign_node_guard'
      and not tgisinternal
  ) as trigger_installed,
  not has_function_privilege('anon', 'public.enforce_transaction_node_campaign()', 'execute')
    as anon_cannot_execute,
  not has_function_privilege('authenticated', 'public.enforce_transaction_node_campaign()', 'execute')
    as authenticated_cannot_execute;
