-- Migration 106: add new PC — Гектор Грейвс (Никита, некромант).
--
-- Pattern: same as 030_pc_roster_v2.sql.
-- 1. Insert character node with fields.player = 'Никита' so that
--    seed-players.ts can pick it up and create the node_pc_owners
--    link for the existing user 'nikita__player'.
-- 2. fields.stats = {} as a placeholder for the future statblock,
--    consistent with all other PCs.
-- 3. Class is stored as a tag ('некромант') alongside '3-курс' —
--    same convention as the original 5 PCs in seed.sql ('жрец',
--    'монах', 'бард' etc.).
--
-- Idempotent: re-running does nothing if the PC already exists.
-- The user→PC ownership link is NOT created here — run
-- `npm run seed-players -- --file ./players.json` after the
-- migration to wire ownership (the script is also idempotent).

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Гектор Грейвс',
  jsonb_build_object(
    'player',      'Никита',
    'description', '',
    'stats',       '{}'::jsonb,
    'tags',        '["3-курс","некромант"]'::jsonb
  )
where not exists (
  select 1 from nodes n
   where n.campaign_id = '00000000-0000-0000-0000-000000000001'
     and n.type_id    = '10000000-0000-0000-0000-000000000001'
     and n.title      = 'Гектор Грейвс'
);
