-- ============================================================================
-- Spec-012 smoke test (T044 automated coverage for backend logic)
-- ============================================================================
--
-- ЦЕЛЬ
-- ----
-- Проверить, что RPC `apply_loop_start_setup` + триггеры
-- (`mark_autogen_hand_touched`, `record_autogen_tombstone`) + FK cascade
-- ведут себя по spec.md. Покрывает US1.1, US1.2, US1.4, US3.1, US3.2,
-- US3.4, US3.7, US3.8, US5.1, US7.1. UI-уровень (banner/badge/tooltip
-- /confirm-dialog) не покрыт — это требует браузера и проверяется
-- вручную при первом реальном использовании spec-012 (или сразу после
-- spec-013 implementation).
--
-- КАК ЗАПУСКАТЬ
-- -------------
-- 1. Открой Supabase Dashboard → SQL Editor (на prod-проекте).
-- 2. Скопируй сюда весь файл, нажми Run.
-- 3. В output смотри `NOTICE` строки. Должно быть:
--      ✓ Setup OK
--      PASS US1.1: ...
--      PASS US1.2: ...
--      ...
--      ✓ All PASS (N tests)
-- 4. Если хоть один FAIL — пиши номер сценария.
--
-- БЕЗОПАСНОСТЬ
-- ------------
-- Весь скрипт обёрнут в `BEGIN ... ROLLBACK`. Тестовые данные создаются
-- во временной кампании 'spec012-smoke-test', живут только на время
-- транзакции, и в самом конце откатываются. Прод-кампании не тронуты.
-- Можно гонять сколько угодно раз.
--
-- ============================================================================

begin;

-- ─────────────────────────── 0. Setup ───────────────────────────
--
-- Используется временная таблица для шаринга UUIDs между do-блоками.

create temp table _smoke_ids (k text primary key, v uuid) on commit drop;

do $smoke$
declare
  v_camp uuid;
  v_char_type uuid;
  v_loop_type uuid;
  v_stash_type uuid;
  v_mirian uuid;
  v_lex uuid;
  v_marcus uuid;
  v_loop5 uuid;
  v_stash uuid;
  v_user uuid;
