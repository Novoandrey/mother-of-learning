#!/usr/bin/env bash
#
# infra/restore.sh — restore self-hosted Supabase from a PHYSICAL backup (026).
#
# ⚠ 026 CHANGE (chat 86): replaces the 025 logical-reload drill. A physical
#   restore is just a data-dir swap: pull the tar from R2, stop the stack, set
#   the live data-dir aside (the way back), extract the tar in its place,
#   (optionally restore the db-config/pgsodium volume), bring the stack up. Since
#   the data-dir is non-empty after extraction, the Supabase entrypoint SKIPS
#   re-init and just starts Postgres — no role/schema_migrations conflicts (the
#   whole reason the logical method failed). The stop→mv→up mechanics are the
#   same ones the 025 drill proved at 18s.
#
# Pairs with backup.sh:
#   <ts>.data.tar.gz      → restored into $COMPOSE_DIR/volumes/db/data
#   <ts>.dbconfig.tar.gz  → restored into the db-config named volume (pgsodium key)
#
# SAME-BOX drill (the 026 acceptance, T010): the db-config volume is untouched
# while we only swap the data-dir, so restoring data-dir alone is already
# consistent. We still restore db-config when present (a safe overwrite with the
# identical key). FRESH-BOX recovery (total box loss) REQUIRES the db-config
# tar — see the runbook.
#
# Usage (on the box, as root):
#   COMPOSE_DIR=/path/to/supabase/docker ./restore.sh [daily/2026-06-07-0300.data.tar.gz]
#   (no arg → newest *.data.tar.gz in daily/)
#
# Config via env (defaults target the 024 stack):
#   COMPOSE_DIR    (required) path to the supabase/docker clone on the box
#   DATA_DIR       $COMPOSE_DIR/volumes/db/data
#   PG_CONTAINER   supabase-db
#   PG_USER        postgres
#   RESTORE_USER   supabase_admin   (superuser; for post-restore auth.users check)
#   RCLONE_REMOTE  r2
#   BUCKET         mat-ucheniya-backups
#   TMPDIR_BASE    /tmp
#   MIN_FREE_MB    1500

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:?set COMPOSE_DIR to the supabase/docker clone path}"
DATA_DIR="${DATA_DIR:-${COMPOSE_DIR}/volumes/db/data}"
PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
PG_USER="${PG_USER:-postgres}"
RESTORE_USER="${RESTORE_USER:-supabase_admin}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
BUCKET="${BUCKET:-mat-ucheniya-backups}"
TMPDIR_BASE="${TMPDIR_BASE:-/tmp}"
MIN_FREE_MB="${MIN_FREE_MB:-1500}"
COMPOSE=(docker compose -f "${COMPOSE_DIR}/docker-compose.yml")
DATA_NAME="${1:-}"

