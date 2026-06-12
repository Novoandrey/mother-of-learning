#!/usr/bin/env bash
# =============================================================================
# staging-refresh.sh — spec-043: snapshot prod -> staging Supabase. ONE WAY.
#
# Runs ON the box (the prod Postgres is local). Any dev, one command:
#
#   ssh <box> 'sudo bash /opt/mat-ucheniya/staging-refresh.sh'
#
# Steps:
#   1. pg_dump prod `public`  (schema + data) from the supabase-db container
#   2. pg_dump prod `auth`    (data-only: users + identities)
#   3. psql -> staging cloud project: rebuild public, reload auth rows,
#      re-grant Supabase defaults, print ✅/❌ verification counts.
#
# Direction guard (FR-002): the staging DSN lives ONLY in
#   /root/.config/mat-ucheniya/staging.env        (root:root, chmod 600)
# which must define STAGING_DB_URL and STAGING_PROJECT_REF. The script takes
# NO target argument; it refuses to run unless the DSN contains the staging
# project ref and points away from prod. A staging -> prod mode does not exist.
#
# Requirements on the box: docker (prod stack), postgresql-client (psql).
# See infra/staging-runbook.md for setup and gotchas (IPv6 vs session pooler).
# =============================================================================
set -euo pipefail

ENV_FILE="${ENV_FILE:-/root/.config/mat-ucheniya/staging.env}"
SUPABASE_DIR="${SUPABASE_DIR:-/home/andrey/supabase/docker}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

say()  { printf '%s\n' "$*"; }
fail() { printf '❌ %s\n' "$*" >&2; exit 1; }

WORKDIR="$(mktemp -d /tmp/staging-refresh.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

# --- preconditions ----------------------------------------------------------
[[ $EUID -eq 0 ]] || fail "run as root (sudo) — the staging env file is root-only"
command -v psql >/dev/null || fail "psql not found: apt-get install -y postgresql-client"
[[ -f $ENV_FILE ]] || fail "missing $ENV_FILE (see infra/staging-runbook.md §2)"
# shellcheck disable=SC1090
source "$ENV_FILE"
[[ -n ${STAGING_DB_URL:-}      ]] || fail "STAGING_DB_URL not set in $ENV_FILE"
[[ -n ${STAGING_PROJECT_REF:-} ]] || fail "STAGING_PROJECT_REF not set in $ENV_FILE"

# --- direction guard (FR-002) ------------------------------------------------
[[ $STAGING_DB_URL == *"$STAGING_PROJECT_REF"* ]] \
  || fail "direction guard: DSN does not contain STAGING_PROJECT_REF — refusing"
case $STAGING_DB_URL in
  *theloopers.org*|*localhost*|*127.0.0.1*|*37.27.254.49*)
    fail "direction guard: DSN points at prod/local — refusing" ;;
esac

# --- prod credentials (dump side) ---------------------------------------------
[[ -f "$SUPABASE_DIR/.env" ]] || fail "missing $SUPABASE_DIR/.env (prod stack)"
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$SUPABASE_DIR/.env" | head -1 | cut -d= -f2-)"
[[ -n $POSTGRES_PASSWORD ]] || fail "POSTGRES_PASSWORD not found in $SUPABASE_DIR/.env"

docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || fail "container $DB_CONTAINER not running"

DOCKER_PG=(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER")
PSQL_STAGING=(psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -P pager=off)

# --- 1. dump prod ------------------------------------------------------------
say "→ dumping prod public (schema + data)…"
"${DOCKER_PG[@]}" pg_dump -h localhost -U postgres -d postgres \
  --schema=public --no-owner --no-privileges > "$WORKDIR/public.sql"
# we recreate the schema ourselves; drop a CREATE SCHEMA line if pg_dump emits one
sed -i '/^CREATE SCHEMA public;$/d' "$WORKDIR/public.sql"

say "→ dumping prod auth rows (users, identities)…"
"${DOCKER_PG[@]}" pg_dump -h localhost -U postgres -d postgres \
  --data-only --table=auth.users --table=auth.identities > "$WORKDIR/auth.sql"

say "   dumps: $(du -h "$WORKDIR"/public.sql "$WORKDIR"/auth.sql | tr '\n' ' ')"

# --- 2. rebuild staging ------------------------------------------------------
# Order matters: dropping public first removes FKs into auth; auth rows load
# before public so that public FKs to auth.users validate on restore.
say "→ staging: dropping public, clearing auth…"
"${PSQL_STAGING[@]}" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- DELETE (not TRUNCATE): postgres on cloud may not own auth tables;
-- identities/sessions/refresh_tokens cascade via GoTrue FKs.
DELETE FROM auth.users;
SQL

say "→ staging: loading auth rows… (R5: a column-skew between self-hosted and"
say "   cloud GoTrue fails loudly right here)"
"${PSQL_STAGING[@]}" -f "$WORKDIR/auth.sql"

say "→ staging: loading public (the long step)…"
"${PSQL_STAGING[@]}" -f "$WORKDIR/public.sql"

say "→ staging: re-granting Supabase defaults on public…"
"${PSQL_STAGING[@]}" <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
SQL

# --- 3. verify ---------------------------------------------------------------
say "→ verification:"
"${PSQL_STAGING[@]}" -t <<'SQL'
SELECT CASE WHEN count(*) > 0 THEN '✅' ELSE '❌' END || ' auth.users:   ' || count(*) FROM auth.users;
SELECT CASE WHEN count(*) > 0 THEN '✅' ELSE '❌' END || ' public.nodes: ' || count(*) FROM public.nodes;
SQL
say "✅ staging refreshed from prod (prod was read-only throughout)."
