#!/usr/bin/env bash
#
# restore-into-selfhosted.sh — load roles/schema/data into self-hosted (026, Phase C).
#
# Loads the three files from dump-from-managed.sh into the self-hosted db, in
# order, with triggers disabled during the data load:
#
#   psql --single-transaction --variable ON_ERROR_STOP=1 \
#        --file roles.sql --file schema.sql \
#        --command 'SET session_replication_role = replica' \
#        --file data.sql
#
# WHY `session_replication_role = replica`: it disables triggers during the data
# import, which prevents double-encryption of columns — critical for auth.users,
# whose bcrypt hashes would otherwise be re-encrypted by a trigger and break
# login (Supabase docs).
#
# WHY run as `supabase_admin` (not `postgres`): on self-hosted Supabase the
# `postgres` role has had superuser stripped (the 025 finding), and
# `SET session_replication_role = replica` needs superuser. We also have no
# Supavisor (trimmed in 024), so we exec straight into the db container as the
# real superuser `supabase_admin`. (If this hits an auth error, check pg_hba /
# POSTGRES_USER_READ_WRITE — see runbook T008.)
#
# Files are docker-cp'd into the container, so no host port / Supavisor needed.
#
# Usage (on the box, as root, AFTER copying the dump dir over):
#   ./restore-into-selfhosted.sh /path/to/dump-026            # final restore
#   ./restore-into-selfhosted.sh --dry-run /path/to/dump-026  # collect version-gap failures
#
# --dry-run runs the SAME load WITHOUT --single-transaction / ON_ERROR_STOP, so
# psql keeps going past errors and prints them ALL at once. Use it first to find
# tables/columns the (possibly older) self-hosted Auth/Storage lacks, comment
# those COPY blocks out of data.sql, then run the final restore. (See runbook R3.)
#
# Env:
#   PG_CONTAINER   supabase-db
#   RESTORE_USER   supabase_admin
#   IN_DIR         (positional) dir holding roles.sql / schema.sql / data.sql

set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi

PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
RESTORE_USER="${RESTORE_USER:-supabase_admin}"
IN_DIR="${1:-${IN_DIR:-./dump-026}}"

log()  { echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

for f in roles schema data; do
  [ -s "${IN_DIR}/${f}.sql" ] || fail "${IN_DIR}/${f}.sql missing or empty"
done
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || fail "container ${PG_CONTAINER} not found"

# --- copy the files into the container ---
log "copying dump files into ${PG_CONTAINER}:/tmp/"
docker cp "${IN_DIR}/roles.sql"  "${PG_CONTAINER}:/tmp/roles.sql"
docker cp "${IN_DIR}/schema.sql" "${PG_CONTAINER}:/tmp/schema.sql"
docker cp "${IN_DIR}/data.sql"   "${PG_CONTAINER}:/tmp/data.sql"

if [ "$DRY_RUN" = "1" ]; then
  log "=== DRY-RUN: loading WITHOUT --single-transaction to surface ALL failures ==="
  log "    (errors below are expected if managed Auth/Storage is newer than self-hosted;"
  log "     comment the offending COPY blocks out of data.sql, then run the final restore)"
  docker exec "$PG_CONTAINER" psql -U "$RESTORE_USER" -d postgres \
    --file /tmp/roles.sql \
    --file /tmp/schema.sql \
    --command 'SET session_replication_role = replica' \
    --file /tmp/data.sql 2>&1 | tee "${IN_DIR}/dry-run.log" || true
  log "=== DRY-RUN done — review ${IN_DIR}/dry-run.log; grep -i 'error\\|does not exist\\|column' ==="
  exit 0
fi

log "=== FINAL restore (single transaction, ON_ERROR_STOP, triggers disabled) ==="
docker exec "$PG_CONTAINER" psql -U "$RESTORE_USER" -d postgres \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file /tmp/roles.sql \
  --file /tmp/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file /tmp/data.sql \
  || fail "restore failed (run with --dry-run to see all errors; check version-gap COPY blocks)"

log "=== restore OK ==="
log "Next (Phase C step 4): run resync-sequences.sql, e.g."
log "  docker cp scripts/resync-sequences.sql ${PG_CONTAINER}:/tmp/ && \\"
log "  docker exec ${PG_CONTAINER} psql -U ${RESTORE_USER} -d postgres -f /tmp/resync-sequences.sql"