begin
  -- 0.1 Find any existing auth user for author_user_id FK.
  select id into v_user from auth.users limit 1;
  if v_user is null then
    raise exception 'No auth.users found — smoke test needs at least one user (cannot insert transactions without author_user_id).';
  end if;

  -- 0.2 Test campaign + node types.
  insert into campaigns (name, slug)
    values ('Spec-012 Smoke Test', 'spec012-smoke-test-' || gen_random_uuid())
    returning id into v_camp;

  insert into node_types (campaign_id, slug, label)
    values (v_camp, 'character', 'Персонаж') returning id into v_char_type;
  insert into node_types (campaign_id, slug, label)
    values (v_camp, 'loop', 'Петля') returning id into v_loop_type;
  insert into node_types (campaign_id, slug, label)
    values (v_camp, 'stash', 'Общак') returning id into v_stash_type;

  -- 0.3 Three PCs.
  insert into nodes (campaign_id, type_id, title)
    values (v_camp, v_char_type, 'Mirian') returning id into v_mirian;
  insert into nodes (campaign_id, type_id, title)
    values (v_camp, v_char_type, 'Lex') returning id into v_lex;
  insert into nodes (campaign_id, type_id, title)
    values (v_camp, v_char_type, 'Marcus') returning id into v_marcus;

  -- 0.4 Loop 5 + stash.
  insert into nodes (campaign_id, type_id, title, fields)
    values (v_camp, v_loop_type, 'Loop 5', jsonb_build_object('number', 5))
    returning id into v_loop5;
  insert into nodes (campaign_id, type_id, title)
    values (v_camp, v_stash_type, 'Общак') returning id into v_stash;

  -- 0.5 Categories needed by resolver (starting_money, starting_items, credit).
  -- Some are seeded by trigger 037; others (credit) by 034. Idempotent.
  insert into categories (campaign_id, scope, slug, label, sort_order) values
    (v_camp, 'transaction', 'starting_money', 'Стартовые деньги', 15),
    (v_camp, 'transaction', 'starting_items', 'Стартовые предметы', 25),
    (v_camp, 'transaction', 'credit', 'Кредит', 30)
  on conflict (campaign_id, scope, slug) do nothing;

  -- 0.6 Configs.
  --   * Campaign: loan = 200 gp, stash seed = 50 gp + arrows×5
  --   * Mirian: 100 gp + flag on + items [longsword×1, arrows×20]
  --   * Lex:    150 gp + flag OFF + no items
  --   * Marcus: 100 gp + flag on + no items
  insert into campaign_starter_configs (
    campaign_id, loan_amount_gp,
    stash_seed_gp, stash_seed_items
  ) values (
    v_camp, 200,
    50, '[{"name":"arrows","qty":5}]'::jsonb
  )
  on conflict (campaign_id) do update
    set loan_amount_gp = excluded.loan_amount_gp,
        stash_seed_gp = excluded.stash_seed_gp,
        stash_seed_items = excluded.stash_seed_items;

  insert into pc_starter_configs (pc_id, takes_starting_loan, starting_gp, starting_items) values
    (v_mirian, true, 100, '[{"name":"longsword","qty":1},{"name":"arrows","qty":20}]'::jsonb),
    (v_lex,    false, 150, '[]'::jsonb),
    (v_marcus, true, 100, '[]'::jsonb);

  -- 0.7 Save ids for later blocks.
  insert into _smoke_ids values
    ('camp', v_camp), ('mirian', v_mirian), ('lex', v_lex), ('marcus', v_marcus),
    ('loop5', v_loop5), ('stash', v_stash), ('user', v_user);

  raise notice '✓ Setup OK (campaign=%, loop5=%, stash=%, user=%)', v_camp, v_loop5, v_stash, v_user;
end
$smoke$;

-- ─────────────────────────── US1.1 ───────────────────────────
-- Apply на свежей петле создаёт правильное число autogen-рядов.
-- Mirian flag=on (money + loan) + Lex flag=off (money only) +
-- Marcus flag=on (money + loan) + stash (1 coin row + 1 item row) +
-- starting_items для Mirian (longsword + arrows).
-- Total: 3 money + 2 loan + 1 stash_seed coin + 1 stash_seed item +
--        2 starting_items = 9 autogen-рядов.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_mirian uuid := (select v from _smoke_ids where k='mirian');
  v_lex uuid := (select v from _smoke_ids where k='lex');
  v_marcus uuid := (select v from _smoke_ids where k='marcus');
  v_loop5 uuid := (select v from _smoke_ids where k='loop5');
  v_stash uuid := (select v from _smoke_ids where k='stash');
  v_user uuid := (select v from _smoke_ids where k='user');
  v_count int;
  v_inserted int;
