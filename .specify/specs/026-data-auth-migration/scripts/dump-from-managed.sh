#!/usr/bin/env bash
#
# dump-from-managed.sh — pull roles + schema + data from MANAGED Supabase (026, Phase B).
#
# Uses `supabase db dump` (NOT raw pg_dump): the CLI applies Supabase-specific
# filtering — excludes internal schemas, strips reserved roles, adds idempotent
# `IF NOT EXISTS` — which is exactly what lets the restore into the initialized
# self-hosted stack avoid the ownership / duplicate-schema_migrations conflicts
# the 025 drill hit (Supabase cli#3532). Raw pg_dump would pull internals and
# fail on restore.
#
# `auth.users` (with bcrypt password hashes), auth.identities, RLS policies,
# functions and triggers are all included in the dump (Supabase docs:
# https://supabase.com/docs/guides/self-hosting/restore-from-platform).
#
# Produces three files in OUT_DIR:
#   roles.sql   (--role-only)
#   schema.sql  (DDL)
#   data.sql    (--use-copy --data-only)
#
# Usage:
#   MANAGED_URL="postgresql://postgres.<ref>:<pw>@<host>:5432/postgres" \
#     ./dump-from-managed.sh [OUT_DIR]
#   (OUT_DIR defaults to ./dump-026)
#
# Get MANAGED_URL from the managed project Dashboard → Connect (session pooler or
# direct). The CLI runs pg_dump inside a Docker container, so Docker must be up.
#
# Env:
#   MANAGED_URL    (required) managed Supabase connection string
#   SUPABASE_BIN   supabase            (use "npx supabase" if the CLI isn't installed)
#   OUT_DIR        ./dump-026

set -euo pipefail

MANAGED_URL="${MANAGED_URL:?set MANAGED_URL to the managed Supabase connection string (Dashboard → Connect)}"
SUPABASE_BIN="${SUPABASE_BIN:-supabase}"
OUT_DIR="${1:-${OUT_DIR:-./dump-026}}"

log()  { echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

command -v "${SUPABASE_BIN%% *}" >/dev/null 2>&1 \
  || fail "'${SUPABASE_BIN}' not found. Install the Supabase CLI or set SUPABASE_BIN='npx supabase'."

mkdir -p "$OUT_DIR"

log "1/3 roles  → ${OUT_DIR}/roles.sql"
$SUPABASE_BIN db dump --db-url "$MANAGED_URL" -f "${OUT_DIR}/roles.sql" --role-only \
  || fail "roles dump failed"

log "2/3 schema → ${OUT_DIR}/schema.sql"
$SUPABASE_BIN db dump --db-url "$MANAGED_URL" -f "${OUT_DIR}/schema.sql" \
  || fail "schema dump failed"

log "3/3 data   → ${OUT_DIR}/data.sql"
$SUPABASE_BIN db dump --db-url "$MANAGED_URL" -f "${OUT_DIR}/data.sql" --use-copy --data-only \
  || fail "data dump failed"

# --- assertions: files non-empty, auth.users actually captured ---
for f in roles schema data; do
  [ -s "${OUT_DIR}/${f}.sql" ] || fail "${f}.sql is empty"
done

# tolerant match for `COPY [ "auth"."users" | auth.users ] (...)` produced by --use-copy
if grep -Eiq 'copy[[:space:]]+"?auth"?\.[ ]*"?users"?' "${OUT_DIR}/data.sql"; then
  log "OK: COPY auth.users present in data.sql (password hashes will migrate)"
else
  fail "no COPY auth.users in data.sql — auth data NOT captured. Check the connection string (use direct/session-pooler as 'postgres'), not a read-only/anon role."
fi

log "=== dump OK ==="
log "files:"
ls -lh "${OUT_DIR}"/roles.sql "${OUT_DIR}"/schema.sql "${OUT_DIR}"/data.sql
log "Next: copy ${OUT_DIR}/ to the box and run restore-into-selfhosted.sh (Phase C)."
