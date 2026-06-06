# Runbook: Backups & Restore Drill (spec-025)

Executable steps for automated off-box backups + a verified restore drill of the
self-hosted Supabase from 024. **Operator (Andrey + Леша) runs these on the box;
Claude can't SSH in.** Paste errors/logs back to Claude for debugging. Tied to
`.specify/specs/025-backups-restore-drill/`.

**This whole runbook runs against the EMPTY 024 stack** — no app data at risk.
The point is the ops muscle: prove backups land off-box and that a restore
actually works, so the cutover (027) has a tested rollback.

Conventions:
- Scripts live in this folder (`infra/backup.sh`, `infra/restore.sh`); deploy a
  copy to the box (e.g. `/opt/infra/`).
- `<COMPOSE_DIR>` = the `supabase/docker` clone on the box (from 024).
- Container `supabase-db`, superuser `postgres`, `PGPASSWORD` already set inside
  the container (so `docker exec … pg_dumpall` needs no password).
- Backups go to R2 bucket `mat-ucheniya-backups` (`daily/` + `weekly/`).
- Run docker/log steps with `sudo` as needed.

> ⚠ Step 6 (restore strategy) is a **draft** until the drill is run — the init
> conflict is picked there, then this runbook + `restore.sh` are finalized.

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

## Step 3 — Deploy backup.sh + first manual run (tasks T004 → T005)

- [ ] Copy `backup.sh` to the box and make it executable:
      ```bash
      sudo mkdir -p /opt/infra && sudo cp backup.sh rclone.conf.example /opt/infra/
      sudo chmod +x /opt/infra/backup.sh
      ```
- [ ] **Manual run** (sudo for docker + /var/log):
      ```bash
      sudo /opt/infra/backup.sh
      ```
- [ ] **✅ check — backup landed and is valid:**
      ```bash
      # uploaded, non-empty:
      rclone ls r2:mat-ucheniya-backups/daily/
      # pull it back and verify integrity + roles:
      rclone copy "r2:mat-ucheniya-backups/daily/$(rclone lsf r2:mat-ucheniya-backups/daily/ | sort | tail -1)" /tmp/chk/
      f=$(ls /tmp/chk/*.sql.gz); gunzip -t "$f" && echo "gzip OK"
      gunzip -c "$f" | grep -m1 'CREATE ROLE' && echo "roles present"
      rm -rf /tmp/chk
      ```
      Expect: a `*.sql.gz` with a timestamped name, `gzip OK`, and at least one
      `CREATE ROLE` (the Supabase roles — `anon`, `authenticated`,
      `service_role`, `supabase_*` — are in the dump).
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

## Step 6 — Restore drill «снёс → поднял» (tasks T009 → T010 → T011)

> ⚠ DRILL FINDING (chat 85): this logical-dump restore is NOT the path for
> Supabase. It proved the stop→restore→healthy + rollback mechanics (18s) on the
> empty stack, but a logical reload can't restore real Supabase data — the dump
> under `postgres` misses supabase_admin-owned tables (auth.users), and the
> reload conflicts on ownership + duplicate schema_migrations (Supabase cli#3532).
> **026 switches the backup method to physical** (cold data-dir copy vs
> pg_basebackup). The R2/rclone pipeline, rotation, cron, and rollback all carry
> over; only the dump/restore core changes.

The drill destroys the DB and brings it back from a backup. `restore.sh` already:
pulls the latest dump → `gunzip -t` + free-space guard → stops the stack and
moves the data-dir aside (`…/data.old`, the way back) → brings up a fresh stack →
reloads the dump → health-checks.

- [ ] Deploy and run (time it):
      ```bash
      sudo cp restore.sh /opt/infra/ && sudo chmod +x /opt/infra/restore.sh
      time sudo COMPOSE_DIR=<COMPOSE_DIR> /opt/infra/restore.sh
      ```
- [ ] **✅ check — stack healthy after restore:**
      ```bash
      docker ps                                            # supabase-* up/healthy
      docker exec supabase-db pg_isready -U postgres -h localhost
      docker exec supabase-db psql -U postgres -c '\dn'    # auth, storage, public… present
      docker exec supabase-db psql -U postgres -d postgres -c \
        "select rolname from pg_roles where rolname in
         ('anon','authenticated','service_role') order by 1;"
      ```
      Plus: Auth + REST containers reach healthy (give them a few seconds to
      reconnect after the DB restart).
- [ ] **✅ record the time** `stop → healthy` (the `time` output). Target < 5 min
      on the empty stack — this is the future downtime metric for 027.
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

## Drill checklist (US3#2 — fill in on the dry-run)

- [ ] Backup uploaded to `daily/`, non-empty, timestamped
- [ ] `gunzip -t` passes; `CREATE ROLE` present in dump
- [ ] Cron daily active; log shows runs
- [ ] Rotation prunes old, keeps recent
- [ ] Restore: stop → fresh up → reload → healthy
- [ ] `\dn` schemas + Supabase roles present after restore
- [ ] Auth/REST healthy after restore
- [ ] Way back (`data.old`) restores in < 1 min
- [ ] **Time stop→healthy: ____ sec**   **Date: ____**

When the checklist passes, slice 025 is done and the operator has a tested
rollback for the cutover (027).