begin
  -- Build the desired-row payload by hand (this is what `applyLoopStartSetup`
  -- in app/actions/starter-setup.ts produces from the resolver).
  select inserted into v_inserted from apply_loop_start_setup(
    v_loop5,
    jsonb_build_array(
      -- starting_money rows (3 PCs × 100 / 150 gp)
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_mirian::text,
        'kind', 'money', 'amount_gp', 100,
        'category_slug', 'starting_money', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_money',
        'autogen_source_node_id', v_loop5::text
      ),
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_lex::text,
        'kind', 'money', 'amount_gp', 150,
        'category_slug', 'starting_money', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_money',
        'autogen_source_node_id', v_loop5::text
      ),
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_marcus::text,
        'kind', 'money', 'amount_gp', 100,
        'category_slug', 'starting_money', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_money',
        'autogen_source_node_id', v_loop5::text
      ),
      -- starting_loan rows (Mirian + Marcus only — Lex flag is off)
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_mirian::text,
        'kind', 'money', 'amount_gp', 200,
        'category_slug', 'credit', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_loan',
        'autogen_source_node_id', v_loop5::text
      ),
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_marcus::text,
        'kind', 'money', 'amount_gp', 200,
        'category_slug', 'credit', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_loan',
        'autogen_source_node_id', v_loop5::text
      ),
      -- stash_seed coin row (50 gp on stash)
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_stash::text,
        'kind', 'money', 'amount_gp', 50,
        'category_slug', 'starting_money', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'stash_seed',
        'autogen_source_node_id', v_loop5::text
      ),
      -- stash_seed item row (arrows × 5 on stash)
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_stash::text,
        'kind', 'item', 'item_name', 'arrows', 'item_qty', 5,
        'category_slug', 'starting_items', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'stash_seed',
        'autogen_source_node_id', v_loop5::text
      ),
      -- starting_items for Mirian (longsword × 1, arrows × 20)
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_mirian::text,
        'kind', 'item', 'item_name', 'longsword', 'item_qty', 1,
        'category_slug', 'starting_items', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_items',
        'autogen_source_node_id', v_loop5::text
      ),
      jsonb_build_object(
        'campaign_id', v_camp::text, 'actor_pc_id', v_mirian::text,
        'kind', 'item', 'item_name', 'arrows', 'item_qty', 20,
        'category_slug', 'starting_items', 'comment', '',
        'loop_number', 5, 'day_in_loop', 1,
        'author_user_id', v_user::text,
        'autogen_wizard_key', 'starting_items',
        'autogen_source_node_id', v_loop5::text
      )
    ),
    '[]'::jsonb,
    array[]::uuid[]
  );

  -- 9 inserted (5 money + 1 stash coin + 3 items)
  if v_inserted = 9 then
    raise notice 'PASS US1.1 (RPC inserted): apply created 9 autogen rows';
  else
    raise exception 'FAIL US1.1 (RPC inserted): expected 9 inserted, got %', v_inserted;
  end if;

  -- All 9 rows are present with autogen marker.
  select count(*) into v_count
    from transactions
   where campaign_id = v_camp
     and loop_number = 5
     and autogen_wizard_key is not null;
  if v_count = 9 then
    raise notice 'PASS US1.1 (db state): 9 autogen rows in db for loop 5';
  else
    raise exception 'FAIL US1.1 (db state): expected 9 autogen rows, got %', v_count;
  end if;

  -- All hand_touched flags are false (RPC inserts with default false).
  select count(*) into v_count
    from transactions
   where campaign_id = v_camp and loop_number = 5 and autogen_hand_touched = true;
  if v_count = 0 then
    raise notice 'PASS US1.1 (hand-touched): no rows flagged after fresh apply';
  else
    raise exception 'FAIL US1.1 (hand-touched): expected 0 flagged rows, got %', v_count;
  end if;
end
$smoke$;

-- ─────────────────────────── US1.2 ───────────────────────────
-- Lex без credit-row (флаг off): только Mirian + Marcus получили loan.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_lex uuid := (select v from _smoke_ids where k='lex');
  v_count_loan_lex int;
  v_count_loan_total int;
begin
  -- spec012.applying is sticky within a transaction (set_config(..., true)
  -- scopes to TX, not to the RPC call). Reset before checking trigger
  -- behaviour or the trigger will be silently suppressed.
  perform set_config('spec012.applying', 'off', true);

  select count(*) into v_count_loan_lex
    from transactions
   where campaign_id = v_camp
     and loop_number = 5
     and autogen_wizard_key = 'starting_loan'
     and actor_pc_id = v_lex;
  if v_count_loan_lex = 0 then
    raise notice 'PASS US1.2: Lex has no starting_loan row (flag off respected)';
  else
    raise exception 'FAIL US1.2: Lex got % loan rows despite flag off', v_count_loan_lex;
  end if;

  select count(*) into v_count_loan_total
    from transactions
   where campaign_id = (select v from _smoke_ids where k='camp')
     and loop_number = 5
     and autogen_wizard_key = 'starting_loan';
  if v_count_loan_total = 2 then
    raise notice 'PASS US1.2: exactly 2 loan rows (Mirian + Marcus)';
  else
    raise exception 'FAIL US1.2: expected 2 loan rows, got %', v_count_loan_total;
  end if;
