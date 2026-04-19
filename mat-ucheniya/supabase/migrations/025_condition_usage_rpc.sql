-- 025_condition_usage_rpc.sql
-- RPC: condition_usage_counts(p_campaign_id)
-- Returns how many times each condition name has been applied to participants
-- across all encounters in the campaign. Used by the encounter page to sort
-- condition suggestions by real usage (hot conditions first, rarely-used at
-- the bottom).
--
-- Input:  campaign_id
-- Output: rows of (name text, count bigint), unordered
--
-- encounter_participants.conditions is jsonb array of {name, round, ...}.

create or replace function condition_usage_counts(p_campaign_id uuid)
returns table (name text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select elem->>'name' as name, count(*)::bigint as count
  from encounter_participants ep
  join encounters e on e.id = ep.encounter_id
  cross join lateral jsonb_array_elements(coalesce(ep.conditions, '[]'::jsonb)) as elem
  where e.campaign_id = p_campaign_id
    and elem ? 'name'
    and (elem->>'name') is not null
    and (elem->>'name') <> ''
  group by elem->>'name'
$$;

comment on function condition_usage_counts(uuid) is
  'Counts how many times each condition name appears across
   encounter_participants.conditions in a campaign. Used for suggestion
   ranking in the encounter tracker.';

-- Make this callable by regular authenticated users (owners, DMs, players).
-- It reads RLS-protected rows but as SECURITY DEFINER — safe because the
-- function only returns aggregate counts, not identifying data, and takes
-- the campaign_id as a scoped parameter.
grant execute on function condition_usage_counts(uuid) to authenticated;
grant execute on function condition_usage_counts(uuid) to anon;
