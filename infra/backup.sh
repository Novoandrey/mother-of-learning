#!/usr/bin/env bash
#
# infra/backup.sh — daily logical backup of self-hosted Supabase Postgres → R2.
#
# Runs on the box via cron. Dumps the whole cluster (ROLES + all databases) with
# pg_dumpall inside the supabase-db container, gzips it, uploads to R2 with
# rclone under a timestamped name, keeps a Sunday copy in weekly/, and prunes old
# backups (30 daily / 28 weekly days).
#
# Exits NON-ZERO on any failure (dump / upload / disk / missing roles) so cron
# and any monitoring notice instead of silently "succeeding".
#
# Config via env (defaults target the 024 stack):
#   PG_CONTAINER     supabase-db
#   PG_USER          postgres            (superuser; PGPASSWORD already set in the container)
#   RCLONE_REMOTE    r2                  (see rclone.conf.example)
#   BUCKET           mat-ucheniya-backups
#   LOG_FILE         /var/log/supabase-backup.log
#   TMPDIR_BASE      /tmp
#   DAILY_KEEP_DAYS  30
#   WEEKLY_KEEP_DAYS 28
#   MIN_FREE_MB      500                 (refuse to start with less free in TMPDIR_BASE)

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
PG_USER="${PG_USER:-postgres}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
BUCKET="${BUCKET:-mat-ucheniya-backups}"
LOG_FILE="${LOG_FILE:-/var/log/supabase-backup.log}"
TMPDIR_BASE="${TMPDIR_BASE:-/tmp}"
DAILY_KEEP_DAYS="${DAILY_KEEP_DAYS:-30}"
WEEKLY_KEEP_DAYS="${WEEKLY_KEEP_DAYS:-28}"
MIN_FREE_MB="${MIN_FREE_MB:-500}"

log()  { echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') $*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit 1; }

TS="$(date -u +'%Y-%m-%d-%H%M')"     # timestamped name — rotation keys off this
DOW="$(date -u +'%u')"               # 1..7, 7 = Sunday
WORK="$(mktemp -d "${TMPDIR_BASE%/}/sbbackup.XXXXXX")"
DUMP="${WORK}/${TS}.sql"
GZ="${DUMP}.gz"

cleanup() { rm -rf "$WORK"; }        # temp cleared in every exit path
trap cleanup EXIT

log "=== backup start ${TS} (container=${PG_CONTAINER}, bucket=${BUCKET}) ==="

# --- preflight: disk for the temp dump ---
FREE_MB="$(df -Pm "$TMPDIR_BASE" | awk 'NR==2 {print $4}')"
[ "${FREE_MB:-0}" -ge "$MIN_FREE_MB" ] \
  || fail "low disk on ${TMPDIR_BASE}: ${FREE_MB}MB < ${MIN_FREE_MB}MB"

# --- container running? ---
[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" = "true" ] \
  || fail "container ${PG_CONTAINER} is not running"

# --- dump whole cluster (PGPASSWORD is already in the container env) ---
log "pg_dumpall → ${DUMP}"
docker exec "$PG_CONTAINER" pg_dumpall -U "$PG_USER" > "$DUMP" \
  || fail "pg_dumpall failed"
[ -s "$DUMP" ] || fail "dump is empty"

# roles MUST be in the dump, else a restore breaks PostgREST/Auth/RLS
grep -q 'CREATE ROLE' "$DUMP" \
  || fail "no CREATE ROLE in dump — Supabase roles missing (use pg_dumpall, not pg_dump)"

log "gzip"
gzip "$DUMP"                          # → $GZ
[ -s "$GZ" ] || fail "gzip produced empty file"

# --- upload to daily/ ---
log "upload → ${RCLONE_REMOTE}:${BUCKET}/daily/${TS}.sql.gz"
rclone copy "$GZ" "${RCLONE_REMOTE}:${BUCKET}/daily/" \
  || fail "rclone upload (daily) failed"

# --- Sunday: also keep a weekly copy ---
if [ "$DOW" = "7" ]; then
  log "Sunday → also weekly/"
  rclone copy "$GZ" "${RCLONE_REMOTE}:${BUCKET}/weekly/" \
    || fail "rclone upload (weekly) failed"
fi

# --- rotation: keep last 30 daily / 4 weekly (28d) ---
log "prune daily/ >${DAILY_KEEP_DAYS}d, weekly/ >${WEEKLY_KEEP_DAYS}d"
rclone delete --min-age "${DAILY_KEEP_DAYS}d"  "${RCLONE_REMOTE}:${BUCKET}/daily/" \
  || fail "prune daily/ failed"
rclone delete --min-age "${WEEKLY_KEEP_DAYS}d" "${RCLONE_REMOTE}:${BUCKET}/weekly/" \
  || fail "prune weekly/ failed"

log "=== backup ok ${TS} ==="
