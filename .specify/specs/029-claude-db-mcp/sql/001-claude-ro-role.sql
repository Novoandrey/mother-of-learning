-- spec-029: read-only Postgres role for Claude's MCP access (analysis only).
-- Run on the SELF-HOSTED Supabase Postgres via Studio SQL Editor, as a superuser.
-- Idempotent (safe to re-run).
--
-- Read-only is enforced at the ROLE level (the hard boundary):
--   no INSERT/UPDATE/DELETE/DDL grants + default_transaction_read_only = on.
-- This is the real guarantee, independent of any MCP-server "read-only mode"
-- (the archived reference Postgres MCP server had a read-only bypass; do not
-- rely on the server layer alone).
--
-- PASSWORD: this file is intentionally PASSWORDLESS — no secret in git.
-- After running, set the password OUT OF BAND and store it in a password
-- manager (do NOT commit it):
--   ALTER ROLE claude_ro WITH PASSWORD '<<generated-strong-password>>';

BEGIN;

-- 1. Role: can log in, but nothing privileged. NOBYPASSRLS so it can never
--    sidestep row-level security either.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_ro') THEN
    CREATE ROLE claude_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- 2. Read access to the application schema only.
--    'auth', 'storage', etc. are intentionally NOT granted: auth.users holds
--    password hashes and PII. Grant a narrow view later if some auth metric is
--    ever needed.
GRANT CONNECT ON DATABASE postgres TO claude_ro;
GRANT USAGE  ON SCHEMA public      TO claude_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_ro;

-- 3. Future tables in 'public' become readable automatically, so new app
--    tables work without re-running grants.
--    NOTE: this applies to tables created by the role running THIS script.
--    If migrations create tables under a different owner (e.g. 'postgres' or
--    'supabase_admin'), add a FOR ROLE clause for that owner, e.g.:
--      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--        GRANT SELECT ON TABLES TO claude_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_ro;
-- Cover both realistic table owners on self-hosted Supabase explicitly, so
-- future migrations stay readable to claude_ro no matter which admin role
-- (Studio session role) ends up creating them:
DO $$ BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
          'GRANT SELECT ON TABLES TO claude_ro';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
          'GRANT SELECT ON TABLES TO claude_ro';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 4. Belt-and-suspenders: read-only sessions + runaway-query guards.
ALTER ROLE claude_ro SET default_transaction_read_only = on;
ALTER ROLE claude_ro SET statement_timeout = '30s';
ALTER ROLE claude_ro SET idle_in_transaction_session_timeout = '60s';

COMMIT;

-- Verification (run as superuser; prints exactly one row with ✅ or ❌):
SELECT CASE
         WHEN bool_and(ok) THEN
           '✅ claude_ro готов: USAGE+SELECT на public, INSERT закрыт, read-only сессии, timeout 30s'
         ELSE
           '❌ не сошлось: ' || string_agg(name, ', ') FILTER (WHERE NOT ok)
       END AS result
FROM (VALUES
  ('schema USAGE',
     has_schema_privilege('claude_ro', 'public', 'USAGE')),
  ('SELECT on nodes',
     has_table_privilege('claude_ro', 'public.nodes', 'SELECT')),
  ('INSERT denied',
     NOT has_table_privilege('claude_ro', 'public.nodes', 'INSERT')),
  ('read-only sessions',
     EXISTS (SELECT 1 FROM pg_db_role_setting s
             JOIN pg_roles r ON r.oid = s.setrole
             WHERE r.rolname = 'claude_ro'
               AND s.setconfig::text LIKE '%default_transaction_read_only=on%')),
  ('statement_timeout 30s',
     EXISTS (SELECT 1 FROM pg_db_role_setting s
             JOIN pg_roles r ON r.oid = s.setrole
             WHERE r.rolname = 'claude_ro'
               AND s.setconfig::text LIKE '%statement_timeout=30s%'))
) AS checks(name, ok);

-- Negative test (later, from an SSH-tunnelled psql connected AS claude_ro):
--   INSERT INTO public.nodes DEFAULT VALUES;
--     -> ERROR: cannot execute INSERT in a read-only transaction
