-- ============================================================================
-- Spec-014 T035: CHECK constraint smoke test for transactions audit fields
-- ============================================================================
--
-- ЦЕЛЬ
-- ----
-- Проверить, что `transactions_approval_consistency` CHECK из миграции
-- 042 ловит некорректные комбинации status × audit-fields:
--   * approved без `approved_by_user_id` → REJECTS
--   * approved без `approved_at` → REJECTS
--   * rejected без `rejected_at` → REJECTS
--   * pending с непустыми audit-полями → REJECTS
--   * approved + rejected одновременно (оба набора заполнены) → REJECTS
-- А также:
--   * Корректный approved row → INSERT OK
--   * Корректный pending row → INSERT OK
--   * Корректный rejected row → INSERT OK
--
-- КАК ЗАПУСКАТЬ
-- -------------
-- Supabase Dashboard → SQL Editor → вставить файл целиком → Run.
-- Output смотри в `NOTICE` строках. Должно быть:
--   ✓ Setup OK
--   PASS C-1: ...
--   ...
--   ✓ All PASS (N tests)
--
-- БЕЗОПАСНОСТЬ
-- ------------
-- Весь скрипт обёрнут в `BEGIN ... ROLLBACK`.
--
-- ============================================================================

begin;

do $$
declare
  v_campaign_id  uuid;
  v_pc_id        uuid;
  v_user_id      uuid;
  v_pc_type_id   uuid;
  v_pass_count   int := 0;
  v_fail_count   int := 0;
  v_caught       boolean;
  v_test_id      uuid;
begin
  -- ── Setup: borrow one user ──
  select id into v_user_id from auth.users order by created_at limit 1;
  if v_user_id is null then
    raise exception 'Need ≥1 user in auth.users';
  end if;

  insert into campaigns (name, slug)
  values ('check-014-smoke', 'check-014-smoke-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_campaign_id;

  insert into campaign_members (campaign_id, user_id, role)
  values (v_campaign_id, v_user_id, 'owner');

  insert into node_types (campaign_id, slug, label, icon)
  values (v_campaign_id, 'pc', 'Персонаж', '👤')
  returning id into v_pc_type_id;

  insert into nodes (campaign_id, node_type_id, title)
  values (v_campaign_id, v_pc_type_id, 'pc-test')
  returning id into v_pc_id;

  insert into categories (campaign_id, scope, slug, label, sort_order)
  values (v_campaign_id, 'transaction', 'income', 'Доход', 1);

  raise notice '✓ Setup OK (campaign=%)', v_campaign_id;

  -- Helper-style assertion: try insert, catch CHECK violation.
  -- Each test wraps the insert in begin/exception.

  -- ── C-1: approved without approved_by_user_id → REJECTS ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      approved_at  -- approved_by_user_id missing
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-1', 1, 1,
      'approved', v_user_id,
      now()
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if v_caught then
    raise notice 'PASS C-1: approved without approved_by_user_id rejected';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-1: approved without approved_by_user_id was accepted';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-2: approved without approved_at → REJECTS ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      approved_by_user_id  -- approved_at missing
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-2', 1, 1,
      'approved', v_user_id,
      v_user_id
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if v_caught then
    raise notice 'PASS C-2: approved without approved_at rejected';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-2: approved without approved_at was accepted';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-3: rejected without rejected_at → REJECTS ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      rejected_by_user_id  -- rejected_at missing
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-3', 1, 1,
      'rejected', v_user_id,
      v_user_id
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if v_caught then
    raise notice 'PASS C-3: rejected without rejected_at rejected';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-3: rejected without rejected_at was accepted';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-4: pending with audit fields populated → REJECTS ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      approved_by_user_id, approved_at  -- forbidden in pending
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-4', 1, 1,
      'pending', v_user_id,
      v_user_id, now()
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if v_caught then
    raise notice 'PASS C-4: pending with audit fields rejected';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-4: pending with audit fields was accepted';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-5: approved + rejected sets both populated → REJECTS ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      approved_by_user_id, approved_at,
      rejected_by_user_id, rejected_at
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-5', 1, 1,
      'approved', v_user_id,
      v_user_id, now(),
      v_user_id, now()
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if v_caught then
    raise notice 'PASS C-5: dual-populated audit rejected';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-5: dual-populated audit was accepted';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-6: valid approved row → INSERT OK ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      approved_by_user_id, approved_at
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-6', 1, 1,
      'approved', v_user_id,
      v_user_id, now()
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise notice 'PASS C-6: valid approved row accepted';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-6: valid approved row rejected';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-7: valid pending row → INSERT OK ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id, batch_id
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-7', 1, 1,
      'pending', v_user_id, gen_random_uuid()
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise notice 'PASS C-7: valid pending row accepted';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-7: valid pending row rejected';
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── C-8: valid rejected row → INSERT OK ──
  v_caught := false;
  begin
    insert into transactions (
      campaign_id, actor_pc_id, kind,
      amount_cp, amount_sp, amount_gp, amount_pp,
      item_qty, category_slug, comment, loop_number, day_in_loop,
      status, author_user_id,
      rejected_by_user_id, rejected_at, rejection_comment
    ) values (
      v_campaign_id, v_pc_id, 'money',
      0, 0, 1, 0,
      1, 'income', 'C-8', 1, 1,
      'rejected', v_user_id,
      v_user_id, now(), 'не подтверждено'
    ) returning id into v_test_id;
  exception when check_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise notice 'PASS C-8: valid rejected row accepted';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL C-8: valid rejected row rejected';
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
