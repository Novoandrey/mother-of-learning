-- 138: cache auth.uid() once per statement in RLS policies.
--
-- `(select auth.uid())` is semantically identical to `auth.uid()` for a
-- statement, but lets PostgreSQL evaluate the session identity once instead
-- of once per candidate row.  The policy roles and authorization predicates
-- remain unchanged.

begin;

alter policy aps_self on public.accounting_player_state
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy campaign_maps_select on public.campaign_maps
  using (
    exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = campaign_maps.campaign_id
        and cm.user_id = (select auth.uid())
    )
  );

alter policy character_portraits_select on public.character_portraits
  using (
    exists (
      select 1
      from public.nodes n
      join public.campaign_members cm on cm.campaign_id = n.campaign_id
      where n.id = character_portraits.character_node_id
        and cm.user_id = (select auth.uid())
    )
  );

alter policy contribution_participants_mutate on public.contribution_participants
  using (
    exists (
      select 1
      from public.contribution_pools p
      where p.id = contribution_participants.pool_id
        and (p.created_by = (select auth.uid()) or public.is_dm_or_owner(p.campaign_id))
    )
  )
  with check (
    exists (
      select 1
      from public.contribution_pools p
      where p.id = contribution_participants.pool_id
        and (p.created_by = (select auth.uid()) or public.is_dm_or_owner(p.campaign_id))
    )
  );

alter policy contribution_pools_insert on public.contribution_pools
  with check (
    public.is_member(campaign_id)
    and created_by = (select auth.uid())
  );

alter policy contribution_pools_update on public.contribution_pools
  using (
    created_by = (select auth.uid())
    or public.is_dm_or_owner(campaign_id)
  )
  with check (
    created_by = (select auth.uid())
    or public.is_dm_or_owner(campaign_id)
  );

alter policy map_tokens_select on public.map_tokens
  using (
    exists (
      select 1
      from public.campaign_maps m
      join public.campaign_members cm on cm.campaign_id = m.campaign_id
      where m.id = map_tokens.map_id
        and cm.user_id = (select auth.uid())
    )
  );

alter policy tx_modify on public.transactions
  using (
    public.is_dm_or_owner(campaign_id)
    or author_user_id = (select auth.uid())
  )
  with check (
    public.is_dm_or_owner(campaign_id)
    or author_user_id = (select auth.uid())
  );

alter policy user_profiles_select on public.user_profiles
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.campaign_members mine
      join public.campaign_members theirs on theirs.campaign_id = mine.campaign_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = user_profiles.user_id
    )
  );

alter policy user_profiles_update_self on public.user_profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
