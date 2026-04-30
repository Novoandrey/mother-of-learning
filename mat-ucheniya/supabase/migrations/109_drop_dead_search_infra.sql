-- Migration 109 — Drop dead search infrastructure on `nodes`
-- TECH-016 from ultrareview-2 (chat 80, 2026-04-30).
--
-- Background:
--   `nodes.search_vector` (tsvector), GIN index `idx_nodes_search`,
--   trigger `trg_nodes_search_vector`, and function
--   `update_node_search_vector()` were added in 001_initial_schema
--   and patched in migrations 011, 012, 026 to handle JSONB content
--   updates. The intent was full-text search across all node fields.
--
--   In practice the feature never landed in the UI. Catalog search
--   uses `.ilike('title', '%q%')` (`app/c/[slug]/catalog/page.tsx:76`),
--   items search uses the same pattern (`lib/items.ts:159`). Greps
--   for `to_tsquery`, `websearch_to_tsquery`, `@@`, `textSearch`,
--   and direct reads of `search_vector` return zero matches across
--   `lib/`, `app/`, and `lib/queries/`.
--
--   The trigger fires on every insert/update of any node and rebuilds
--   the tsvector via `to_tsvector('russian', …)`. With ~1200 nodes
--   in mat-ucheniya this is small but pure overhead, and the hardcoded
--   `'russian'` config is an open-source blocker (forks running other
--   languages get worse search than no search).
--
-- Decision:
--   Drop the whole stack. If real FTS is wanted later, design it from
--   scratch under the actual deployment's locale and ranking needs.
--
-- Side effect:
--   Closes the `to_tsvector('russian')` hardcode flagged in
--   ultrareview-1 (migrations 001/011/012/026 still contain the
--   string, but the function they define no longer exists in the
--   live schema after this migration).
--
-- Reversal:
--   See migrations 011, 012, 026 for the prior function bodies if
--   the feature is ever revived. The column type and index can be
--   recreated from those.

BEGIN;

-- 1. Trigger first — it's what fires the function.
DROP TRIGGER IF EXISTS trg_nodes_search_vector ON nodes;

-- 2. Function next — only the trigger called it.
DROP FUNCTION IF EXISTS update_node_search_vector();

-- 3. Index — depends on the column.
DROP INDEX IF EXISTS idx_nodes_search;

-- 4. Column.
ALTER TABLE nodes DROP COLUMN IF EXISTS search_vector;

COMMIT;

-- Verify (manual, after apply):
--   -- 1. Column gone:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='nodes' AND column_name='search_vector';
--   -- Expected: 0 rows.
--
--   -- 2. Trigger gone:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='nodes'::regclass AND NOT tgisinternal;
--   -- Expected: no `trg_nodes_search_vector`.
--
--   -- 3. Function gone:
--   SELECT proname FROM pg_proc WHERE proname='update_node_search_vector';
--   -- Expected: 0 rows.
--
--   -- 4. App still works (reads/writes nodes, search via ilike):
--   --   open /c/mat-ucheniya/catalog, type a query, see filtered results.
