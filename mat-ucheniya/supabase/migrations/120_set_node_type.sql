-- Migration 120: register the 'set' node type (spec-052, US4 — PL-8).
--
-- Sets are player-authored bundles of (catalog item, qty). Each set is a
-- node of type 'set'; its contents + owner live in node.fields jsonb:
--   { "items": [{ "itemNodeId": uuid, "name": text, "qty": int }, …],
--     "ownerUserId": uuid }
-- The generic node editor isn't used for sets (they're managed in the /tg
-- sets UI), so default_fields stays '{}'. One type row per campaign, like
-- stash (mig 035). Sets persist across loops (templates, C-04).
--
-- ⚠️ Idempotent. Rollback: delete from node_types where slug='set';

begin;

insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select c.id, 'set', 'Набор', '📦', '{}'::jsonb, 60
from campaigns c
on conflict (campaign_id, slug) do update
  set label = excluded.label,
      icon  = excluded.icon;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when exists (
    select 1 from node_types
     where slug = 'set'
       and campaign_id = (select id from campaigns where slug = 'mat-ucheniya')
  )
  then '✅ set node type registered'
  else '❌ set node type missing'
end as result;
