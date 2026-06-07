# Runbook: Migrate managed → self-hosted (spec-026)

Copy-paste steps to move **real app data + `auth.users` (password hashes)** from
managed Supabase into the self-hosted 024 stack — **parallel to prod, no
cutover** (cutover is 027). Operator (Andrey + Леша) runs these on the box;
Claude can't SSH in — paste logs/errors back for debugging.

> ⚠ DRAFT until the run. Timings (Phase D) and the date are filled in on the
> first pass, then this runbook is finalized (T014).

**Execution-context labels:** 🖥️ LOCAL (your machine) · 🐧 SERVER (SSH on the box)
· 🌐 WEB (browser).

**Conventions**
- `<COMPOSE_DIR>` = the `supabase/docker` clone on the box (from 024).
- Container `supabase-db`; self-hosted superuser **`supabase_admin`** (NOT
  `postgres` — it had superuser stripped, and the restore needs superuser).
- infra scripts (physical backup/restore) deployed to `/opt/infra/`.
- 026 scripts deployed to `/opt/migrate-026/` (this folder's `scripts/` +
  `check-migration-026.sql`).
- Run docker/file steps with `sudo` as needed.

**Method, in one line:** `supabase db dump` ×3 → `psql` with
`session_replication_role=replica` under `supabase_admin` → resync sequences →
re-prove the physical backup/restore drill on the now-real data.
(Anchor: <https://supabase.com/docs/guides/self-hosting/restore-from-platform>.)

---

## Phase A — Deploy the physical backup/restore scripts (US1 prep)

The 025 logical method is replaced (it couldn't capture `auth.users`). Put the
new physical scripts on the box.

- [ ] 🐧 Deploy:
      ```bash
      sudo cp infra/backup.sh infra/restore.sh /opt/infra/
      sudo chmod +x /opt/infra/backup.sh /opt/infra/restore.sh
      ```
- [ ] 🐧 Deploy the 026 scripts:
      ```bash
      sudo mkdir -p /opt/migrate-026
      sudo cp -r .specify/specs/026-data-auth-migration/scripts \
                 .specify/specs/026-data-auth-migration/check-migration-026.sql \
                 /opt/migrate-026/
      sudo chmod +x /opt/migrate-026/scripts/*.sh
      ```

> The full physical backup + drill runs in **Phase D** (after real data lands) —
> running it now would only prove an empty stack again.

---

## Phase B — Dump from managed (US2/US3)

- [ ] 🌐 Managed Dashboard → **Connect** → copy the connection string (session
      pooler or direct). It must be the `postgres` user (not anon/read-only),
      or `auth.users` won't be captured.
- [ ] 🐧 Run the dump on the box (it has Docker; the CLI runs `pg_dump` in a
      container). Install CLI if missing (`SUPABASE_BIN='npx supabase'` works):
      ```bash
      cd /opt/migrate-026
      MANAGED_URL="postgresql://postgres.<ref>:<pw>@<host>:5432/postgres" \
        ./scripts/dump-from-managed.sh ./dump-026
      ```
- [ ] **✅ check** — script prints `OK: COPY auth.users present in data.sql` and
      lists three non-empty files (`roles.sql`, `schema.sql`, `data.sql`).
      managed is read-only here — **prod is not touched**. _(T004)_

---

## Phase C — Restore into self-hosted (US2/US3) — avoids cli#3532

The CLI dump is filtered (idempotent `IF NOT EXISTS`, reserved roles stripped),
so it loads into the initialized stack cleanly. We run it as `supabase_admin`
with triggers disabled (so password hashes aren't re-encrypted).

- [ ] 🐧 **Dry run first** — surface every version-gap failure (managed Auth may
      be newer than self-hosted, so `data.sql` can reference tables/columns we
      lack):
      ```bash
      cd /opt/migrate-026
      sudo ./scripts/restore-into-selfhosted.sh --dry-run ./dump-026
      grep -iE 'error|does not exist|column' dump-026/dry-run.log
      ```
- [ ] 🐧 **Fix `data.sql` for the gap** (if the dry run showed failures):
      ```bash
      # PG17-only setting (harmless on our PG17, but comment if it errors):
      sed -i 's/^SET transaction_timeout/-- &/' dump-026/data.sql
      ```
      For each failing table/column, comment out its `COPY <table> FROM stdin;`
      line **and the matching `\.` terminator** a few lines below. Expect this
      for `storage.*` (we exclude storage anyway) and possibly newer auth tables
      like `auth.oauth_clients` / extra `auth.flow_state` columns.
      *(Alternative: bump the self-hosted Docker stack to a newer release to
      close the gap — but that touches the working 024 stack, so prefer editing
      `data.sql` unless the gap is large.)*
- [ ] 🐧 **Final restore:**
      ```bash
      sudo ./scripts/restore-into-selfhosted.sh ./dump-026
      ```
- [ ] 🐧 **Resync sequences** (the "sequence trap" — avoid duplicate-key on next
      insert):
      ```bash
      docker cp /opt/migrate-026/scripts/resync-sequences.sql supabase-db:/tmp/
      docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/resync-sequences.sql
      ```
- [ ] **✅ check** — restore ends with no `FATAL`; no ownership /
      `schema_migrations` conflicts. If it failed on
      `permission denied … session_replication_role`, confirm you ran as
      `supabase_admin` (not `postgres`); if still stuck, check
      `POSTGRES_USER_READ_WRITE` in `docker-compose.yml`. _(T008)_

---

## Phase D — Physical backup + drill on REAL data (US1 acceptance)

Now that self-hosted holds real data, prove the physical backup/restore works on
it (this is what 025 could only do on an empty stack).

- [ ] 🐧 Take a physical backup (data + pgsodium key):
      ```bash
      sudo COMPOSE_DIR=<COMPOSE_DIR> /opt/infra/backup.sh
      rclone lsf r2:mat-ucheniya-backups/daily/ | tail
      ```
      Expect a `<ts>.data.tar.gz` (and `<ts>.dbconfig.tar.gz`), non-empty.
- [ ] 🐧 **Drill** — note counts first, then restore from the physical backup:
      ```bash
      # record key counts BEFORE
      docker exec -i supabase-db psql -U supabase_admin -d postgres \
        < /opt/migrate-026/check-migration-026.sql | tee before.txt
      # run the drill (time it)
      time sudo COMPOSE_DIR=<COMPOSE_DIR> /opt/infra/restore.sh
      ```
- [ ] **✅ check** — after restore: `SELECT 1` OK; counts == `before.txt`;
      `auth.users` count > 0 with non-empty hashes; Auth/REST containers reach
      healthy (give them a few seconds). _(T010)_
- [ ] 🐧 Record **stop → healthy** time: ______  ·  **date:** ______
- [ ] 🐧 Verify the way back (< 1 min):
      ```bash
      # ROLLBACK form (only if a restore goes bad):
      # docker compose -f <COMPOSE_DIR>/docker-compose.yml down
      # sudo rm -rf <COMPOSE_DIR>/volumes/db/data
      # sudo mv <COMPOSE_DIR>/volumes/db/data.old <COMPOSE_DIR>/volumes/db/data
      # docker compose -f <COMPOSE_DIR>/docker-compose.yml up -d
      ```
- [ ] 🐧 If the drill is good, drop the way-back copy:
      `sudo rm -rf <COMPOSE_DIR>/volumes/db/data.old`

---

## Phase E — Verification, login, finalize (US2/US3/US4)

- [ ] 🐧 **Counts match prod** — run PART 1 on BOTH sides and diff (direct SQL,
      no PostgREST clamp):
      ```bash
      # managed:
      psql "$MANAGED_URL" -f /opt/migrate-026/check-migration-026.sql | tee managed.txt
      # self-hosted:
      docker exec -i supabase-db psql -U supabase_admin -d postgres \
        < /opt/migrate-026/check-migration-026.sql | tee selfhosted.txt
      diff <(grep -E '^\s' managed.txt) <(grep -E '^\s' selfhosted.txt) || true
      ```
      PART 2 (integrity) must be all-zero; PART 3 shows users-with-hash; PART 4
      sequences ahead of max; PART 5 write smoke prints a row id. _(T011/T012)_
- [ ] 🐧 **Login test (US3#3)** — one existing player logs into self-hosted Auth
      with their CURRENT password, without publishing the API. Hit GoTrue from
      inside the compose network (find the net via `docker network ls`,
      usually `<dir>_default`; `ANON_KEY` is in the self-hosted `.env`):
      ```bash
      docker run --rm --network <COMPOSE_PROJECT>_default curlimages/curl -s \
        -X POST "http://kong:8000/auth/v1/token?grant_type=password" \
        -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
        -d '{"email":"<player-email>","password":"<their current password>"}'
      ```
      **✅** success = JSON with `access_token` + `refresh_token` (re-auth is
      expected — JWT secrets differ from managed; the bcrypt password check is
      what we're proving). _(T013)_
- [ ] 🐧 **RLS spot-check** — a query as `authenticated` respects policy like
      prod (e.g. a member sees their campaign rows; an outsider doesn't).
- [ ] 🤖 Finalize this runbook (fill Phase D timing/date) +
      `verification-checklist.md`; update `infra/backup-restore-runbook.md`
      (physical method) and `infra/README.md`. _(T014)_

---

## Re-running the migration (repeatability)

The CLI dump is idempotent for DDL, but `data.sql` would **double** rows if
loaded again into a non-empty DB. So a clean repeat = **wipe-and-reload**, which
is just the physical restore path pointed at a fresh start:

```bash
# wipe self-hosted data → fresh empty stack → re-run Phase C
docker compose -f <COMPOSE_DIR>/docker-compose.yml down
sudo rm -rf <COMPOSE_DIR>/volumes/db/data
docker compose -f <COMPOSE_DIR>/docker-compose.yml up -d   # entrypoint re-inits empty
# wait healthy, then redo Phase C (dry-run → fix → final → resync)
```

(No separate idempotent migration script — we reuse the physical "back to a
clean slate" mechanic. research R7 / deferred Clarify #4.)

---

## Invariant (every phase)

managed Supabase, prod, and the app are **never touched** — managed is read-only
(dump source) and stays the source of truth until cutover (027). Nothing here
changes env / DNS / app config.
