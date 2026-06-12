# Staging runbook (spec-043)

Staging = second Dokploy app at **https://staging.theloopers.org** (branch
`staging`) + the old managed Supabase project downgraded to **free tier** as
the staging DB. Prod (self-hosted on the box) is never touched by anything
here. Shipping rules live in `mat-ucheniya/AGENTS.md` §Shipping.

## 1. One-time provisioning (🌐 operator)

Supabase Dashboard → the old managed project:
1. Org free-tier quota: ≤2 active free projects — make sure a slot is free.
2. **Subscription → downgrade to Free.** Do NOT delete the project (spec-043
   reuses it; spec-027 T025 wording was updated accordingly).
3. Auth → URL Configuration: Site URL = `https://staging.theloopers.org`.
   Auth → Providers: Email/password ON, **email confirmations OFF** (accounts
   arrive as a copy of prod; no mail flows on staging).
4. Collect for later steps: Project URL (`https://<ref>.supabase.co`),
   `anon` key, `service_role` key, **database password** (Settings →
   Database; reset it if lost), and the **session pooler** connection string
   (port **5432** — transaction mode 6543 won't survive psql restores).

## 2. Box setup (🐧 operator, one-time)

```bash
# psql client for the restore side
sudo apt-get update && sudo apt-get install -y postgresql-client

# IPv6 check (R2): direct db.<ref>.supabase.co:5432 is IPv6-only on free tier
curl -6 -s https://api64.ipify.org && echo " ← v6 OK" || echo "no IPv6 → use session pooler DSN"

# staging credentials, root-only
sudo mkdir -p /root/.config/mat-ucheniya
sudo tee /root/.config/mat-ucheniya/staging.env >/dev/null <<'EOF'
# direct (IPv6) DSN  ...or the session-pooler DSN (IPv4, port 5432)
STAGING_DB_URL=postgresql://postgres:<DB_PASSWORD>@db.<ref>.supabase.co:5432/postgres
STAGING_PROJECT_REF=<ref>
EOF
sudo chmod 600 /root/.config/mat-ucheniya/staging.env

# install the refresh script (repo is public → raw fetch)
sudo mkdir -p /opt/mat-ucheniya
sudo curl -fsSL \
  https://raw.githubusercontent.com/Novoandrey/mother-of-learning/main/infra/staging-refresh.sh \
  -o /opt/mat-ucheniya/staging-refresh.sh
sudo chmod 755 /opt/mat-ucheniya/staging-refresh.sh
```

If the DB password contains URL-special characters, percent-encode them in
the DSN.

## 3. Refresh — «кнопка» (any dev, any time)

```bash
ssh <box> 'sudo bash /opt/mat-ucheniya/staging-refresh.sh'
```

Copies prod → staging: full `public` (schema+data) + `auth.users`/
`auth.identities` rows (devs log in on staging with their prod passwords).
Prints ✅/❌ verification counts at the end. **There is no reverse direction**
— the script hard-guards against any DSN that looks like prod.

When to run: staging DB got messed up, schema drifted, or you want fresh data.
After an update of the script in the repo, re-run the `curl` install line
from §2.

## 4. Staging branch reset (any dev)

`staging` is disposable — never the source of truth:

```bash
git fetch && git checkout staging && git reset --hard origin/main \
  && git push --force-with-lease origin staging
```

Ship to `main` only via PRs of the feature branch (never merge `staging`
itself anywhere).

## 5. Pipelines & keep-alive

- `deploy-staging.yml` — push to `staging` → gate → Dokploy deploys the
  staging app (`DOKPLOY_STAGING_APP_ID`).
- `ci-pr.yml` — gate on every PR into `main`; red is visible before merge.
- `staging-keepalive.yml` — cron every ~5 days, one REST call with the anon
  key; free projects pause after ~7 idle days. If staging still ends up
  paused (e.g., secrets missing): Dashboard → Restore, ~1 click + a minute.

## 6. Secrets map

| Where | Keys |
|---|---|
| GitHub Actions secrets | `DOKPLOY_STAGING_APP_ID`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` |
| Box, root-only | `/root/.config/mat-ucheniya/staging.env` → `STAGING_DB_URL`, `STAGING_PROJECT_REF` |
| Dokploy staging app | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — 🔴 both `NEXT_PUBLIC_*` duplicated into **Build-time Arguments** |

## 7. Gotchas

- **IPv6**: direct `db.<ref>.supabase.co:5432` has no IPv4 on free tier; the
  session pooler (`...pooler.supabase.com:5432`) is the IPv4 path. The old
  "pooler blocks pg_dump" lesson doesn't apply — we dump locally and only
  *restore* over the wire.
- **`db_max_rows`**: cloud PostgREST clamps at 1000 rows; the app paginates
  since spec-018 — nothing to do, just don't be surprised by it in Studio.
- **R5 (auth column skew)**: if self-hosted GoTrue and cloud GoTrue schemas
  diverge, the refresh fails loudly at the auth-load step; fix = adjust the
  dumped column set in the script for the missing column.
- **PII**: staging holds real player emails + bcrypt hashes (decision Q1,
  spec-043) — keep the project's keys with the same care as prod's.
- Staging has **no backups by design** — it's rebuildable by §3 in minutes.
