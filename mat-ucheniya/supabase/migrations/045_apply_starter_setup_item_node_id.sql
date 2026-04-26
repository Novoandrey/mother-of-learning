-- Migration 045 — extend apply_loop_start_setup to write item_node_id.
-- Spec-015 (T039). Drops + recreates the RPC; the signature, return
-- shape, and grants are identical — only the INSERT/UPDATE column
-- list grows by one (`item_node_id`).
--
-- Why a new migration rather than ALTER FUNCTION:
--   PG doesn't support ALTER FUNCTION on the body. Standard pattern
--   for stored-proc evolution: CREATE OR REPLACE with the new body.
--
-- Backward compatibility:
--   * Older callers that DON'T include `item_node_id` in their JSONB
--     payload still work — `nullif(r->>'item_node_id','')::uuid`
--     evaluates to NULL when the field is absent. A row inserted by
--     such a caller gets `item_node_id = NULL`, exactly the pre-mig-045
--     behaviour.
--   * Spec-012 path: bridge always sends `null` (no Образец link in
--     starter setup) → unchanged outcome.
--   * Spec-013 path: bridge now sends `row.item_node_id` from the
--     EncounterLootDesiredRow. When the line was free-text, it's NULL;
--     when the line was picked via <ItemTypeahead>, it's a uuid.
--
-- Idempotent: CREATE OR REPLACE.

begin;

create or replace function apply_loop_start_setup(
  p_loop_node_id uuid,
  p_to_insert    jsonb,
  p_to_update    jsonb,
  p_to_delete    uuid[]
) returns table(
  inserted           int,
  updated            int,
  deleted            int,
  tombstones_cleared int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
  v_deleted  int := 0;
  v_tomb     int := 0;
begin
  -- Suppress autogen triggers for the duration of this transaction.
  perform set_config('spec012.applying', 'on', true);

  -- ─────────────────────────── INSERTs ───────────────────────────
  if p_to_insert is not null and jsonb_array_length(p_to_insert) > 0 then
    insert into transactions (
      campaign_id,
      actor_pc_id,
      kind,
      amount_cp,
      amount_sp,
      amount_gp,
      amount_pp,
      item_name,
      item_node_id,
      item_qty,
      category_slug,
      comment,
      loop_number,
      day_in_loop,
      author_user_id,
      autogen_wizard_key,
      autogen_source_node_id,
      autogen_hand_touched
    )
    select
      (r->>'campaign_id')::uuid,
      nullif(r->>'actor_pc_id','')::uuid,
      r->>'kind',
      coalesce((r->>'amount_cp')::int, 0),
      coalesce((r->>'amount_sp')::int, 0),
      coalesce((r->>'amount_gp')::int, 0),
      coalesce((r->>'amount_pp')::int, 0),
      nullif(r->>'item_name',''),
      nullif(r->>'item_node_id','')::uuid,
      coalesce((r->>'item_qty')::int, 1),
      r->>'category_slug',
      coalesce(r->>'comment', ''),
      (r->>'loop_number')::int,
      (r->>'day_in_loop')::int,
      (r->>'author_user_id')::uuid,
      r->>'autogen_wizard_key',
      (r->>'autogen_source_node_id')::uuid,
      false
    from jsonb_array_elements(p_to_insert) as r;

    get diagnostics v_inserted = row_count;
  end if;

  -- ─────────────────────────── UPDATEs ───────────────────────────
  if p_to_update is not null and jsonb_array_length(p_to_update) > 0 then
    declare
      r jsonb;
      v_one int;
    begin
      for r in select value from jsonb_array_elements(p_to_update)
      loop
        update transactions
           set amount_cp            = coalesce((r->>'amount_cp')::int, 0),
               amount_sp            = coalesce((r->>'amount_sp')::int, 0),
               amount_gp            = coalesce((r->>'amount_gp')::int, 0),
               amount_pp            = coalesce((r->>'amount_pp')::int, 0),
               item_name            = nullif(r->>'item_name',''),
               item_node_id         = nullif(r->>'item_node_id','')::uuid,
               item_qty             = coalesce((r->>'item_qty')::int, 1),
               category_slug        = r->>'category_slug',
               comment              = coalesce(r->>'comment', ''),
               autogen_hand_touched = false,
               updated_at           = now()
         where id = (r->>'id')::uuid;

        get diagnostics v_one = row_count;
        v_updated := v_updated + v_one;
      end loop;
    end;
  end if;

  -- ─────────────────────────── DELETEs ───────────────────────────
  if p_to_delete is not null and array_length(p_to_delete, 1) is not null then
    delete from transactions
     where id = any(p_to_delete);
    get diagnostics v_deleted = row_count;
  end if;

  -- ─────────────────────────── Tombstone cleanup ───────────────────────────
  delete from autogen_tombstones
   where autogen_source_node_id = p_loop_node_id
     and autogen_wizard_key in (
       'starting_money',
       'starting_loan',
       'stash_seed',
       'starting_items',
       'encounter_loot'
     );
  get diagnostics v_tomb = row_count;

  return query select v_inserted, v_updated, v_deleted, v_tomb;
end;
$$;

grant execute on function apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])
  to authenticated;

commit;

-- Verification (run manually if desired):
--
--   -- (a) function definition picks up `item_node_id`:
--   select pg_get_functiondef('apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])'::regprocedure)
--     ilike '%item_node_id%';
--   -- expect: t
--
--   -- (b) round-trip a fake autogen item insert (rolled back):
--   begin;
--   select * from apply_loop_start_setup(
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     jsonb_build_array(jsonb_build_object(
--       'campaign_id',           '<your-campaign-uuid>',
--       'actor_pc_id',           '<some-pc-uuid>',
--       'kind',                  'item',
--       'amount_cp', 0, 'amount_sp', 0, 'amount_gp', 0, 'amount_pp', 0,
--       'item_name',             'Длинный меч',
--       'item_node_id',          '<seeded-longsword-uuid>',
--       'item_qty',              1,
--       'category_slug',         'loot',
--       'comment',               'Лут энкаунтера',
--       'loop_number',           1,
--       'day_in_loop',           1,
--       'author_user_id',        '<your-user-uuid>',
--       'autogen_wizard_key',    'encounter_loot',
--       'autogen_source_node_id','00000000-0000-0000-0000-000000000001'
--     )),
--     '[]'::jsonb, ARRAY[]::uuid[]
--   );
--   -- expect inserted=1; verify the row has item_node_id set:
--   select item_node_id from transactions
--     where autogen_source_node_id = '00000000-0000-0000-0000-000000000001';
--   rollback;
