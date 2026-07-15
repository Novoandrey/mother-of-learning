-- 137: harden function execution privileges reported by Supabase Advisors.
--
-- All functions below either run only as triggers, are invoked through the
-- service-role client, or are required by authenticated RLS/page queries.
-- Keep the latter explicit and remove the public/anonymous RPC surface.

begin;

-- These trigger implementations are never valid RPC endpoints.  A trigger
-- continues to execute as its table owner after EXECUTE is revoked.
revoke all on function public.set_contribution_pool_updated_at()
  from public, anon, authenticated;
revoke all on function public.bump_contribution_pool_updated_at()
  from public, anon, authenticated;
revoke all on function public.create_encounter_mirror_node()
  from public, anon, authenticated;
revoke all on function public.delete_encounter_mirror_node()
  from public, anon, authenticated;
revoke all on function public.sync_encounter_title_to_mirror()
  from public, anon, authenticated;
revoke all on function public.mark_autogen_hand_touched()
  from public, anon, authenticated;
revoke all on function public.record_autogen_tombstone()
  from public, anon, authenticated;

-- This bulk reconciliation RPC is called exclusively by the server's
-- service-role client.  Preserve that path explicitly and close public RPC.
revoke all on function public.apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])
  to service_role;

-- These helpers are evaluated by RLS policies or the authenticated encounter
-- page.  Authenticated users retain only the required EXECUTE permission;
-- anonymous callers receive none.
revoke all on function public.is_member(uuid) from public, anon, authenticated;
revoke all on function public.is_dm_or_owner(uuid) from public, anon, authenticated;
revoke all on function public.is_owner(uuid) from public, anon, authenticated;
revoke all on function public.can_edit_node(uuid) from public, anon, authenticated;
revoke all on function public.condition_usage_counts(uuid) from public, anon, authenticated;

grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.is_dm_or_owner(uuid) to authenticated, service_role;
grant execute on function public.is_owner(uuid) to authenticated, service_role;
grant execute on function public.can_edit_node(uuid) to authenticated, service_role;
grant execute on function public.condition_usage_counts(uuid) to authenticated, service_role;

-- The two functions are trigger-only, but Advisors still require an explicit
-- stable search path.  This does not alter their bodies or stored data.
alter function public.set_contribution_pool_updated_at() set search_path = public;
alter function public.bump_contribution_pool_updated_at() set search_path = public;

commit;

-- Verification: public roles cannot invoke trigger/server-only functions;
-- authenticated RLS and page helpers remain available.
select
  not has_function_privilege('anon', 'public.apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])', 'execute')
    as anon_cannot_apply_loop_setup,
  has_function_privilege('service_role', 'public.apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])', 'execute')
    as service_role_can_apply_loop_setup,
  not has_function_privilege('anon', 'public.condition_usage_counts(uuid)', 'execute')
    as anon_cannot_read_condition_usage,
  has_function_privilege('authenticated', 'public.condition_usage_counts(uuid)', 'execute')
    as authenticated_can_read_condition_usage,
  not has_function_privilege('anon', 'public.is_member(uuid)', 'execute')
    as anon_cannot_call_membership_helper,
  has_function_privilege('authenticated', 'public.is_member(uuid)', 'execute')
    as authenticated_can_call_membership_helper,
  not has_function_privilege('anon', 'public.create_encounter_mirror_node()', 'execute')
    as anon_cannot_call_trigger_function,
  not has_function_privilege('anon', 'public.set_contribution_pool_updated_at()', 'execute')
    as anon_cannot_call_updated_at_trigger,
  exists (
    select 1
    from pg_proc p
    where p.oid = 'public.set_contribution_pool_updated_at()'::regprocedure
      and p.proconfig @> array['search_path=public']
  ) as updated_at_trigger_has_stable_search_path;
