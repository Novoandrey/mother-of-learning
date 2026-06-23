#!/usr/bin/env bash
#
# infra/wal-slot-monitor.sh — T021 / DEBT-011 guard.
#
# Realtime (re-enabled per infra/realtime-runbook.md) holds a LOGICAL
# replication slot. If Realtime dies or lags, that slot pins WAL and the WAL
# cannot be recycled — on the CPX32's small disk it can fill up and take the
# database down. This script checks every logical slot's retained WAL and alerts
# the team's Telegram topic (the same bot/topic MrBranches uses) when a slot
# crosses a size threshold. Run it from cron every ~10 min.
#
# Read-only and safe: it only SELECTs from pg_replication_slots and never drops a
# slot. (Dropping the slot of a *running* Realtime makes it lose its WAL place;
# only ever drop a slot whose Realtime has been decommissioned — by hand.)
#
# Config via env, or via /opt/infra/wal-monitor.env which is sourced if present:
#   COMPOSE_DIR   (required)  path to the supabase/docker clone on the box
#   PG_CONTAINER  supabase-db  the Postgres container name
#   THRESHOLD_MB  500          alert when a logical slot retains >= this many MB
#   COOLDOWN_MIN  360          do not re-alert within this many minutes
#   TG_BOT_TOKEN  (required)  BotFather token (same value as the GH secret)
#   TG_CHAT_ID    (required)  -100… supergroup id (same value as the GH secret)
#   TG_THREAD_ID  (optional)  forum topic message_thread_id
#
# Install on the box (as for backup.sh):
#   cp infra/wal-slot-monitor.sh /opt/infra/ && chmod +x /opt/infra/wal-slot-monitor.sh
#   printf 'COMPOSE_DIR=%s\nTG_BOT_TOKEN=%s\nTG_CHAT_ID=%s\nTG_THREAD_ID=%s\n' \
#     /home/andrey/supabase/docker '<token>' '-100…' '<thread>' > /opt/infra/wal-monitor.env
#   chmod 600 /opt/infra/wal-monitor.env
# Cron (root):
#   */10 * * * * /opt/infra/wal-slot-monitor.sh >> /var/log/wal-slot-monitor.log 2>&1
# Smoke-test the alert path once (forces an alert on any slot):
#   THRESHOLD_MB=0 /opt/infra/wal-slot-monitor.sh
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/infra/wal-monitor.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

: "${COMPOSE_DIR:?set COMPOSE_DIR (path to supabase/docker on the box)}"
: "${TG_BOT_TOKEN:?set TG_BOT_TOKEN}"
: "${TG_CHAT_ID:?set TG_CHAT_ID}"
PG_CONTAINER="${PG_CONTAINER:-supabase-db}"
THRESHOLD_MB="${THRESHOLD_MB:-500}"
COOLDOWN_MIN="${COOLDOWN_MIN:-360}"
STAMP="${STAMP:-/tmp/wal-slot-monitor.alerted}"

cd "$COMPOSE_DIR"

# One row per logical slot:  name | active(t/f) | retained_bytes
rows=$(docker compose exec -T "$PG_CONTAINER" \
  psql -U postgres -d postgres -At -F'|' -c \
  "select slot_name, active, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) \
   from pg_replication_slots where slot_type = 'logical';" \
  | tr -d '\r')

alert=""
while IFS='|' read -r name active bytes; do
  [ -z "${name:-}" ] && continue
  mb=$(( ${bytes:-0} / 1024 / 1024 ))
  if [ "$mb" -ge "$THRESHOLD_MB" ]; then
    state=$([ "$active" = "t" ] && echo active || echo INACTIVE)
    alert+="• ${name}: ${mb} MB retained, ${state}"$'\n'
  fi
done <<< "$rows"

# Healthy → clear the cooldown stamp and exit quietly.
if [ -z "$alert" ]; then
  rm -f "$STAMP"
  exit 0
fi

# Cooldown: don't spam the topic every cron tick while it stays over.
if [ -f "$STAMP" ]; then
  age_min=$(( ( $(date +%s) - $(stat -c %Y "$STAMP") ) / 60 ))
  [ "$age_min" -lt "$COOLDOWN_MIN" ] && exit 0
fi

msg="🐘⚠️ WAL replication slot alert — theloopers prod
${alert}
A logical slot is retaining ≥ ${THRESHOLD_MB} MB of WAL. If this is the Realtime
slot and Realtime is down or lagging, the WAL won't free and the disk can fill.
Check: docker compose ps realtime; docker compose logs --tail=50 realtime.
Only drop a slot whose Realtime is decommissioned."

curl -sS -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT_ID}" \
  ${TG_THREAD_ID:+--data-urlencode "message_thread_id=${TG_THREAD_ID}"} \
  --data-urlencode "text=${msg}" \
  --data-urlencode "disable_web_page_preview=true" \
  -o /dev/null -w "TG response: %{http_code}\n"

touch "$STAMP"
