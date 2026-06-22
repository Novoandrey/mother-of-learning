# Realtime re-enable runbook — DEBT-011 / spec-044

Realtime was stripped from the box compose to save resources (DEBT-011). The
spec-044 ledger broadcasts transaction inserts so a second device updates live
(FR-010 / SC-003). This runbook re-enables the Realtime service, wires channel
auth, and adds replication-slot monitoring. It pairs with migration
`mat-ucheniya/supabase/migrations/117_realtime_transactions_broadcast.sql`.

Realtime is the Elixir service that tails Postgres and pushes changes over
websockets; it owns the `realtime` schema.

## Apply order — read first

**T020 (this runbook) MUST precede T019 (apply migration 117).** Migration 117
calls `realtime.send(...)` and adds an RLS policy on `realtime.messages` — both
live in the `realtime` schema, which only exists once the Realtime service has
booted and run its own migrations. Apply 117 first and you get `schema
"realtime" does not exist`. Sequence: re-enable Realtime → confirm the schema →
then apply 117.

## 1. Restore the realtime service (Dokploy compose)

The service block was removed. Re-add it from the **pinned upstream**
`supabase/docker/docker-compose.yml` — match the image tag the rest of the stack
already runs; do not bump versions blind.

Env comes from the existing `.env` (copy the exact var names from the upstream
realtime block — they drift between releases):

- DB connection: `DB_HOST=db`, `DB_PORT`, `DB_NAME`, `DB_USER=supabase_admin`,
  `DB_PASSWORD=${POSTGRES_PASSWORD}`
- `API_JWT_SECRET=${JWT_SECRET}` — the **same** secret the app mints Mini-App
  JWTs with (`SUPABASE_JWT_SECRET`). If these diverge, subscribe-time auth fails.
- `DB_ENC_KEY`, `SECRET_KEY_BASE`, `APP_NAME`, `PORT`
- `depends_on: db (service_healthy)`

Keep Postgres `log_min_messages=fatal` (the compose default) — it exists to mute
Realtime's chatter.

## 2. Keep kong's Traefik labels alive

Realtime is **not** exposed directly — it rides kong's existing public route at
`/realtime/v1/` (websocket). No new Traefik router.

The project invariant holds: `compose-override.kong.yml` plus the `COMPOSE_FILE`
env var must still list the base file **and** the kong override, so a bare
`docker compose up` doesn't drop kong's Traefik labels (see
`.specify/specs/027-cutover-decommission/kong-traefik.md`). After editing the
compose to re-add realtime, re-check that `COMPOSE_FILE` is unchanged and still
includes the override.

Traefik forwards websocket upgrades by default — no middleware. Just confirm
kong's `/realtime/v1/` route is present in `kong.yml`; upstream ships it, but if
it was pruned alongside the service, restore it.

## 3. Bring it up + confirm the schema

```bash  # 🐧 box
cd <stack dir>                  # the dir holding docker-compose.yml
docker compose up -d realtime   # COMPOSE_FILE already includes the kong override
docker compose ps realtime      # → healthy
docker compose logs --tail=50 realtime   # → "Realtime ... Running ... listening"
```

Then (psql / Studio SQL) confirm the schema exists **before** applying 117:

```sql
select 1 from information_schema.schemata where schema_name = 'realtime';
```

One row back → proceed to T019 (apply migration 117). No row → Realtime hasn't
finished its own migrations yet; wait and re-check.

## 4. Channel auth — what migration 117 wires

- Inserts broadcast via
  `realtime.send(payload, 'tx_insert', 'campaign:'||campaign_id, true)` — a
  **private** channel, one topic per campaign.
- RLS on `realtime.messages`: a member may read broadcasts whose topic matches
  `campaign:%` and `is_member((split_part(topic,':',2))::uuid)`. Non-members get
  nothing; no service-role on the client.
- The client (T023) subscribes to `campaign:<id>` with
  `{ config: { private: true } }` **after** putting the minted JWT on the socket
  (`supabase.realtime.setAuth(jwt)` / pass it as the client access token).
  Realtime evaluates the `realtime.messages` RLS once, at subscribe time.
- WS URL: `wss://<supabase-domain>/realtime/v1/websocket?apikey=<anon>` — same
  kong host as the REST API, so origin/CORS is already handled.

Smoke test after 117 is applied: open the Mini-App ledger on two devices, record
on one, confirm the other appends within ~2 s (SC-003).

## 5. WAL replication-slot monitoring — T021

Broadcast-from-database holds a **logical replication slot**. If Realtime is down
or lagging, the slot pins WAL and the CPX32's small disk fills. Guard it in the
backup cron.

Check (alert if a logical slot is inactive or retains too much):

```sql
select slot_name,
       active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained
from pg_replication_slots
where slot_type = 'logical';
```

In the cron (pair with `infra/backup.sh`): run the query, parse the retained
bytes; if a logical slot is `active = false` for more than a few minutes **or**
`retained` exceeds a threshold (start at ~500 MB on this box), fire a Telegram
alert via the MrBranches bot. Only ever `pg_drop_replication_slot('<name>')` for
a slot whose Realtime has been **decommissioned** — never drop the slot of a
running Realtime, or it loses its place in the WAL.

## Rollback

`docker compose stop realtime` and remove the block. The ledger silently falls
back to manual refresh — the app is fully functional without Realtime (FR-010 is
additive). Migration 117's objects are inert when Realtime is off: the trigger's
`realtime.send` is self-error-capturing (it cannot fail an insert), so writes
still succeed. No app redeploy required.
