#!/usr/bin/env bash
#
# infra/backup.sh — daily PHYSICAL backup of self-hosted Supabase Postgres → R2.
#
# ⚠ 026 CHANGE (chat 86): the 025 logical pg_dumpall method is GONE. The drill
#   proved it can't back up self-hosted Supabase — under `postgres` (superuser
#   stripped) the dump misses supabase_admin-owned tables (auth.users with
#   password hashes), and a reload conflicts on ownership + duplicate
#   schema_migrations (Supabase cli#3532). 026 switches to a PHYSICAL cold-copy:
#   stop the db cleanly, tar the on-disk data directory (byte-exact, captures
#   auth.users + all roles + everything), restart, upload. Restore = swap the
#   data-dir back (see restore.sh). The R2/rclone pipeline, rotation, cron, and
#   rollback all carry over from 025 unchanged.
#
# Captures TWO things so the off-box backup is restorable on a FRESH box:
#   1. the bind-mounted data directory  ($COMPOSE_DIR/volumes/db/data)
#   2. the `db-config` named volume (/etc/postgresql-custom) — holds the pgsodium
#      decryption key. Without it, a fresh-box restore can't decrypt pgsodium /
#      vault columns. (auth.users passwords are bcrypt, NOT pgsodium — those are
#      safe regardless, but we capture the key for completeness.)
#
# Brief downtime: the db is stopped for the duration of the tar (seconds for our
# small DB). Acceptable — self-hosted is PARALLEL, no prod traffic on it. (027
# may revisit with pg_basebackup/WAL-PITR if a nightly stop ever matters.)
#
# Exits NON-ZERO on any failure (stop / tar / upload / disk) so cron/monitoring
# notice instead of silently "succeeding". The db is ALWAYS restarted on exit,
# even if a later step fails.
#
# Usage (on the box, as root):
#   COMPOSE_DIR=/path/to/supabase/docker /opt/infra/backup.sh
#
# Config via env (defaults target the 024 stack):
#   COMPOSE_DIR      (required) path to the supabase/docker clone on the box
#   DATA_DIR         $COMPOSE_DIR/volumes/db/data   (bind-mount, per 024 compose)
#   PG_CONTAINER     supabase-db
#   PG_USER          postgres            (for pg_isready health-check only)
#   STOP_TIMEOUT     60                  (seconds for a clean Postgres shutdown)
#   RCLONE_REMOTE    r2                  (see rclone.conf.example)
#   BUCKET           mat-ucheniya-backups
#   LOG_FILE         /var/log/supabase-backup.log
#   TMPDIR_BASE      /tmp
#   DAILY_KEEP_DAYS  30
#   WEEKLY_KEEP_DAYS 28
#   MIN_FREE_MB      1000                (refuse to start with less free in TMPDIR_BASE)

set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:?set COMPOSE_DIR to the supabase/docker clone path}"
DATA_DIR="${DATA_DIR:-${COMPOSE_DIR}/volumes/db/data}"
PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
PG_USER="${PG_USER:-postgres}"
STOP_TIMEOUT="${STOP_TIMEOUT:-60}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
BUCKET="${BUCKET:-mat-ucheniya-backups}"
LOG_FILE="${LOG_FILE:-/var/log/supabase-backup.log}"
TMPDIR_BASE="${TMPDIR_BASE:-/tmp}"
DAILY_KEEP_DAYS="${DAILY_KEEP_DAYS:-30}"
WEEKLY_KEEP_DAYS="${WEEKLY_KEEP_DAYS:-28}"
MIN_FREE_MB="${MIN_FREE_MB:-1000}"
COMPOSE=(docker compose -f "${COMPOSE_DIR}/docker-compose.yml")

log()  { echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit 1; }

TS="$(date -u +'%Y-%m-%d-%H%M')"     # timestamped name — rotation keys off this
DOW="$(date -u +'%u')"               # 1..7, 7 = Sunday
WORK="$(mktemp -d "${TMPDIR_BASE%/}/sbbackup.XXXXXX")"
DATA_TAR="${WORK}/${TS}.data.tar.gz"
DBCFG_TAR="${WORK}/${TS}.dbconfig.tar.gz"
DB_STOPPED=0