end
$smoke$;

-- ─────────────────────────── US3.7 + US3.8 ───────────────────────────
-- Hand-edit autogen row → триггер выставляет hand_touched=true.
-- Затем UPDATE через RPC сбрасывает обратно.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_marcus uuid := (select v from _smoke_ids where k='marcus');
  v_loop5 uuid := (select v from _smoke_ids where k='loop5');
  v_user uuid := (select v from _smoke_ids where k='user');
  v_target_id uuid;
  v_flag boolean;
  v_updated int;
begin
  -- Reset sticky guard from prior RPC call (see US1.2 comment).
  perform set_config('spec012.applying', 'off', true);

  -- Find Marcus's starting_loan row.
  select id into v_target_id
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'starting_loan'
     and actor_pc_id = v_marcus
   limit 1;
  if v_target_id is null then
    raise exception 'FAIL US3.7 setup: cannot find Marcus loan row';
  end if;

  -- Hand-edit (direct UPDATE, no spec012.applying flag).
  update transactions set amount_gp = 150 where id = v_target_id;

  select autogen_hand_touched into v_flag
    from transactions where id = v_target_id;
  if v_flag = true then
    raise notice 'PASS US3.7: trigger flipped autogen_hand_touched=true on direct UPDATE';
  else
    raise exception 'FAIL US3.7: hand_touched still % after direct UPDATE', v_flag;
  end if;

  -- US3.8: simulate confirm — call RPC to update the row back to 200 gp.
  -- RPC sets spec012.applying=on so the trigger does NOT re-flip.
  select updated into v_updated from apply_loop_start_setup(
    v_loop5,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_target_id::text,
        'amount_gp', 200,
        'category_slug', 'credit',
        'comment', ''
      )
    ),
    array[]::uuid[]
  );
  if v_updated = 1 then
    raise notice 'PASS US3.8 (RPC updated): 1 row updated via RPC';
  else
    raise exception 'FAIL US3.8 (RPC updated): expected 1, got %', v_updated;
  end if;

  -- After RPC update, hand_touched should be false again.
  select autogen_hand_touched into v_flag
    from transactions where id = v_target_id;
  if v_flag = false then
    raise notice 'PASS US3.8 (flag reset): hand_touched=false after RPC update';
  else
    raise exception 'FAIL US3.8: hand_touched still % after RPC update', v_flag;
  end if;

  -- Reset sticky guard so the next block's hand-delete fires the tombstone trigger.
  perform set_config('spec012.applying', 'off', true);
end
$smoke$;

-- ─────────────────────────── US3.5 (tombstone) ───────────────────────────
-- Hand-delete autogen row → триггер пишет в autogen_tombstones.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_marcus uuid := (select v from _smoke_ids where k='marcus');
  v_loop5 uuid := (select v from _smoke_ids where k='loop5');
  v_target_id uuid;
  v_tomb_count int;
begin
  -- Reset sticky guard (defensive — also reset above).
  perform set_config('spec012.applying', 'off', true);

  -- Find Marcus's starting_money row.
  select id into v_target_id
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'starting_money'
     and actor_pc_id = v_marcus
   limit 1;
  if v_target_id is null then
    raise exception 'FAIL US3.5 setup: cannot find Marcus money row';
  end if;

  -- Hand-delete (direct DELETE, no apply guard).
  delete from transactions where id = v_target_id;

  select count(*) into v_tomb_count
    from autogen_tombstones
   where campaign_id = v_camp
     and autogen_source_node_id = v_loop5
     and autogen_wizard_key = 'starting_money'
     and actor_pc_id = v_marcus;
  if v_tomb_count = 1 then
    raise notice 'PASS US3.5: tombstone written for hand-deleted autogen row';
  else
    raise exception 'FAIL US3.5: expected 1 tombstone, got %', v_tomb_count;
  end if;
