#!/usr/bin/env bash
#
# infra/restore.sh — restore-drill helper for self-hosted Supabase.
#
# Pulls a backup from R2 and restores it into the self-hosted instance. For
# slice 025 the target is the EMPTY stack from 024 — there is NO app data at
# risk, the point is to rehearse the mechanics and surface the restore pain.
#
# ⚠ DRILL FINDING (025, chat 85): a logical pg_dumpall reload is NOT the path for
#   self-hosted Supabase. (1) Under `postgres` (no superuser here) the dump can't
#   read supabase_admin-owned tables (auth.users etc). (2) Reloading into a
#   self-initialised stack conflicts on ownership + duplicate schema_migrations
#   (Supabase cli#3532 → pg_basebackup). 026 switches to a PHYSICAL method.
#   This script still PROVED the stop→restore→healthy + rollback mechanics on the
#   empty stack (18s). Strategy (b) below tolerated the errors only because the
#   empty stack's objects are identical; it does NOT restore real data.
#
# Usage:
#   COMPOSE_DIR=/path/to/supabase/docker ./restore.sh [daily/2026-06-07-0300.sql.gz]
#   (no arg → newest dump in daily/)
#
# Config via env (defaults target the 024 stack):
#   PG_CONTAINER   supabase-db
#   PG_USER        postgres
#   RCLONE_REMOTE  r2
#   BUCKET         mat-ucheniya-backups
#   COMPOSE_DIR    (required) path to the supabase/docker clone on the box
#   DATA_DIR       $COMPOSE_DIR/volumes/db/data   (bind-mount, per 024 compose)
#   TMPDIR_BASE    /tmp
#   MIN_FREE_MB    1000

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
PG_USER="${PG_USER:-postgres}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
BUCKET="${BUCKET:-mat-ucheniya-backups}"
COMPOSE_DIR="${COMPOSE_DIR:?set COMPOSE_DIR to the supabase/docker clone path}"
DATA_DIR="${DATA_DIR:-${COMPOSE_DIR}/volumes/db/data}"
TMPDIR_BASE="${TMPDIR_BASE:-/tmp}"
MIN_FREE_MB="${MIN_FREE_MB:-1000}"
COMPOSE=(docker compose -f "${COMPOSE_DIR}/docker-compose.yml")
DUMP_NAME="${1:-}"

log()  { echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { log "ERROR: $*"; exit 1; }

WORK="$(mktemp -d "${TMPDIR_BASE%/}/sbrestore.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# --- pick the dump ---
if [ -z "$DUMP_NAME" ]; then
  latest="$(rclone lsf "${RCLONE_REMOTE}:${BUCKET}/daily/" | sort | tail -n1)"
  [ -n "$latest" ] || fail "no backups found in daily/"
  DUMP_NAME="daily/${latest}"
fi
log "restoring from ${RCLONE_REMOTE}:${BUCKET}/${DUMP_NAME}"

# --- download ---
rclone copy "${RCLONE_REMOTE}:${BUCKET}/${DUMP_NAME}" "$WORK/" || fail "download failed"
GZ="${WORK}/$(basename "$DUMP_NAME")"
[ -s "$GZ" ] || fail "downloaded dump is empty"

# --- pre-restore guard: integrity + disk (catches a corrupt backup HERE) ---
gunzip -t "$GZ" || fail "dump is corrupt (gunzip -t)"
FREE_MB="$(df -Pm "$TMPDIR_BASE" | awk 'NR==2 {print $4}')"
[ "${FREE_MB:-0}" -ge "$MIN_FREE_MB" ] || fail "low disk: ${FREE_MB}MB < ${MIN_FREE_MB}MB"

# --- save a way back, then wipe ---
[ -e "${DATA_DIR}.old" ] && fail "${DATA_DIR}.old exists — clean it up before re-running"
log "stopping stack + setting data-dir aside → ${DATA_DIR}.old"
"${COMPOSE[@]}" down
mv "$DATA_DIR" "${DATA_DIR}.old"

# --- bring up a fresh db (entrypoint re-inits Supabase roles/schemas) ---
log "starting fresh stack"
"${COMPOSE[@]}" up -d
for i in $(seq 1 60); do
  docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -h localhost >/dev/null 2>&1 && break
  sleep 2
  [ "$i" -lt 60 ] || fail "db did not become ready in time"
done

# ===================== RESTORE STRATEGY (pick on drill, T010) ===============
# The fresh container already created Supabase roles, so a plain pg_dumpall
# reload prints "role already exists". For the EMPTY stack those roles are
# identical, so swallowing the errors is harmless. For 026 (real data) revisit
# with a clean path. Candidates:
#   (a) restore into a vanilla Postgres target before Supabase init — cleanest,
#       most setup; best long-term.
#   (b) pg_dumpall reload, tolerate "already exists"  — used below, fine on EMPTY.
#   (c) pg_dump public + pg_dumpall --roles-only into the initialized stack —
#       best for real data (026).
# DEFAULT = (b): reload without ON_ERROR_STOP, filter the "exists" noise.
log "reloading dump (strategy b: tolerate 'already exists' on empty stack)"
gunzip -c "$GZ" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d postgres \
  2> >(grep -v -i 'already exists' >&2) || true
# ============================================================================

# --- health check ---
docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -h localhost >/dev/null 2>&1 \
  || fail "db not ready after restore"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc 'SELECT 1;' | grep -q '^1$' \
  || fail "SELECT 1 failed after restore"

log "restore OK. Now per runbook: verify Supabase schemas + Auth/REST healthy,"
log "record stop→healthy time, then drop ${DATA_DIR}.old."
log "ROLLBACK if bad: ${COMPOSE[*]} down && rm -rf '${DATA_DIR}' && mv '${DATA_DIR}.old' '${DATA_DIR}' && ${COMPOSE[*]} up -d"
