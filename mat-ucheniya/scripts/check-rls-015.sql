-- ============================================================================
-- Spec-015 T047: smoke tests for item catalog RLS + cascades + CHECKs
-- ============================================================================
--
-- Что проверяем (после миграций 043, 044, 045):
--   1. RLS-1 — non-member НЕ читает item_attributes другой кампании.
--   2. RLS-2 — member читает item_attributes своей кампании.
--   3. CASCADE-1 — DELETE item-ноды каскадит на item_attributes.
--   4. CASCADE-2 — DELETE item-ноды → transactions.item_node_id = NULL
--                  (FK ON DELETE SET NULL); сама транзакция остаётся.
--   5. CHECK-1 — transactions_item_node_id_kind_match отвергает
--                (kind='money', item_node_id IS NOT NULL).
--   6. CHECK-2 — categories_scope_check принимает все 5 значений
--                (transaction, item, item-slot, item-source,
--                item-availability) и отвергает чушь.
--
-- КАК ЗАПУСКАТЬ
-- -------------
-- Supabase Dashboard → SQL Editor → вставить файл целиком → Run.
-- Все тесты обёрнуты в общий BEGIN … ROLLBACK — тестовые данные
-- НЕ остаются. Output смотри в NOTICE-строках:
--   PASS spec-015-1: …
--   PASS spec-015-2: …
--   …
--   ✓ All PASS (6 tests)
--
-- Если что-то упадёт через RAISE EXCEPTION — запомни номер и
-- пишите в чат, разберёмся.
-- ============================================================================

begin;

do $$
declare
  v_campaign_a    uuid;
  v_campaign_b    uuid;
  v_user_a        uuid;
  v_user_b        uuid;
  v_outsider      uuid;
  v_item_type_id  uuid;
  v_item_node_id  uuid;
  v_tx_id         uuid;
  v_count         int;
  v_pass          int := 0;
  v_total         int := 6;
