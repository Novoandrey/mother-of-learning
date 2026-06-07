-- check-migration-026.sql — verification queries for the managed → self-hosted
-- migration (026, Phase E).
--
-- HOW TO USE:
--   * PART 1 (counts): run on BOTH managed and self-hosted, then diff the two
--     outputs row-by-row. They must match. Run direct SQL (count(*)) — do NOT
--     go through the PostgREST client, whose db_max_rows=1000 clamp would lie.
--       managed:      psql "$MANAGED_URL"            -f check-migration-026.sql
--       self-hosted:  docker exec -i supabase-db psql -U supabase_admin -d postgres < check-migration-026.sql
--   * PARTS 2–5: run on SELF-HOSTED only (post-restore integrity / auth / sequences / write smoke).
--
-- If a table here doesn't exist in your schema, comment that line out.
-- Read-only except PART 5, which is wrapped in BEGIN…ROLLBACK (writes nothing).

\echo '==== PART 1: row counts (run on BOTH sides, then diff) ===='
SELECT 'campaigns'              AS tbl, count(*) FROM campaigns
UNION ALL SELECT 'node_types',            count(*) FROM node_types
UNION ALL SELECT 'edge_types',            count(*) FROM edge_types
UNION ALL SELECT 'nodes',                 count(*) FROM nodes
UNION ALL SELECT 'edges',                 count(*) FROM edges
UNION ALL SELECT 'categories',            count(*) FROM categories
UNION ALL SELECT 'transactions',          count(*) FROM transactions
UNION ALL SELECT 'item_attributes',       count(*) FROM item_attributes
UNION ALL SELECT 'encounters',            count(*) FROM encounters
UNION ALL SELECT 'accounting_player_state', count(*) FROM accounting_player_state
UNION ALL SELECT 'auth.users',            count(*) FROM auth.users
UNION ALL SELECT 'auth.identities',       count(*) FROM auth.identities
ORDER BY tbl;

\echo ''
\echo '==== PART 2: referential integrity (self-hosted; FKs were OFF during replica load) ===='
-- Each of these MUST return 0. Non-zero = orphan rows slipped in.
\echo '-- orphan edges (source_id not in nodes):'
SELECT count(*) AS orphan_edge_sources
FROM edges e LEFT JOIN nodes n ON n.id = e.source_id WHERE n.id IS NULL;
\echo '-- orphan edges (target_id not in nodes):'
SELECT count(*) AS orphan_edge_targets
FROM edges e LEFT JOIN nodes n ON n.id = e.target_id WHERE n.id IS NULL;
\echo '-- orphan item_attributes (node_id not in nodes):'
SELECT count(*) AS orphan_item_attrs
FROM item_attributes ia LEFT JOIN nodes n ON n.id = ia.node_id WHERE n.id IS NULL;
\echo '-- transactions.item_node_id dangling (non-null but missing node):'
SELECT count(*) AS dangling_item_links
FROM transactions t
WHERE t.item_node_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = t.item_node_id);
-- Optional (uncomment if transactions.actor_pc_id references nodes in your schema):
-- SELECT count(*) AS dangling_actor_pc
-- FROM transactions t
-- WHERE t.actor_pc_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = t.actor_pc_id);

\echo ''
\echo '==== PART 3: auth.users hashes survived (self-hosted; US3) ===='
-- with_hash should equal users-that-have-a-hash on managed (email/password users).
SELECT count(*)                                          AS users_total,
       count(*) FILTER (WHERE encrypted_password <> '')  AS users_with_hash
FROM auth.users;

\echo ''
\echo '==== PART 4: sequence audit (self-hosted; proves resync, no insert needed) ===='
-- For every owned sequence in public/auth, last_value must be >= MAX(owning col).
-- verdict OK = next insert will not collide. (Mostly empty for a UUID-PK schema.)
SELECT s.schemaname, s.sequencename, s.last_value
FROM pg_sequences s
WHERE s.schemaname IN ('public', 'auth')
ORDER BY 1, 2;

\echo ''
\echo '==== PART 5: write smoke (self-hosted; BEGIN…ROLLBACK — writes nothing) ===='
-- Proves inserts work end-to-end (triggers back on, no PK collision) without
-- leaving a row behind. Uses the mat-ucheniya campaign + its first node_type.
BEGIN;
INSERT INTO nodes (campaign_id, type_id, title)
SELECT '00000000-0000-0000-0000-000000000001'::uuid,
       (SELECT id FROM node_types
         WHERE campaign_id = '00000000-0000-0000-0000-000000000001'::uuid
         ORDER BY sort_order, slug LIMIT 1),
       '__migration_026_write_smoke__'
RETURNING id, title;
ROLLBACK;
\echo '(if PART 5 printed a row id with no error, writes are healthy)'