cleanup() {
  # always bring the db back, even if a step failed mid-backup
  if [ "$DB_STOPPED" = "1" ]; then
    if [ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" != "true" ]; then
      log "cleanup: restarting db"
      "${COMPOSE[@]}" start db >/dev/null 2>&1 || log "WARN: failed to restart db in cleanup"
    fi
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

log "=== physical backup start ${TS} (container=${PG_CONTAINER}, bucket=${BUCKET}) ==="

# --- preflight ---
FREE_MB="$(df -Pm "$TMPDIR_BASE" | awk 'NR==2 {print $4}')"
[ "${FREE_MB:-0}" -ge "$MIN_FREE_MB" ] \
  || fail "low disk on ${TMPDIR_BASE}: ${FREE_MB}MB < ${MIN_FREE_MB}MB"
[ -d "$DATA_DIR" ] || fail "data dir not found: ${DATA_DIR}"
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 \
  || fail "container ${PG_CONTAINER} does not exist"

# --- resolve the db-config named volume (pgsodium key) from the container mount ---
DBCFG_VOL="$(docker inspect "$PG_CONTAINER" \
  --format '{{ range .Mounts }}{{ if eq .Destination "/etc/postgresql-custom" }}{{ .Name }}{{ end }}{{ end }}' 2>/dev/null || true)"
if [ -n "$DBCFG_VOL" ]; then
  log "db-config volume: ${DBCFG_VOL}"
else
  log "WARN: could not resolve db-config volume — backing up data dir only (pgsodium key NOT captured)"
fi

# --- stop db cleanly so the data dir is a consistent on-disk snapshot ---
log "stopping db (timeout ${STOP_TIMEOUT}s) for a consistent cold copy"
DB_STOPPED=1
"${COMPOSE[@]}" stop -t "$STOP_TIMEOUT" db || fail "failed to stop db"

# --- tar the data directory (numeric owner preserved; run as root) ---
log "tar data dir → ${DATA_TAR}"
tar --numeric-owner -p -C "${COMPOSE_DIR}/volumes/db" -czf "$DATA_TAR" data \
  || fail "tar of data dir failed"

# --- tar the db-config volume (pgsodium key) from its host mountpoint ---
if [ -n "$DBCFG_VOL" ]; then
  DBCFG_MNT="$(docker volume inspect "$DBCFG_VOL" --format '{{ .Mountpoint }}' 2>/dev/null || true)"
  if [ -n "$DBCFG_MNT" ] && [ -d "$DBCFG_MNT" ]; then
    log "tar db-config volume (${DBCFG_MNT}) → ${DBCFG_TAR}"
    tar --numeric-owner -p -C "$DBCFG_MNT" -czf "$DBCFG_TAR" . \
      || fail "tar of db-config volume failed"
  else
    log "WARN: db-config mountpoint not found — pgsodium key NOT captured"
    DBCFG_VOL=""   # so the upload/integrity steps below skip it
  fi
fi

# --- restart db and wait healthy ---
log "starting db"
"${COMPOSE[@]}" start db || fail "failed to start db"
DB_STOPPED=0   # started cleanly; cleanup no longer needs to touch it
for i in $(seq 1 60); do
  docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -h localhost >/dev/null 2>&1 && break
  sleep 2
  [ "$i" -lt 60 ] || fail "db did not become ready after restart"
done
log "db healthy again"

# --- integrity check before upload ---
gzip -t "$DATA_TAR" || fail "data tar is corrupt (gzip -t)"
[ -s "$DATA_TAR" ] || fail "data tar is empty"
if [ -n "$DBCFG_VOL" ]; then
  gzip -t "$DBCFG_TAR" || fail "db-config tar is corrupt"
fi

# --- upload to daily/ (data + db-config share the TS prefix → rotation prunes them together) ---
log "upload → ${RCLONE_REMOTE}:${BUCKET}/daily/"
rclone copy "$DATA_TAR" "${RCLONE_REMOTE}:${BUCKET}/daily/" || fail "rclone upload (data, daily) failed"
if [ -n "$DBCFG_VOL" ]; then
  rclone copy "$DBCFG_TAR" "${RCLONE_REMOTE}:${BUCKET}/daily/" || fail "rclone upload (db-config, daily) failed"
fi

# --- Sunday: also keep a weekly copy ---
if [ "$DOW" = "7" ]; then
  log "Sunday → also weekly/"
  rclone copy "$DATA_TAR" "${RCLONE_REMOTE}:${BUCKET}/weekly/" || fail "rclone upload (data, weekly) failed"
  if [ -n "$DBCFG_VOL" ]; then
    rclone copy "$DBCFG_TAR" "${RCLONE_REMOTE}:${BUCKET}/weekly/" || fail "rclone upload (db-config, weekly) failed"
  fi
fi

# --- rotation: keep last 30 daily / 28d weekly (unchanged from 025) ---
log "prune daily/ >${DAILY_KEEP_DAYS}d, weekly/ >${WEEKLY_KEEP_DAYS}d"
rclone delete --min-age "${DAILY_KEEP_DAYS}d"  "${RCLONE_REMOTE}:${BUCKET}/daily/"  || fail "prune daily/ failed"
rclone delete --min-age "${WEEKLY_KEEP_DAYS}d" "${RCLONE_REMOTE}:${BUCKET}/weekly/" || fail "prune weekly/ failed"

log "=== physical backup ok ${TS} ==="