log()  { echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { log "ERROR: $*"; exit 1; }

WORK="$(mktemp -d "${TMPDIR_BASE%/}/sbrestore.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# --- pick the data tar ---
if [ -z "$DATA_NAME" ]; then
  latest="$(rclone lsf "${RCLONE_REMOTE}:${BUCKET}/daily/" | grep '\.data\.tar\.gz$' | sort | tail -n1)"
  [ -n "$latest" ] || fail "no *.data.tar.gz found in daily/"
  DATA_NAME="daily/${latest}"
fi
DBCFG_NAME="${DATA_NAME/.data.tar.gz/.dbconfig.tar.gz}"
log "restoring from ${RCLONE_REMOTE}:${BUCKET}/${DATA_NAME}"

# --- download data tar (+ db-config tar if it exists) ---
rclone copy "${RCLONE_REMOTE}:${BUCKET}/${DATA_NAME}" "$WORK/" || fail "download (data) failed"
DATA_TAR="${WORK}/$(basename "$DATA_NAME")"
[ -s "$DATA_TAR" ] || fail "downloaded data tar is empty"

DBCFG_TAR=""
if rclone lsf "${RCLONE_REMOTE}:${BUCKET}/${DBCFG_NAME}" >/dev/null 2>&1; then
  rclone copy "${RCLONE_REMOTE}:${BUCKET}/${DBCFG_NAME}" "$WORK/" || fail "download (db-config) failed"
  DBCFG_TAR="${WORK}/$(basename "$DBCFG_NAME")"
  log "db-config tar present — will restore pgsodium key too"
else
  log "WARN: no db-config tar alongside this backup — restoring data dir only"
fi

# --- pre-restore guards: integrity + disk (catch a corrupt backup HERE) ---
gzip -t "$DATA_TAR" || fail "data tar is corrupt (gzip -t)"
[ -n "$DBCFG_TAR" ] && { gzip -t "$DBCFG_TAR" || fail "db-config tar is corrupt"; }
FREE_MB="$(df -Pm "$TMPDIR_BASE" | awk 'NR==2 {print $4}')"
[ "${FREE_MB:-0}" -ge "$MIN_FREE_MB" ] || fail "low disk: ${FREE_MB}MB < ${MIN_FREE_MB}MB"

# --- resolve db-config volume BEFORE down (need a live/created container to inspect) ---
DBCFG_VOL=""
if [ -n "$DBCFG_TAR" ]; then
  DBCFG_VOL="$(docker inspect "$PG_CONTAINER" \
    --format '{{ range .Mounts }}{{ if eq .Destination "/etc/postgresql-custom" }}{{ .Name }}{{ end }}{{ end }}' 2>/dev/null || true)"
  [ -n "$DBCFG_VOL" ] \
    && log "db-config volume: ${DBCFG_VOL}" \
    || log "WARN: db-config volume not resolvable (fresh box?) — skipping pgsodium restore; see runbook for fresh-box steps"
fi

# --- save a way back, then swap the data dir ---
[ -e "${DATA_DIR}.old" ] && fail "${DATA_DIR}.old exists — clean it up before re-running"
log "stopping stack + setting data-dir aside → ${DATA_DIR}.old"
"${COMPOSE[@]}" down
mv "$DATA_DIR" "${DATA_DIR}.old"

log "extracting data tar → ${COMPOSE_DIR}/volumes/db/"
tar --numeric-owner -p -C "${COMPOSE_DIR}/volumes/db" -xzf "$DATA_TAR" \
  || fail "extract of data tar failed"
[ -d "$DATA_DIR" ] || fail "expected ${DATA_DIR} after extract — tar layout mismatch"

# --- restore db-config (pgsodium key) into its named volume, if we have both ---
if [ -n "$DBCFG_TAR" ] && [ -n "$DBCFG_VOL" ]; then
  DBCFG_MNT="$(docker volume inspect "$DBCFG_VOL" --format '{{ .Mountpoint }}' 2>/dev/null || true)"
  if [ -n "$DBCFG_MNT" ] && [ -d "$DBCFG_MNT" ]; then
    log "restoring db-config volume (pgsodium key) → ${DBCFG_MNT}"
    find "$DBCFG_MNT" -mindepth 1 -delete
    tar --numeric-owner -p -C "$DBCFG_MNT" -xzf "$DBCFG_TAR" \
      || fail "restore of db-config volume failed"
  else
    log "WARN: db-config mountpoint not found — skipping pgsodium restore (same-box data-dir restore stays consistent)"
  fi
fi

# --- bring the stack up (data dir is non-empty → entrypoint skips init) ---
log "starting stack"
"${COMPOSE[@]}" up -d
for i in $(seq 1 60); do
  docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -h localhost >/dev/null 2>&1 && break
  sleep 2
  [ "$i" -lt 60 ] || fail "db did not become ready in time"
done

# --- health checks ---
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc 'SELECT 1;' | grep -q '^1$' \
  || fail "SELECT 1 failed after restore"
log "schemas present:"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c '\dn' || true
log "supabase roles present:"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -tAc \
  "select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1;" || true
log "auth.users count (real-data drill should be > 0):"
docker exec "$PG_CONTAINER" psql -U "$RESTORE_USER" -d postgres -tAc 'select count(*) from auth.users;' \
  || log "WARN: could not read auth.users as ${RESTORE_USER} — check role/pg_hba"

log "restore OK. Verify per runbook: counts == pre-wipe, auth.users hashes non-empty,"
log "Auth/REST containers healthy (give them a few seconds to reconnect), then drop ${DATA_DIR}.old."
log "ROLLBACK if bad: ${COMPOSE[*]} down && rm -rf '${DATA_DIR}' && mv '${DATA_DIR}.old' '${DATA_DIR}' && ${COMPOSE[*]} up -d"