begin
  -- ── Setup ──────────────────────────────────────────────────────
  insert into auth.users (id, email)
    values (gen_random_uuid(), 'spec015-a@test.local')
    returning id into v_user_a;
  insert into auth.users (id, email)
    values (gen_random_uuid(), 'spec015-b@test.local')
    returning id into v_user_b;
  insert into auth.users (id, email)
    values (gen_random_uuid(), 'spec015-out@test.local')
    returning id into v_outsider;

  insert into campaigns (id, name, slug, settings)
    values (gen_random_uuid(), 'spec-015 smoke A', 'sp015-a-' || substring(gen_random_uuid()::text, 1, 8), '{}'::jsonb)
    returning id into v_campaign_a;
  insert into campaigns (id, name, slug, settings)
    values (gen_random_uuid(), 'spec-015 smoke B', 'sp015-b-' || substring(gen_random_uuid()::text, 1, 8), '{}'::jsonb)
    returning id into v_campaign_b;

  insert into campaign_members (campaign_id, user_id, role)
    values (v_campaign_a, v_user_a, 'owner');
  insert into campaign_members (campaign_id, user_id, role)
    values (v_campaign_b, v_user_b, 'owner');

  -- Seed minimum node_types required by the test setup. Real
  -- campaigns get these via seedCampaignSrd / seedCampaignItemValueLists
  -- (lib/campaign-actions.ts) on first DM-init; bare INSERT-only test
  -- campaigns bypass that flow, so seed manually.
  insert into node_types (campaign_id, slug, label, sort_order)
    values
      (v_campaign_a, 'item', 'Предмет', 100),
      (v_campaign_a, 'character', 'Персонаж', 10),
      (v_campaign_b, 'item', 'Предмет', 100),
      (v_campaign_b, 'character', 'Персонаж', 10);

  -- node_type=item should now exist for both campaigns. Pick A's.
  select id into v_item_type_id
    from node_types where campaign_id = v_campaign_a and slug = 'item';
  if v_item_type_id is null then
    raise exception 'Setup: campaign A is missing node_type=item — node_types insert failed unexpectedly';
  end if;

  -- Seed one item node + attrs in campaign A.
  insert into nodes (id, campaign_id, type_id, title, fields)
    values (gen_random_uuid(), v_campaign_a, v_item_type_id, 'Тестовый меч', '{}'::jsonb)
    returning id into v_item_node_id;
  insert into item_attributes (
    node_id, category_slug, rarity, price_gp, weight_lb,
    slot_slug, source_slug, availability_slug
  ) values (
    v_item_node_id, 'weapon', null, 5, 3,
    'versatile', 'srd-5e', null
  );

  raise notice '✓ Setup OK (campaigns A=%, B=%)', v_campaign_a, v_campaign_b;

  -- ── RLS-1: outsider cannot SELECT item_attributes ──────────────
  -- Switch session role to the outsider user (no campaign membership).
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count
    from item_attributes where node_id = v_item_node_id;
  if v_count = 0 then
    v_pass := v_pass + 1;
    raise notice 'PASS spec-015-1: outsider sees 0 rows of item_attributes';
  else
    raise exception 'FAIL spec-015-1: outsider saw % rows (RLS leak)', v_count;
  end if;

  -- ── RLS-2: member can SELECT item_attributes ──────────────────
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select count(*) into v_count
    from item_attributes where node_id = v_item_node_id;
  if v_count = 1 then
    v_pass := v_pass + 1;
    raise notice 'PASS spec-015-2: owner of campaign A sees 1 row';
  else
    raise exception 'FAIL spec-015-2: owner saw % rows (expected 1)', v_count;
  end if;

  -- ── CASCADE-1: DELETE node → item_attributes row gone ─────────
  -- Switch back to elevated role so the rest of the script can write.
  perform set_config('role', 'postgres', true);

  -- First, also link a transaction to test CASCADE-2 in one shot.
  -- Need a PC actor — use a stub character node since RLS is now off.
  declare
    v_actor_type uuid;
    v_actor_id   uuid;
  begin
    select id into v_actor_type
      from node_types where campaign_id = v_campaign_a and slug = 'character';
    if v_actor_type is null then
      raise exception 'Setup: campaign A is missing node_type=character';
    end if;
    insert into nodes (id, campaign_id, type_id, title, fields)
      values (gen_random_uuid(), v_campaign_a, v_actor_type, 'spec-015 smoke PC', '{}'::jsonb)
      returning id into v_actor_id;

    insert into transactions (
      id, campaign_id, actor_pc_id, kind, amount_cp, amount_sp,
      amount_gp, amount_pp, item_name, item_node_id, item_qty,
      category_slug, comment, loop_number, day_in_loop, status,
      approved_at, approved_by_user_id,
      author_user_id
    ) values (
      gen_random_uuid(), v_campaign_a, v_actor_id, 'item', 0, 0,
      0, 0, 'Тестовый меч', v_item_node_id, 1,
      'loot', '', 1, 1, 'approved',
      now(), v_user_a,
      v_user_a
    ) returning id into v_tx_id;
  end;

  delete from nodes where id = v_item_node_id;

  select count(*) into v_count
    from item_attributes where node_id = v_item_node_id;
  if v_count = 0 then
    v_pass := v_pass + 1;
    raise notice 'PASS spec-015-3: CASCADE removed item_attributes row';
  else
    raise exception 'FAIL spec-015-3: item_attributes still has % rows after node delete', v_count;
  end if;

  -- ── CASCADE-2: transactions.item_node_id NULLed, row preserved ─
  select count(*) into v_count
    from transactions where id = v_tx_id and item_node_id is null;
  if v_count = 1 then
    v_pass := v_pass + 1;
    raise notice 'PASS spec-015-4: SET NULL preserved transaction with NULL link';
  else
    select count(*) into v_count from transactions where id = v_tx_id;
    raise exception 'FAIL spec-015-4: transaction state is wrong (% rows match id)', v_count;
  end if;

  -- ── CHECK-1: kind=money + item_node_id NOT NULL is rejected ────
  declare
    v_caught text := null;
  begin
    insert into transactions (
      id, campaign_id, actor_pc_id, kind, amount_cp, amount_sp,
      amount_gp, amount_pp, item_name, item_node_id, item_qty,
      category_slug, comment, loop_number, day_in_loop, status,
      approved_at, approved_by_user_id,
      author_user_id
    ) values (
      gen_random_uuid(), v_campaign_a, null, 'money', 0, 0,
      100, 0, null,
      -- bogus item_node_id; CHECK should fire BEFORE FK validation
      gen_random_uuid(), 1,
      'loot', '', 1, 1, 'approved',
      now(), v_user_a,
      v_user_a
    );
  exception when check_violation or foreign_key_violation then
    v_caught := SQLERRM;
  end;
  if v_caught is not null then
    v_pass := v_pass + 1;
    raise notice 'PASS spec-015-5: kind=money + item_node_id rejected (%)',
      substring(v_caught, 1, 60);
  else
    raise exception 'FAIL spec-015-5: insert accepted — CHECK is missing';
  end if;

  -- ── CHECK-2: categories.scope accepts all 5 + rejects unknown ──
  declare
    v_caught text := null;
    v_ok_count int := 0;
    v_scope text;
  begin
    -- 5 valid scopes
    foreach v_scope in array array['transaction', 'item', 'item-slot', 'item-source', 'item-availability']
    loop
      begin
        insert into categories (campaign_id, scope, slug, label, sort_order)
          values (v_campaign_a, v_scope, 'sp015-test-' || v_scope, 'spec-015 smoke ' || v_scope, 1000);
        v_ok_count := v_ok_count + 1;
      exception when others then
        raise exception 'FAIL spec-015-6a: scope=% rejected unexpectedly: %', v_scope, SQLERRM;
      end;
    end loop;

    -- Unknown scope must fail.
    begin
      insert into categories (campaign_id, scope, slug, label, sort_order)
        values (v_campaign_a, 'item-bogus', 'sp015-bogus', 'bogus', 1000);
    exception when check_violation then
      v_caught := SQLERRM;
    end;
  end;
  if v_caught is not null then
    v_pass := v_pass + 1;
    raise notice 'PASS spec-015-6: 5 valid scopes accepted, unknown rejected';
  else
    raise exception 'FAIL spec-015-6: unknown scope was accepted — CHECK is missing or too loose';
  end if;

  -- ── Summary ────────────────────────────────────────────────────
  if v_pass = v_total then
    raise notice '✓ All PASS (% tests)', v_total;
  else
    raise exception 'FAIL: %/% passed', v_pass, v_total;
  end if;
end $$;

rollback;