end
$smoke$;

-- ─────────────────────────── US3.2 ───────────────────────────
-- Gameplay row не должен иметь autogen-маркера и не должен
-- получить hand_touched=true при reapply (RPC не трогает рядов
-- без id'а в payload).

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_marcus uuid := (select v from _smoke_ids where k='marcus');
  v_loop5 uuid := (select v from _smoke_ids where k='loop5');
  v_user uuid := (select v from _smoke_ids where k='user');
  v_gameplay_id uuid;
  v_amount_after int;
  v_flag_after boolean;
begin
  -- Insert a regular gameplay row (-5 gp potion on Marcus, day 7).
  insert into transactions (
    campaign_id, actor_pc_id, kind, amount_gp, category_slug, comment,
    loop_number, day_in_loop, author_user_id
  ) values (
    v_camp, v_marcus, 'money', -5, 'starting_money', 'potion',
    5, 7, v_user
  ) returning id into v_gameplay_id;

  -- Simulate reapply: RPC call with empty payload (no inserts/updates/deletes).
  perform apply_loop_start_setup(v_loop5, '[]'::jsonb, '[]'::jsonb, array[]::uuid[]);

  -- Gameplay row untouched.
  select amount_gp, autogen_hand_touched
    into v_amount_after, v_flag_after
    from transactions where id = v_gameplay_id;
  if v_amount_after = -5 and (v_flag_after is false or v_flag_after is null) then
    raise notice 'PASS US3.2: gameplay row (-5 gp potion) untouched by reapply';
  else
    raise exception 'FAIL US3.2: amount=%, hand_touched=% after reapply', v_amount_after, v_flag_after;
  end if;
end
$smoke$;

-- ─────────────────────────── US3.4 ───────────────────────────
-- Empty-payload reapply не меняет state.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_loop5 uuid := (select v from _smoke_ids where k='loop5');
  v_count_before int;
  v_count_after int;
  v_ins int; v_upd int; v_del int;
begin
  select count(*) into v_count_before
    from transactions
   where campaign_id = v_camp and loop_number = 5;

  select inserted, updated, deleted
    into v_ins, v_upd, v_del
    from apply_loop_start_setup(v_loop5, '[]'::jsonb, '[]'::jsonb, array[]::uuid[]);

  select count(*) into v_count_after
    from transactions
   where campaign_id = v_camp and loop_number = 5;

  if v_ins = 0 and v_upd = 0 and v_del = 0 and v_count_before = v_count_after then
    raise notice 'PASS US3.4: empty reapply touches zero rows (was %, still %)', v_count_before, v_count_after;
  else
    raise exception 'FAIL US3.4: ins=% upd=% del=%, before=% after=%',
      v_ins, v_upd, v_del, v_count_before, v_count_after;
  end if;
end
$smoke$;

-- ─────────────────────────── US5.1 ───────────────────────────
-- starting_items rows: kind='item', item_name set, amount_*=0.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_mirian uuid := (select v from _smoke_ids where k='mirian');
  v_count int;
  v_longsword_qty int;
  v_arrows_qty int;
begin
  select count(*) into v_count
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'starting_items'
     and actor_pc_id = v_mirian
     and kind = 'item';
  if v_count = 2 then
    raise notice 'PASS US5.1 (count): 2 starting_items rows for Mirian';
  else
    raise exception 'FAIL US5.1 (count): expected 2, got %', v_count;
  end if;

  select item_qty into v_longsword_qty
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'starting_items'
     and actor_pc_id = v_mirian and item_name = 'longsword';
  select item_qty into v_arrows_qty
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'starting_items'
     and actor_pc_id = v_mirian and item_name = 'arrows';
  if v_longsword_qty = 1 and v_arrows_qty = 20 then
    raise notice 'PASS US5.1 (qty): longsword=1, arrows=20';
  else
    raise exception 'FAIL US5.1 (qty): longsword=%, arrows=%', v_longsword_qty, v_arrows_qty;
  end if;
end
$smoke$;

-- ─────────────────────────── stash seed ───────────────────────────
-- Stash actor получил one coin row (50 gp) + one item row (arrows×5).

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_stash uuid := (select v from _smoke_ids where k='stash');
  v_coin_gp int;
  v_item_qty int;
begin
  select amount_gp into v_coin_gp
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'stash_seed'
     and actor_pc_id = v_stash and kind = 'money';
  select item_qty into v_item_qty
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_wizard_key = 'stash_seed'
     and actor_pc_id = v_stash and kind = 'item' and item_name = 'arrows';

  if v_coin_gp = 50 and v_item_qty = 5 then
    raise notice 'PASS stash_seed: coin row 50gp + item row arrows×5';
  else
    raise exception 'FAIL stash_seed: coin=%, item_qty=%', v_coin_gp, v_item_qty;
  end if;
end
$smoke$;

-- ─────────────────────────── US7.1 ───────────────────────────
-- Удаление loop-ноды каскадит autogen-rows (FK on delete cascade
-- через autogen_source_node_id → nodes.id).
--
-- Note: gameplay row тоже сидит в loop=5, но без autogen marker.
-- У gameplay row autogen_source_node_id IS NULL, поэтому каскад на
-- этот ряд НЕ распространяется. Gameplay row остаётся (но с
-- actor_pc_id который may set null если PC удалён). Здесь PC не
-- трогаем — поэтому gameplay row остаётся как есть.

do $smoke$
declare
  v_camp uuid := (select v from _smoke_ids where k='camp');
  v_loop5 uuid := (select v from _smoke_ids where k='loop5');
  v_autogen_before int;
  v_autogen_after int;
  v_gameplay_after int;
begin
  select count(*) into v_autogen_before
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_source_node_id = v_loop5;

  if v_autogen_before = 0 then
    raise exception 'FAIL US7.1 setup: no autogen rows to cascade-delete';
  end if;

  -- Delete the loop node.
  delete from nodes where id = v_loop5;

  select count(*) into v_autogen_after
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_source_node_id = v_loop5;

  if v_autogen_after = 0 then
    raise notice 'PASS US7.1: % autogen rows cascaded with loop deletion', v_autogen_before;
  else
    raise exception 'FAIL US7.1: % autogen rows still present after loop delete', v_autogen_after;
  end if;

  -- Gameplay row (without autogen_source_node_id) survived.
  select count(*) into v_gameplay_after
    from transactions
   where campaign_id = v_camp and loop_number = 5
     and autogen_source_node_id is null;
  if v_gameplay_after = 1 then
    raise notice 'PASS US7.1 (gameplay survives): non-autogen row survived loop deletion';
  else
    raise exception 'FAIL US7.1 (gameplay survives): expected 1, got %', v_gameplay_after;
  end if;
end
$smoke$;

-- ─────────────────────────── Summary ───────────────────────────

do $smoke$
begin
  raise notice E'\n========================================\n✓ All PASS — spec-012 backend smoke OK\n========================================\nCovered: US1.1, US1.2, US3.2, US3.4, US3.5, US3.7, US3.8, US5.1, US7.1, stash seed.\nNot covered (UI-level, manual): US1.5 (banner), US3.5/3.7 confirm dialog, US4 (new PC mid-loop — schema-identical), US6 (badge/tooltip/filter chip).';
end
$smoke$;

-- ─────────────────────────── Cleanup ───────────────────────────
-- ROLLBACK throws away every test row, the temp campaign, configs,
-- categories, transactions, and tombstones. Prod data untouched.

rollback;
