-- resync-sequences.sql — re-sync every owned sequence in public + auth to MAX(id).
--
-- 026, Phase C step 4. After a --data-only restore, owned sequences can lag
-- behind the data, so the NEXT insert collides on the primary key
-- (Лёша's "sequence trap", confirmed by the migration community). This walks
-- pg_depend for sequences OWNED BY a column (serial/bigserial/identity) in
-- public/auth and bumps each to MAX(that column). Idempotent and harmless if a
-- sequence is already ahead — safe to run more than once.
--
-- Run as a SUPERUSER (supabase_admin), e.g.:
--   docker cp resync-sequences.sql supabase-db:/tmp/
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/resync-sequences.sql
--
-- NOTE: most app tables use UUID primary keys (no sequence) — for those there's
-- nothing to resync and the trap doesn't apply. This still covers any integer/
-- serial sequences in public and the auth schema's own sequences.

DO $$
DECLARE
  r      record;
  maxv   bigint;
  n      int := 0;
BEGIN
  FOR r IN
    SELECT s.oid::regclass        AS seq,
           n.nspname              AS nsp,
           c.relname              AS tbl,
           a.attname              AS col
    FROM pg_depend d
    JOIN pg_class      s ON s.oid = d.objid     AND s.relkind = 'S'   -- sequence
    JOIN pg_class      c ON c.oid = d.refobjid                        -- owning table
    JOIN pg_namespace  n ON n.oid = c.relnamespace
    JOIN pg_attribute  a ON a.attrelid = c.oid  AND a.attnum = d.refobjsubid
    WHERE d.deptype = 'a'                                            -- auto/owned
      AND n.nspname IN ('public', 'auth')
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', r.col, r.nsp, r.tbl)
      INTO maxv;
    IF maxv > 0 THEN
      -- is_called = true → nextval returns maxv + 1
      EXECUTE format('SELECT setval(%L, %s, true)', r.seq::text, maxv);
    ELSE
      -- empty table → nextval returns 1
      EXECUTE format('SELECT setval(%L, 1, false)', r.seq::text);
    END IF;
    RAISE NOTICE 'resynced % (%.%) -> max=%', r.seq, r.nsp, r.tbl, maxv;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'done: % owned sequence(s) resynced in public + auth', n;
END $$;
