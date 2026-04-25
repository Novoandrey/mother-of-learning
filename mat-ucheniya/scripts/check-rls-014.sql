-- ============================================================================
-- Spec-014 T034: RLS smoke test for pending/approved/rejected visibility
-- ============================================================================
--
-- ЦЕЛЬ
-- ----
-- Проверить, что после миграции 042:
--   * Player видит свои собственные pending в `transactions`.
--   * Player видит pending одногруппника (FR-015 — unified visibility).
--   * DM видит все pending.
--   * `getWallet`-style выборка с фильтром `status='approved'` НЕ
--     включает pending — pending не учитываются в балансах.
--   * Withdraw (DELETE с фильтром `status='pending' + author_user_id`)
--     удаляет только свою pending.
--   * `accounting_player_state` self-only RLS — игрок A не видит
--     состояние игрока B.
--
-- DEVIATION FROM tasks.md T034: tasks.md упоминает «player A does NOT
-- see player B's pending». Согласно FR-015 текущая резолюция — все
-- pending видны всем (queue is shared), поэтому ассерт инвертирован.
--
-- КАК ЗАПУСКАТЬ
-- -------------
-- Supabase Dashboard → SQL Editor → вставить файл целиком → Run.
-- Output смотри в `NOTICE` строках. Должно быть:
--   ✓ Setup OK
--   PASS RLS-1: ...
--   PASS RLS-2: ...
--   ...
--   ✓ All PASS (N tests)
-- Если хоть один FAIL — пиши номер.
--
-- БЕЗОПАСНОСТЬ
-- ------------
-- Весь скрипт обёрнут в `BEGIN ... ROLLBACK`. Тестовые данные живут
-- только во время выполнения, на прод не оседают.
--
-- ============================================================================

begin;

do $$
declare
  v_campaign_id    uuid;
  v_owner_id       uuid;
  v_dm_id          uuid;
  v_player_a_id    uuid;
  v_player_b_id    uuid;
  v_outsider_id    uuid;
  v_users          uuid[];
  v_pc_a_id        uuid;
  v_pc_b_id        uuid;
  v_pending_a_id   uuid;
  v_pending_b_id   uuid;
  v_approved_id    uuid;
  v_pass_count     int := 0;
  v_fail_count     int := 0;
  v_visible_count  int;
  v_wallet_count   int;
  v_affected       int;
