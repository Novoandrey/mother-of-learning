-- ============================================================================
-- Spec-013 T029: Encounter mirror trigger smoke test
-- ============================================================================
--
-- ЦЕЛЬ
-- ----
-- Проверить, что три триггера из миграции 039 работают корректно:
--   1. INSERT encounter → mirror-нода создаётся, encounter.node_id
--      указывает на неё, mirror.title === encounter.title
--   2. UPDATE encounter.title → mirror.title синхронизируется
--   3. UPDATE других полей encounter (status, current_round) → mirror.title
--      НЕ меняется (триггер именно `AFTER UPDATE OF title`)
--   4. DELETE encounter → mirror-нода удаляется
--   5. Прямой DELETE на mirror-ноде → ON DELETE RESTRICT блокирует
--
-- DEVIATION FROM tasks.md T029: tasks.md просит .ts. Пишем SQL по тем
-- же причинам, что и T028 (см. check-rls-013.sql header).
--
-- КАК ЗАПУСКАТЬ
-- -------------
-- Supabase Dashboard → SQL Editor → вставить файл целиком → Run.
-- Output смотри в `NOTICE`. Должно быть:
--   ✓ Setup OK
--   PASS TRG-1..5
--   ✓ All PASS (5 tests)
--
-- БЕЗОПАСНОСТЬ
-- ------------
-- BEGIN ... ROLLBACK. Тестовые данные удаляются автоматически.
--
-- ============================================================================

begin;

do $$
declare
  v_campaign_id  uuid;
  v_encounter_id uuid;
  v_mirror_id    uuid;
  v_node_count   int;
  v_title        text;
  v_pass_count   int := 0;
  v_fail_count   int := 0;
begin
  -- ── Setup: fresh campaign ──
  insert into campaigns (name, slug)
  values ('trg-013-smoke',
          'trg-013-smoke-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_campaign_id;

  raise notice '✓ Setup OK (campaign=%)', v_campaign_id;

  -- ── TRG-1: INSERT encounter → mirror created, node_id set ──
  insert into encounters (campaign_id, title)
  values (v_campaign_id, 'TRG-test-original')
  returning id, node_id into v_encounter_id, v_mirror_id;

  if v_mirror_id is null then
    raise notice 'FAIL TRG-1: encounter.node_id is null after insert';
    v_fail_count := v_fail_count + 1;
  else
    select title into v_title from nodes where id = v_mirror_id;
    if v_title = 'TRG-test-original' then
      raise notice 'PASS TRG-1: mirror created (id=%, title matches)', v_mirror_id;
      v_pass_count := v_pass_count + 1;
    else
      raise notice 'FAIL TRG-1: mirror title is %, expected TRG-test-original', v_title;
      v_fail_count := v_fail_count + 1;
    end if;
  end if;

  -- ── TRG-2: UPDATE encounter.title → mirror.title syncs ──
  update encounters set title = 'TRG-test-renamed' where id = v_encounter_id;

  select title into v_title from nodes where id = v_mirror_id;
  if v_title = 'TRG-test-renamed' then
    raise notice 'PASS TRG-2: mirror title synced after rename';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL TRG-2: mirror title is %, expected TRG-test-renamed', v_title;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── TRG-3: UPDATE encounter.status → mirror.title unchanged ──
  -- (and current_round, to be thorough)
  update encounters
     set status = 'completed', current_round = 5
   where id = v_encounter_id;

  select title into v_title from nodes where id = v_mirror_id;
  if v_title = 'TRG-test-renamed' then
    raise notice 'PASS TRG-3: mirror title unchanged after status/round update';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL TRG-3: mirror title is %, expected TRG-test-renamed (unchanged)', v_title;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── TRG-4: prepare TRG-5 first by trying to delete mirror directly ──
  -- We expect this to fail with FK RESTRICT.
  begin
    delete from nodes where id = v_mirror_id;
    raise notice 'FAIL TRG-5: direct DELETE on mirror succeeded (expected FK RESTRICT)';
    v_fail_count := v_fail_count + 1;
  exception when foreign_key_violation then
    raise notice 'PASS TRG-5: direct DELETE on mirror blocked by FK RESTRICT';
    v_pass_count := v_pass_count + 1;
  end;

  -- ── TRG-4: DELETE encounter → mirror is gone ──
  delete from encounters where id = v_encounter_id;

  select count(*) into v_node_count from nodes where id = v_mirror_id;
  if v_node_count = 0 then
    raise notice 'PASS TRG-4: mirror deleted after encounter delete';
    v_pass_count := v_pass_count + 1;
  else
    raise notice 'FAIL TRG-4: mirror still exists (count=%) after encounter delete', v_node_count;
    v_fail_count := v_fail_count + 1;
  end if;

  -- ── Summary ──
  if v_fail_count = 0 then
    raise notice '✓ All PASS (% tests)', v_pass_count;
  else
    raise notice '✗ FAILED (% pass, % fail)', v_pass_count, v_fail_count;
  end if;
end $$;

rollback;
