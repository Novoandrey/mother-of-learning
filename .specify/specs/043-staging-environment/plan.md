# Implementation Plan: Staging environment (spec-043)

**Spec**: `./spec.md` · **Phase**: HOW · **Created**: 2026-06-11 (chat 94)

## Recap

Bring back staging: the old managed Supabase project (downgraded to free)
becomes the staging DB; a second Dokploy app serves `staging.theloopers.org`
from the `staging` branch; shipping to `main` goes PR-only with the gate
visible pre-merge; staging DB is an on-demand snapshot of prod (one command,
prod → staging only); keep-alive every 5 days. Q0–Q7 fixed in spec.

## US1 — Staging DB (P1): approach

**Project**: reuse the managed project — same ref, URL `https://<ref>.supabase.co`,
same keys. One-time provisioning (🌐, folds spec-027 T025's Supabase half):
verify org free-tier slot (R3) → Dashboard: downgrade subscription to Free →
Auth settings: Site URL = `https://staging.theloopers.org`, password auth only,
email confirmations off (accounts arrive via prod copy) → collect URL/anon/
service-role for Dokploy + GH secrets. Stale pre-cutover data dies at first
refresh.

**Refresh — the «кнопка»** (`infra/staging-refresh.sh`, versioned in repo,
deployed to the box; any dev runs it over SSH in one command):

```
🖥️  ssh <box> 'bash /opt/mat-ucheniya/staging-refresh.sh'
```

Internals (runs ON the box — the dump source is the local prod PG):
1. `pg_dump` prod **`public`** schema+data (`--clean --if-exists`) from the
   local self-hosted Postgres.
2. `pg_dump` prod **`auth` data-only**, tables `auth.users` +
   `auth.identities` (cloud owns auth DDL — GoTrue migrations; we copy rows
   only; R5 checks column skew on first run).
3. `psql` → staging: restore public (drop/recreate from dump); truncate
   `auth.users CASCADE` → insert dumped rows. Devs then log in with prod
   passwords (bcrypt hashes travel).
4. Connection: direct `db.<ref>.supabase.co:5432` is **IPv6-only** on free
   tier → use it if the box has v6 (R2), else the **session pooler** DSN
   (psql-compatible; the old "pooler blocks pg_dump" lesson doesn't bite —
   we dump locally, only *restore* goes through the wire).
5. **Direction guard (FR-002)**: staging DSN lives only in a root-only env
   file on the box (`/root/.config/mat-ucheniya/staging.env`); the script
   takes **no target argument** and asserts the DSN host contains the staging
   project ref before touching anything. No staging→prod tooling exists.

`db_max_rows` stays at the cloud default (1000) — the app paginates since the
spec-018 lesson; noted in the runbook.

## US2 — Staging app (P1): approach

**R1 first**: the 027 decommission checklist items for the staging Dokploy app
and the Cloudflare `staging` A-record were never ticked — check whether both
survived cutover. If yes: reconfigure in place; if no: recreate per
`infra/server-paas-runbook.md`.

Config either way: source branch **`staging`**; env trio = cloud staging
values; 🔴 both `NEXT_PUBLIC_*` duplicated into **Build-time Arguments**
(023 грабли); domain `staging.theloopers.org`, container port 3000. Separate
app/container — prod stays untouched in both directions.

## US3 — Pipelines (P2): approach

Three workflow files — **all committed by Andrey 🧑** (bot PAT lacks
`workflow` scope):

1. **`deploy-staging.yml`** — copy of `deploy.yml`: `on: push → staging`,
   same `paths-ignore`, same gate (lint + tsc + vitest), deploy job calls the
   same Dokploy API with `secrets.DOKPLOY_STAGING_APP_ID`; concurrency group
   `deploy-staging`. The 028 Cloudflare WAF skip-rule is path-based
   (`/api/application.deploy`) → already covers the second app.
2. **`ci-pr.yml`** — `on: pull_request → main`, gate only, no deploy. Red PR
   visible before merge (FR-009). Stable job name for an optional
   required-check later.
3. **`staging-keepalive.yml`** — `schedule: cron '0 9 */5 * *'` (runs the
   1st/6th/…/31st — max gap 5 days < 7-day pause threshold): one `curl` to
   `$STAGING_SUPABASE_URL/rest/v1/<small-table>?select=id&limit=1` with the
   anon key. REST traffic counts as activity.

## US4 — Workflow, ruleset, docs (P2): approach

**Ruleset on `main`** (🧑 GitHub UI; repo is public → free): "Require a pull
request before merging", required approvals **0**, bypass list = **Repository
admin role**. Effect: Лёша/Никита (write) physically must PR; the bot PAT
authenticates as Novoandrey (admin) → Claude's meta/doc commits keep flowing
direct per Q7(b). The "admins direct-push only meta/docs, code goes via PR"
half is **convention**, written into the docs. No ruleset on `staging` —
force-push must stay open for resets.

**Claude PR flow**: branch `claude/<slug>` → push → open PR via API with the
bot PAT (R4: probe `pull-requests: write` as the first Implement task; if
missing, Andrey extends the token — one click). Human merges from the
Telegram PR-ping.

**Reset routine** (documented, any dev):

```
🖥️  git fetch && git checkout staging && git reset --hard origin/main \
      && git push --force-with-lease origin staging
```

**Docs**:
- `infra/staging-runbook.md` — provisioning (downgrade), refresh, reset,
  keep-alive, secrets map, db_max_rows note.
- `mat-ucheniya/AGENTS.md` — new "Shipping" section: feature branch → merge
  to `staging` (test) → **PR into `main`** (ship); staging is disposable;
  migration practice per Q5.
- `meta/claude-project-instructions.md` (FR-011) — flips **at Implement,
  together with the flow going live**: (a) clone line gets
  `<GITHUB_USERNAME>:<GITHUB_PAT>` placeholders; (b) new Shipping rules
  (code via PR, meta direct); (c) "Setup for a teammate" header — create a
  fine-grained PAT (this repo; Contents RW + Pull requests RW), paste file
  into your Claude project settings. Andrey re-syncs his settings copy and
  sends the file to Никита/Лёша.

## File structure (new / changed)

```
infra/staging-refresh.sh                      new   (+ deployed to box /opt/mat-ucheniya/)
infra/staging-runbook.md                      new
.github/workflows/deploy-staging.yml          new   🧑
.github/workflows/ci-pr.yml                   new   🧑
.github/workflows/staging-keepalive.yml       new   🧑
mat-ucheniya/AGENTS.md                        edit  (Shipping section)
meta/claude-project-instructions.md           edit  (universal + new flow)
.specify/specs/027-cutover-decommission/*     edit  (T025 closes via US1 provisioning)
```

## Secrets / config (operator enters; Claude never touches values)

| Where | Key | Value |
|---|---|---|
| GH secrets | `DOKPLOY_STAGING_APP_ID` | staging app id from Dokploy |
| GH secrets | `STAGING_SUPABASE_URL` / `STAGING_SUPABASE_ANON_KEY` | cloud project |
| Box (root-only) | `/root/.config/mat-ucheniya/staging.env` | staging DSN (direct v6 or session pooler) |
| Dokploy staging app | env trio + Build-time Arguments | cloud URL / anon / service-role |
| Cloud dashboard | Site URL, plan downgrade | 🌐 one-time |

## Integration points

- `deploy.yml` (prod) and `telegram-notifications.yml` untouched — PR pings
  are repo-wide already; `staging` pushes stay silent by design (028).
- spec-027 **T025**: its Supabase half **is** US1 provisioning; Vercel half
  executes per decommission-checklist as before. T025 ticks when US1 lands.
- Backups/R2: prod-only, unchanged. Staging is rebuildable by refresh — no
  backups by design.

## Out of scope (recap)

Per-PR previews; scheduled data sync; anonymization; required PR approvals;
staging for self-hosted-infra changes; staging monitoring.

## Verify-on-Plan items

- **R1** 🐧/🌐 Did the pre-cutover staging Dokploy app + Cloudflare `staging`
  A-record survive? (Checklist never ticked → likely yes.)
- **R2** 🐧 Box IPv6 reachability → direct DSN vs session pooler for restore.
- **R3** 🌐 Org free-project quota + current managed plan (downgrade path).
- **R4** Bot PAT `pull-requests: write` — probe at first Implement task.
- **R5** `auth.users`/`auth.identities` column parity (self-hosted GoTrue vs
  cloud) — checked by the first refresh run; script fails loudly on skew.
