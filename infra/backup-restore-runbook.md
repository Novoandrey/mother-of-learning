# Runbook: Backups & Restore Drill (spec-025)

Executable steps for automated off-box backups + a verified restore drill of the
self-hosted Supabase from 024. **Operator (Andrey + Леша) runs these on the box;
Claude can't SSH in.** Paste errors/logs back to Claude for debugging. Started in
`.specify/specs/025-backups-restore-drill/`; the backup/restore **method** was
finalized in spec-026.

> **Method = PHYSICAL (cold-copy), since 026.** The original 025 logical
> `pg_dumpall` path was abandoned: the drill proved it can't back up self-hosted
> Supabase — under `postgres` (superuser stripped) the dump misses
> `supabase_admin`-owned tables (`auth.users` with password hashes), and a reload
> conflicts on ownership + duplicate `schema_migrations` (Supabase cli#3532).
> `backup.sh`/`restore.sh` now stop the db, tar/untar the on-disk data directory
> (+ the `db-config` pgsodium-key volume), and swap it back. The R2/rclone
> pipeline, rotation, cron, and rollback are unchanged from 025. **Re-proven on
> REAL data 2026-06-07 (chat 86): stop → healthy in ~20 s.**

Steps 1–2 + 4–5 (R2 bucket, rclone, cron, rotation) are method-agnostic and
still apply as written. Steps 3 (backup) and 6 (restore drill) below are the
physical versions.

Conventions:
- Scripts live in this folder (`infra/backup.sh`, `infra/restore.sh`); deploy a
  copy to the box (e.g. `/opt/infra/`).
- `<COMPOSE_DIR>` = the `supabase/docker` clone on the box (from 024). Both
  scripts require it: `sudo COMPOSE_DIR=<COMPOSE_DIR> /opt/infra/backup.sh`.
- Container `supabase-db`. `pg_isready`/connection health uses `postgres`; reads
  of `auth.*` use the real superuser **`supabase_admin`** (`postgres` had
  superuser stripped on self-hosted Supabase).
- Backups go to R2 bucket `mat-ucheniya-backups` (`daily/` + `weekly/`), as a
  pair per run: `<ts>.data.tar.gz` + `<ts>.dbconfig.tar.gz`.
- Run docker/log steps with `sudo` as needed.

---

## Step 0 — Prerequisites

- [ ] 024 stack is up and healthy on the box (`docker ps` → `supabase-db` etc.).
- [ ] You can reach Cloudflare dashboard (R2 is enabled on the account).
- [ ] Decide schedule/timezone (default: daily 03:00 UTC).

## Step 1 — R2 bucket + scoped token (task T001)

- [ ] Cloudflare dashboard → **R2** → **Create bucket** → name
      `mat-ucheniya-backups` (location: automatic/EU is fine).
- [ ] R2 → **Manage R2 API Tokens** → **Create API token**:
      - Permissions: **Object Read & Write**
      - **Scope to a specific bucket** → `mat-ucheniya-backups` (not account-wide)
- [ ] Note the three values: **Access Key ID**, **Secret Access Key**, and your
      **Account ID** (the endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
      Keep them off git — they go only into rclone.conf on the box (Step 2).

## Step 2 — rclone on the box (tasks T002 → T003)

- [ ] Install a current rclone (apt's can be old):
      ```bash
      curl https://rclone.org/install.sh | sudo bash
      rclone version
      ```
- [ ] Create the config from the template and fill in Step 1 values:
      ```bash
      mkdir -p ~/.config/rclone
      cp /opt/infra/rclone.conf.example ~/.config/rclone/rclone.conf
      # edit: access_key_id, secret_access_key, endpoint(<ACCOUNT_ID>)
      nano ~/.config/rclone/rclone.conf
      ```
      (Remote name must stay `r2` to match the scripts. The template already
      includes `no_check_bucket = true` — required for bucket-scoped tokens,
      which can't create or head buckets.)
- [ ] **Make the config readable by root** — cron (Step 4) and `sudo` run the
      backup as root, so the config must live in root's home too, not only yours:
      ```bash
      sudo mkdir -p /root/.config/rclone
      sudo cp ~/.config/rclone/rclone.conf /root/.config/rclone/rclone.conf
      ```
- [ ] **✅ check — access works** (scoped token: test INSIDE the bucket — NOT
      `rclone lsd r2:`, which needs account-level ListBuckets and returns 403):
      ```bash
      echo hello > /tmp/t.txt
      rclone copy /tmp/t.txt r2:mat-ucheniya-backups/_probe/
      rclone ls r2:mat-ucheniya-backups/_probe/   # shows "6 t.txt"
      rclone delete r2:mat-ucheniya-backups/_probe/
      rm /tmp/t.txt
      ```

## Step 3 — Deploy backup.sh + first manual run

- [ ] Copy the scripts to the box and make them executable:
      ```bash
      sudo mkdir -p /opt/infra && sudo cp backup.sh restore.sh rclone.conf.example /opt/infra/
      sudo chmod +x /opt/infra/backup.sh /opt/infra/restore.sh
      ```
- [ ] **Manual run** (physical = brief db stop; needs COMPOSE_DIR):
      ```bash
      sudo COMPOSE_DIR=<COMPOSE_DIR> /opt/infra/backup.sh
      ```
- [ ] **✅ check — backup pair landed and is valid:**
      ```bash
      # uploaded, non-empty — expect a .data.tar.gz AND a .dbconfig.tar.gz:
      rclone lsf r2:mat-ucheniya-backups/daily/ | tail
      # pull the newest data tar back and verify integrity:
      rclone copy "r2:mat-ucheniya-backups/daily/$(rclone lsf r2:mat-ucheniya-backups/daily/ | grep '\.data\.tar\.gz$' | sort | tail -1)" /tmp/chk/
      f=$(ls /tmp/chk/*.data.tar.gz); gzip -t "$f" && echo "gzip OK"
      tar -tzf "$f" | grep -m1 '^data/PG_VERSION$' && echo "data dir present"
      rm -rf /tmp/chk
      ```
      Expect: a timestamped `<ts>.data.tar.gz` + `<ts>.dbconfig.tar.gz` pair,
      `gzip OK`, and the Postgres data dir inside (the byte-exact cluster —
      roles, `auth.users` hashes, everything — rides along in the data files).
- [ ] Tail the log: `tail -n 20 /var/log/supabase-backup.log`.

## Step 4 — Cron schedule (task T007)

- [ ] Install a daily job (03:00 UTC). As root:
      ```bash
      cat >/etc/cron.d/supabase-backup <<'CRON'
      # m h dom mon dow user  command
      0 3 * * * root /opt/infra/backup.sh >> /var/log/supabase-backup.log 2>&1
      CRON
      systemctl restart cron     # (or: service cron reload)
      ```
- [ ] **✅ check:** `systemctl status cron` is active; the job is listed
      (`cat /etc/cron.d/supabase-backup`). Next morning, confirm a fresh entry
      in the log and a new file in `daily/`.

## Step 5 — Rotation check (task T008)

Rotation is built into `backup.sh` (prunes `daily/` >30d, `weekly/` >28d). To
verify without waiting a month, upload a probe with an old modtime and confirm
the prune removes it:

- [ ] ```bash
      echo old > /tmp/old.txt
      touch -d '40 days ago' /tmp/old.txt
      rclone copy /tmp/old.txt r2:mat-ucheniya-backups/daily/   # rclone keeps modtime
      rclone lsl r2:mat-ucheniya-backups/daily/                 # old.txt shows a 40d-old time
      rclone delete --min-age 30d r2:mat-ucheniya-backups/daily/
      rclone ls r2:mat-ucheniya-backups/daily/                 # old.txt gone; recent dumps stay
      rm /tmp/old.txt
      ```
- [ ] **✅ check:** the 40-day-old probe is gone, the recent timestamped dump(s)
      remain.

## Step 6 — Restore drill «снёс → поднял» (physical)

The drill replaces the live DB with the one from a backup and brings it back.
`restore.sh` already: pulls the newest `.data.tar.gz` (+ sibling `.dbconfig.tar.gz`)
→ `gzip -t` + free-space guard → stops the stack and moves the data-dir aside
(`…/data.old`, the way back) → extracts the tar in its place → restores the
pgsodium-key volume → brings the stack up → health-checks. Since the data-dir is
non-empty after extraction, the entrypoint skips re-init (no role/
`schema_migrations` conflicts — the reason the logical method failed).

- [ ] Run it (time it):
      ```bash
      time sudo COMPOSE_DIR=<COMPOSE_DIR> /opt/infra/restore.sh
      ```
- [ ] **✅ check — stack healthy + real data after restore:**
      ```bash
      docker ps                                            # supabase-* up/healthy
      docker exec supabase-db pg_isready -U postgres -h localhost
      docker exec supabase-db psql -U postgres -c '\dn'    # auth, public… present
      docker exec supabase-db psql -U postgres -d postgres -c \
        "select rolname from pg_roles where rolname in
         ('anon','authenticated','service_role') order by 1;"
      docker exec supabase-db psql -U supabase_admin -d postgres -tAc \
        'select count(*) from auth.users;'                 # > 0 on real data
      ```
      Plus: Auth + REST containers reach healthy (give them a few seconds to
      reconnect after the DB restart). The script prints all of this itself.
- [ ] **✅ record the time** `stop → healthy` (the `time` output). **Measured
      ~20 s on real data (`real 0m19.796s`, chat 86)** — the downtime metric for 027.
- [ ] **If the drill is good:** drop the way-back copy:
      ```bash
      sudo rm -rf <COMPOSE_DIR>/volumes/db/data.old
      ```
- [ ] **Rollback (if the restore is bad) — should take < 1 min:**
      ```bash
      docker compose -f <COMPOSE_DIR>/docker-compose.yml down
      sudo rm -rf <COMPOSE_DIR>/volumes/db/data
      sudo mv <COMPOSE_DIR>/volumes/db/data.old <COMPOSE_DIR>/volumes/db/data
      docker compose -f <COMPOSE_DIR>/docker-compose.yml up -d
      ```

---

## Migration: managed → self-hosted (spec-026)

Loading **real prod data + `auth.users`** from managed into self-hosted is a
separate, app-specific procedure (dump via `supabase db dump` → replica-restore
→ resync sequences → verify), documented in
`.specify/specs/026-data-auth-migration/migrate-from-managed.md`. It uses the
physical backup/restore above only for its drill step (Phase D) and for
wipe-and-reload repeatability. Executed green 2026-06-07 (chat 86).

---

## Drill checklist

- [x] Backup pair uploaded to `daily/`, non-empty, timestamped (`.data.tar.gz` + `.dbconfig.tar.gz`)
- [x] `gzip -t` passes; Postgres data dir present in the tar
- [x] Cron daily active; log shows runs (025, method-agnostic)
- [x] Rotation prunes old, keeps recent (025, method-agnostic)
- [x] Restore: stop → swap data-dir → up → healthy
- [x] `\dn` schemas + Supabase roles present after restore
- [x] `auth.users` count > 0 after restore (real data)
- [x] Auth/REST healthy after restore
- [x] Way back (`data.old`) restores in < 1 min
- [x] **Time stop→healthy: ~20 sec** (`real 0m19.796s`)   **Date: 2026-06-07**

Checklist green on REAL data (chat 86): the operator has a tested, fast rollback
for the cutover (027).

---

## После spec-027 cutover: self-hosted = боевой

После cutover (027) этот self-hosted-стек на боксе держит **боевые** данные —
ночной cron-бэкап (`backup.sh`) и ротация (30/28) теперь защищают прод; менять
скрипты не нужно. Нюанс: физический cold-copy подразумевает краткую остановку
`db` — на боевом стеке это короткий **ночной** downtime (приемлемо для хобби-
кампании). Если нужен бэкап без downtime — вариант `pg_basebackup` (опция из
026). Грейс managed (~1–2 нед) — дополнительный эталон/откат, не замена бэкапам.
