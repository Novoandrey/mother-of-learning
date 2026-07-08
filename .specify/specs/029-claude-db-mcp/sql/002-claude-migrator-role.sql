-- spec-029 (write path, доработки 2026-07-08): DDL role for AGENT-APPLIED migrations.
-- Companion to 001-claude-ro-role.sql. Run on the SELF-HOSTED Supabase Postgres via
-- Studio SQL Editor AS A SUPERUSER (supabase_admin). Idempotent (safe to re-run).
--
-- WHY a separate role (decided with Andrey 2026-07-08): keep claude_ro read-only as
-- the DEFAULT path; add a SEPARATE, tunnel-gated login used ONLY to apply reviewed
-- SQL migrations. Privilege model, grounded in the live role/ownership layout:
--   * The 27 public app tables are owned by role `postgres`, which here is NOT a
--     superuser (supabase_admin is the only superuser).
--   * DDL (ALTER/DROP) cannot be granted — it requires OWNERSHIP. So claude_migrator
--     is made a MEMBER of `postgres` (INHERIT): it can act as owner for DDL, yet
--     stays NOSUPERUSER / NOCREATEROLE — role ATTRIBUTES do not inherit through
--     membership, only privileges and ownership do.
--   * Net reach = exactly the `postgres` role operators already use to migrate by
--     hand. NOT superuser. Tunnel-gated. Separately revocable (DROP ROLE).
--
-- ⚠️ Residual vs claude_ro: claude_ro's "can't see PII" guarantee comes from doing
--    ZERO writes + no auth/storage grants. claude_migrator, as a `postgres` member,
--    wields postgres's privileges (unavoidable to DDL app tables). It is NOT a
--    superuser and is migration-only, but it is not as hermetically walled as
--    claude_ro. Accepted. (Stricter = re-own app tables to a dedicated role —
--    invasive on Supabase, NOT recommended.)
--
-- ⚠️ OPERATIONAL RULE — apply migrations with `SET ROLE postgres;` as the first
--    statement, so new objects are owned by `postgres` (uniform with existing) and
--    claude_ro's default-SELECT (FOR ROLE postgres, see 001) keeps auto-covering
--    them. The agent's apply-session does this; humans already apply AS postgres.
--
-- PASSWORD: passwordless on purpose — no secret in git. After running, set it OUT
-- OF BAND (password manager) and place it ONLY into the local MCP config below:
--   ALTER ROLE claude_migrator WITH PASSWORD '<<generated-strong-password>>';

BEGIN;

-- 1. Role: can log in, writes migrations, but not a superuser and cannot mint roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'claude_migrator') THEN
    CREATE ROLE claude_migrator
      WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS;
  END IF;
END
$$;

-- 2. Owner-level DDL on the app tables (owned by `postgres`) via membership.
--    Attributes stay as declared above — only ownership/privileges are inherited.
GRANT postgres TO claude_migrator;

-- 3. Explicit schema rights (redundant with membership; self-documenting).
GRANT CONNECT ON DATABASE postgres TO claude_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO claude_migrator;

-- 4. Safety net: if any object is ever created AS claude_migrator (i.e. someone
--    forgot the SET ROLE postgres rule), keep it readable to claude_ro so the
--    read-only analysis path never goes blind to a new table.
ALTER DEFAULT PRIVILEGES FOR ROLE claude_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO claude_ro;

-- 5. Guard: cap runaway migration statements (generous vs claude_ro's 30s).
--    NOT read-only — this role writes.
ALTER ROLE claude_migrator SET statement_timeout = '120s';
ALTER ROLE claude_migrator SET idle_in_transaction_session_timeout = '120s';

COMMIT;

-- Verification (run as superuser; prints exactly one row with ✅ or ❌):
SELECT CASE
         WHEN bool_and(ok)
           THEN '✅ claude_migrator готов: LOGIN, NOSUPERUSER, NOCREATEROLE, член postgres, CREATE на public'
           ELSE '❌ не сошлось: ' || string_agg(name, ', ') FILTER (WHERE NOT ok)
       END AS result
FROM (VALUES
  ('login',              (SELECT rolcanlogin       FROM pg_roles WHERE rolname = 'claude_migrator')),
  ('NOT superuser',      (SELECT NOT rolsuper       FROM pg_roles WHERE rolname = 'claude_migrator')),
  ('NOT createrole',     (SELECT NOT rolcreaterole  FROM pg_roles WHERE rolname = 'claude_migrator')),
  ('member of postgres', pg_has_role('claude_migrator', 'postgres', 'MEMBER')),
  ('CREATE on public',   has_schema_privilege('claude_migrator', 'public', 'CREATE'))
) AS checks(name, ok);

-- ─────────────────────────────────────────────────────────────────────────────
-- Local MCP config (add a SECOND server BESIDE the read-only one; NOT in git).
-- Same SSH tunnel serves both (localhost:5433) — only role + password differ.
-- Keep the existing read-only "mat-ucheniya-db" as the DEFAULT query path; the
-- agent uses "-rw" only to apply migrations.
--
--   "mat-ucheniya-db-rw": {
--     "command": "docker",
--     "args": ["run", "-i", "--rm", "-e", "DATABASE_URI",
--              "crystaldba/postgres-mcp", "--access-mode=unrestricted"],
--     "env": {
--       "DATABASE_URI": "postgresql://claude_migrator:<<password>>@localhost:5433/postgres"
--     }
--   }
--
-- Then RESTART Claude Desktop to load it. ⚠️ MSIX gotcha (spec-029 chat 90): the
-- real config may live under
--   %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\
-- not %APPDATA%\Claude — use the app's "Edit Config" button to hit the live file.
-- Writes remain possible ONLY while the SSH tunnel is up (the on/off switch).