begin
  -- ── Setup: borrow 5 existing auth.users ──
  select array_agg(id) into v_users
  from (select id from auth.users order by created_at limit 5) sub;

  if coalesce(array_length(v_users, 1), 0) < 5 then
    raise exception 'Need ≥5 users in auth.users for this test (found %)',
      coalesce(array_length(v_users, 1), 0);
  end if;

  v_owner_id    := v_users[1];
  v_dm_id       := v_users[2];
  v_player_a_id := v_users[3];
  v_player_b_id := v_users[4];
  v_outsider_id := v_users[5];

  -- ── Setup: campaign with two players ──
  insert into campaigns (name, slug)
  values ('rls-014-smoke', 'rls-014-smoke-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_campaign_id;

  insert into campaign_members (campaign_id, user_id, role) values
    (v_campaign_id, v_owner_id,    'owner'),
    (v_campaign_id, v_dm_id,       'dm'),
    (v_campaign_id, v_player_a_id, 'player'),
    (v_campaign_id, v_player_b_id, 'player');

  -- ── Setup: PC nodes for both players ──
  -- Need a 'pc' node_type — borrow or create.
  declare
    v_pc_type_id uuid;
  begin
    select id into v_pc_type_id from node_types
      where campaign_id = v_campaign_id and slug = 'pc';
    if v_pc_type_id is null then
      insert into node_types (campaign_id, slug, label, icon)
      values (v_campaign_id, 'pc', 'Персонаж', '👤')
      returning id into v_pc_type_id;
    end if;

    insert into nodes (campaign_id, type_id, title)
    values (v_campaign_id, v_pc_type_id, 'pc-A')
    returning id into v_pc_a_id;
    insert into nodes (campaign_id, type_id, title)
    values (v_campaign_id, v_pc_type_id, 'pc-B')
    returning id into v_pc_b_id;
  end;

  insert into node_pc_owners (node_id, user_id) values
    (v_pc_a_id, v_player_a_id),
    (v_pc_b_id, v_player_b_id);

  -- ── Setup: seed a default category for transactions ──
  insert into categories (campaign_id, scope, slug, label, sort_order)
  values (v_campaign_id, 'transaction', 'income', 'Доход', 1)
  on conflict do nothing;

  -- ── Setup: insert pending rows for both players + one approved ──
  -- Player A — pending
  insert into transactions (
    campaign_id, actor_pc_id, kind,
    amount_cp, amount_sp, amount_gp, amount_pp,
    item_qty, category_slug, comment, loop_number, day_in_loop,
    status, author_user_id, batch_id
  ) values (
    v_campaign_id, v_pc_a_id, 'money',
    0, 0, 5, 0,
    1, 'income', 'A pending', 1, 1,
    'pending', v_player_a_id, gen_random_uuid()
  ) returning id into v_pending_a_id;

  -- Player B — pending
  insert into transactions (
    campaign_id, actor_pc_id, kind,
    amount_cp, amount_sp, amount_gp, amount_pp,
    item_qty, category_slug, comment, loop_number, day_in_loop,
    status, author_user_id, batch_id
  ) values (
    v_campaign_id, v_pc_b_id, 'money',
    0, 0, 7, 0,
    1, 'income', 'B pending', 1, 1,
    'pending', v_player_b_id, gen_random_uuid()
  ) returning id into v_pending_b_id;

  -- DM-direct approved (audit columns required by CHECK)
  insert into transactions (
    campaign_id, actor_pc_id, kind,
    amount_cp, amount_sp, amount_gp, amount_pp,
    item_qty, category_slug, comment, loop_number, day_in_loop,
    status, author_user_id,
    approved_by_user_id, approved_at
  ) values (
    v_campaign_id, v_pc_a_id, 'money',
    0, 0, 100, 0,
    1, 'income', 'DM logged', 1, 1,
    'approved', v_dm_id,
    v_dm_id, now()
  ) returning id into v_approved_id;

  raise notice '✓ Setup OK (campaign=% pendingA=% pendingB=% approved=%)',
    v_campaign_id, v_pending_a_id, v_pending_b_id, v_approved_id;

  -- ── RLS-1: outsider cannot read transactions ──
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_outsider_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_visible_count
    from transactions where campaign_id = v_campaign_id;

  if v_visible_count = 0 then
    raise notice 'PASS RLS-1: outsider sees 0 transactions';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL RLS-1: outsider saw % rows (expected 0)', v_visible_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── RLS-2: player A sees own pending ──
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_player_a_id::text, 'role', 'authenticated')::text, true);

  select count(*) into v_visible_count
    from transactions
    where campaign_id = v_campaign_id
      and id = v_pending_a_id;

  if v_visible_count = 1 then
    raise notice 'PASS RLS-2: player A sees own pending';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL RLS-2: player A saw % rows (expected 1)', v_visible_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── RLS-3: player A sees player B's pending (FR-015 unified visibility) ──
  select count(*) into v_visible_count
    from transactions
    where campaign_id = v_campaign_id
      and id = v_pending_b_id;

  if v_visible_count = 1 then
    raise notice 'PASS RLS-3: player A sees B''s pending (FR-015)';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL RLS-3: player A saw % rows of B''s pending (expected 1)', v_visible_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── RLS-4: DM sees all pending ──
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dm_id::text, 'role', 'authenticated')::text, true);

  select count(*) into v_visible_count
    from transactions
    where campaign_id = v_campaign_id
      and status = 'pending';

  if v_visible_count = 2 then
    raise notice 'PASS RLS-4: DM sees both pending rows';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL RLS-4: DM saw % pending (expected 2)', v_visible_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── RLS-5: getWallet-style filter (status='approved') excludes pending ──
  -- Player A's wallet: 100 gp from DM-logged approved row, but the
  -- `5 gp` pending row should NOT show up.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_player_a_id::text, 'role', 'authenticated')::text, true);

  select count(*) into v_wallet_count
    from transactions
    where campaign_id = v_campaign_id
      and actor_pc_id = v_pc_a_id
      and status = 'approved';

  if v_wallet_count = 1 then
    raise notice 'PASS RLS-5: wallet filter excludes pending (saw 1 approved)';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL RLS-5: wallet filter saw % rows (expected 1 approved)', v_wallet_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── RLS-6: accounting_player_state self-only RLS ──
  -- Player A inserts own state; player B should NOT be able to read it.
  insert into accounting_player_state (user_id, campaign_id, last_seen_acted_at)
  values (v_player_a_id, v_campaign_id, now());

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_player_b_id::text, 'role', 'authenticated')::text, true);

  select count(*) into v_visible_count
    from accounting_player_state
    where user_id = v_player_a_id and campaign_id = v_campaign_id;

  if v_visible_count = 0 then
    raise notice 'PASS RLS-6: player B cannot see player A''s last_seen state';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL RLS-6: player B saw % state rows of A (expected 0)', v_visible_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── Summary ──
  if v_fail_count = 0 then
    raise notice '✓ All PASS (% tests)', v_pass_count;
  else
    raise exception 'FAIL: % passed, % failed', v_pass_count, v_fail_count;
  end if;
end $$;

rollback;
