-- Миграция 038: RPC `apply_loop_start_setup` (spec-012, Phase 6 / T022).
--
-- Выполняет INSERT/UPDATE/DELETE транзакций одной атомарной функцией и
-- зачищает consumed-tombstones за одну поездку. Вся работа делается под
-- session-local флагом `spec012.applying = 'on'`, который заставляет
-- триггеры `trg_tx_autogen_hand_touched` и `trg_tx_autogen_tombstone`
-- выйти на ранних return'ах — иначе UPDATE ставил бы `hand_touched=true`
-- для рядов, которые мы сами же перезаписываем, а DELETE логировал бы
-- бесполезные тумбстоны.
--
-- Параметры (все jsonb кроме id):
--   * p_loop_node_id — id петли-источника; нужен для безопасной очистки
--     тумбстоунов только этой петли (а не соседних).
--   * p_to_insert — массив полных row-объектов для INSERT'а. Формат:
--       { campaign_id, actor_pc_id, kind, amount_cp, amount_sp,
--         amount_gp, amount_pp, item_name, item_qty, category_slug,
--         comment, loop_number, day_in_loop, author_user_id,
--         autogen_wizard_key, autogen_source_node_id }
--   * p_to_update — массив patch-объектов для UPDATE. Формат:
--       { id, amount_cp, amount_sp, amount_gp, amount_pp, item_name,
--         item_qty, category_slug, comment }
--     Ставим `autogen_hand_touched = false` явно — повторный apply
--     сбрасывает флаг ручной правки (FR-013b): DM подтвердил диалог,
--     значит ручная версия потеряна по его собственному решению.
--   * p_to_delete — uuid[] id транзакций для DELETE'а.
--
-- Возвращает одну строку со счётчиками — пригождается в summary
-- action'а и в тестах.
--
-- Security: `security definer` нужен чтобы функция могла писать в
-- transactions/autogen_tombstones независимо от RLS. Вызов идёт через
-- admin-клиент после auth-гейта в server action'е (см.
-- app/actions/starter-setup.ts T021), так что фактического повышения
-- привилегий для end-user'а не происходит. GRANT EXECUTE открывает
-- функцию для `authenticated` роли — admin-клиент её минует, но
-- держим строгий grant ради ясности namespace'а.
--
-- Rollback:
--   drop function if exists apply_loop_start_setup(uuid, jsonb, jsonb, uuid[]);

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
  -- `true` as the third arg makes the setting session-local (i.e.
  -- scoped to this statement/transaction), not persistent.
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
  -- One UPDATE per patch row. Bulk-CTE would be neater but patch count
  -- is tiny (≤ per-PC fan-out), and the loop keeps the SQL readable.
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
  -- After a successful apply the autogen state for this loop is in
  -- sync with the config, so every stale tombstone for this loop +
  -- spec-012 wizard set can go. Future specs (spec-013 encounter_loot)
  -- filter on their own wizardKey here.
  delete from autogen_tombstones
   where autogen_source_node_id = p_loop_node_id
     and autogen_wizard_key in (
       'starting_money',
       'starting_loan',
       'stash_seed',
       'starting_items'
     );
  get diagnostics v_tomb = row_count;

  return query select v_inserted, v_updated, v_deleted, v_tomb;
end;
$$;

-- Admin-клиент минует RLS, но функция всё равно живёт в namespace'е
-- public — явный grant держит ownership чистым и даёт PGAdmin-клиентам
-- вызвать её напрямую, если понадобится.
grant execute on function apply_loop_start_setup(uuid, jsonb, jsonb, uuid[])
  to authenticated;

commit;
