# Runbook: Self-hosted Supabase (spec-024)

Executable steps for standing up an **empty, trimmed, parallel** Supabase
on the existing box. **Operator (Andrey + Леша) runs these on the server;
Claude can't SSH in.** Paste errors/logs back to Claude for debugging.
Tied to `.specify/specs/024-self-hosted-supabase/` (spec.md, plan.md,
research.md).

Builds on **023** (box hardened, Dokploy on `panel.theloopers.org`,
`staging.theloopers.org` live, box rescaled to CPX32 8 GB / 40 GB + 2 GB
swap). Run as `<user>` with `sudo` (root SSH is disabled per 023).

Conventions: `<domain>` = **theloopers.org**; Studio target =
`db.theloopers.org`; `<SERVER_IP>` = box public IP. Exact image tags &
trim rationale are in `research.md`.

Scope reminder: **no data, no backups, no cutover.** Prod managed Supabase
and the staging app stay untouched.

---

## Step 0 — Decide how Studio is reached

Both paths satisfy FR-005 (authenticated, encrypted channel) — pick one:
- **A — public HTTPS** on `db.theloopers.org` + basic-auth (Steps 5–6).
- **B — SSH tunnel** (simpler/safer; no public exposure), like 023 Step 4:
  `ssh -L 3000:localhost:<studio-host-port> <user>@<SERVER_IP>`. If you pick
  this, **skip Steps 5–6** (and SC-002 is met via the tunnel, not a subdomain).

## Step 1 — Get the official compose on the box

```bash
# as <user>, in a working dir (e.g. /home/<user>)
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```
This is the official **stable** compose; it ships supporting files
(`volumes/api/kong.yml`, seed SQL, etc.) we need. We trim it and override
the db image below.

## Step 2 — Generate fresh secrets (FR-008)

```bash
openssl rand -base64 32   # -> POSTGRES_PASSWORD
openssl rand -base64 32   # -> JWT_SECRET
openssl rand -base64 32   # -> PG_META_CRYPTO_KEY  (official .env.example ships an insecure default — override it)
```
`ANON_KEY` and `SERVICE_ROLE_KEY` are **JWTs derived from `JWT_SECRET`** —
generate them with Supabase's key generator (self-hosting/docker docs →
"Generate API keys") and paste into `.env`. Choose `DASHBOARD_USERNAME` /
`DASHBOARD_PASSWORD` too.

⚠️ **Fresh values, NOT copied from prod.** Final home for secrets is
**Dokploy Environment** (Q4), not git. Set in `.env` (API stays internal
in 024; the real public API URL is a 027 concern):
```
POSTGRES_PASSWORD=...
JWT_SECRET=...
ANON_KEY=...
SERVICE_ROLE_KEY=...
PG_META_CRYPTO_KEY=...
DASHBOARD_USERNAME=...
DASHBOARD_PASSWORD=...
SUPABASE_PUBLIC_URL=https://db.theloopers.org
SITE_URL=https://db.theloopers.org
API_EXTERNAL_URL=http://kong:8000
```
(SMTP left at defaults — no real email flows on an empty instance;
configure at 026/027.)

**Verify `.env` covers every var the (trimmed) compose references.** Step 1
`cp .env.example .env` already copies the full official set, but confirm
nothing's missing after editing (do this **after** Step 3):
```bash
comm -23 \
  <(grep -oE '\$\{[A-Z0-9_]+' docker-compose.yml | tr -d '${' | sort -u) \
  <(grep -oE '^[A-Z0-9_]+' .env | sort -u)
# Prints vars referenced but absent from .env → should be empty.
# Anything printed that has a ${VAR:-default} in the compose is fine; the rest must be set.
```

## Step 3 — Trim the stack + override db (the edits)

Edit `docker/docker-compose.yml`:

**a) Override db image to PG17** (default ships PG15 `15.8.1.085`; prod is
PG17, and a PG17 dump can't restore into PG15):
```yaml
db:
  image: supabase/postgres:17.6.1.132   # any public 17.6.1.x = PostgreSQL 17.6 (same as prod's .104; 4th segment is the Supabase image build, not the PG patch) → restore-compatible. Pick the latest 17.6.1.x at hub.docker.com/r/supabase/postgres/tags
```
> ⚠️ **Must be done BEFORE the first `up`.** Postgres initializes its data
> dir on first boot to the image's **major** version. Here the data dir is a
> **bind mount** at `volumes/db/data` (not a named volume). If the stack was
> already started on PG15, that dir is a PG15 cluster and **PG17 will refuse
> to start on it**. It's empty, so wipe and recreate:
> ```bash
> docker compose down                # stop (named vols db-config/deno-cache go with -v; bind mounts don't)
> sudo rm -rf volumes/db/data        # remove the PG15-initialized data dir (root-owned by the container)
> # then set the PG17 image (above) and `up` fresh — the initdb scripts re-run on PG17
> ```
> **Never carry a mismatched data dir forward** — tracking down where a
> broken volume came from later is painful.

**b) Remove unused services** (delete whole blocks): `realtime`,
`storage`, `imgproxy`, `functions`, `analytics`, `vector`, `supavisor`.
> Remove the **service blocks only**. **Leave the `db` service's `volumes:`
> init scripts** (`roles.sql`, `jwt.sql`, `realtime.sql`, `_supabase.sql`,
> `webhooks.sql`, `pooler.sql`, `logs.sql`): `roles.sql`/`jwt.sql` are
> **mandatory** (create the supabase roles GoTrue/PostgREST log in as), and
> the rest seed schemas at DB init — which actually helps parity (Step 9).

**c) Fix `studio`** — it `depends_on: analytics` (now gone), so it would
stay unhealthy and Traefik would skip it:
- delete the `depends_on: analytics:` block under `studio`
- set `NEXT_PUBLIC_ENABLE_LOGS: "false"` and drop the `LOGFLARE_*` /
  `LOGFLARE_URL` lines (Studio "Logs" UI goes away — expected, observability
  is out of scope for 024)

**d) Remove host port publishing** (Q2=B / FR-006 / FR-007; and Docker
bypasses ufw, as 3000 did in 023):
- under `kong`: delete the `ports:` block (`${KONG_HTTP_PORT}:8000`,
  `${KONG_HTTPS_PORT}:8443`) — Kong stays reachable only inside the Docker
  network
- under `db`: if a `ports:` block publishes `5432`, delete it

**e) Optional hardening** — relax `kong.depends_on.studio` to
`condition: service_started` (or remove) so the gateway isn't gated on the
dashboard; drop orphan volumes (`deno-cache`).

Sanity: `docker compose config` parses with no missing-service /
missing-volume errors.

## Step 4 — Bring the stack up via Dokploy (Q1=A)

Recommended: **Git compose source** (brings the `volumes/` support files):
- [ ] Push the edited `supabase/docker` contents to a repo Dokploy can read
      (**do NOT commit `.env`**).
- [ ] ⚠️ Confirm `.env` is git-ignored before pushing (the official
      `docker/.gitignore` covers it — verify: `git check-ignore docker/.env`
      should print the path). Honors FR-008 (secrets not in git).
- [ ] Dokploy → New Project → **Compose** → Git source → compose path =
      the docker dir.
- [ ] Put the secrets from Step 2 in the compose **Environment** tab.
- [ ] Deploy.

(Raw-YAML paste also exists, but it has no repo context for the relative
`./volumes/...` files Kong needs — prefer Git.)

Wait for healthy: **db, auth, rest, kong, studio, meta**.

✅ **SC-001 check:** `docker compose ps` shows db, auth, rest, kong, studio,
meta healthy; realtime/storage/imgproxy/functions/analytics/vector/supavisor
absent.

## Step 5 — Studio over HTTPS  [skip if SSH tunnel]

- [ ] Cloudflare DNS: A record `db` → `<SERVER_IP>`, **DNS-only (grey cloud)**.
- [ ] Dokploy → compose app → **Domains** → add `db.theloopers.org`,
      **service = studio**, **port = 3000**, enable **HTTPS (Let's Encrypt)**.
- [ ] **Preview Compose** to confirm labels target `studio:3000`.

## Step 6 — Basic-auth in front of Studio (FR-005)  [skip if SSH tunnel]

Dokploy has **no basic-auth UI for compose services** — add a Traefik
file-provider middleware by hand:
```bash
htpasswd -nbB <studio-user> '<studio-pass>'      # bcrypt; copy the "user:$2y$..." line
sudo nano /etc/dokploy/traefik/dynamic/middlewares.yml
```
```yaml
http:
  middlewares:
    studio-auth:
      basicAuth:
        users:
          - "<paste the htpasswd line>"
```
- [ ] Dokploy → Domains → `db.theloopers.org` → **Middlewares** → reference
      `studio-auth`.
- [ ] `https://db.theloopers.org` prompts for credentials, then loads Studio
      with a valid cert.

✅ **SC-002 check:** Studio on `db.theloopers.org` over HTTPS, behind auth.

## Step 7 — Verify API internal-only + 5432 closed (FR-006/FR-007)

From your **laptop** (not the box):
- [ ] `curl -v https://db.theloopers.org/rest/v1/ --connect-timeout 5` —
      that host routes to **Studio**, not Kong, so:
      - **Expected (pass):** `401` Basic Auth challenge, or `404`/HTML/Next
        from Studio.
      - **Unacceptable (fail):** PostgREST JSON or its headers / any real
        REST API response — would mean the API is exposed. Investigate.
- [ ] `Test-NetConnection <SERVER_IP> -Port 8000` (Win) /
      `curl -v http://<SERVER_IP>:8000 --connect-timeout 5` → **closed/timeout**.
      If reachable, a `ports:` slipped through (Step 3d) → remove it.
- [ ] Port 5432: `Test-NetConnection <SERVER_IP> -Port 5432` / curl →
      **closed/timeout**.

API works **inside** the network (proof), on the box:
```bash
docker exec supabase-kong curl -s -o /dev/null -w "%{http_code}\n" http://auth:9999/health   # GoTrue
docker exec supabase-kong curl -s -o /dev/null -w "%{http_code}\n" http://rest:3000/          # PostgREST
```

✅ **SC-003/SC-004 check:** Auth/REST answer inside; 8000 & 5432 unreachable
from outside; port scan shows only 22/80/443.

## Step 8 — Confirm Realtime/Edge truly unused (FR-002)

Justifies the Step 3b removal. In the app repo (`mat-ucheniya`):
> ✅ Already audited in-sandbox (chat 84): **0 hits** across 260 ts/tsx
> files; the app uses only PostgREST (`.from`/`.rpc`) + `auth.*`. Re-run on
> the box to double-check if you like:
```bash
grep -rn "\.channel(\|removeChannel\|postgres_changes\|\.broadcast\|\.functions\.invoke(\|/functions/v1/" \
  --include="*.ts" --include="*.tsx" .
```
- [ ] No real matches → exclusion confirmed. Any genuine usage → re-add that
      service to the compose and redeploy.

## Step 9 — Parity vs prod (FR-009..011) — the 026 de-risk

On the **self-hosted** db (box):
```bash
docker exec -it supabase-db psql -U postgres -c "show server_version;"
docker exec -it supabase-db psql -U postgres -c "\dx"
docker exec -it supabase-db psql -U postgres -c "\dn"
```
Run the same three on **prod** (Supabase SQL editor, or psql via the Session
pooler URI). Compare:
- [ ] `server_version`: both 17.x (self-hosted ≥ prod patch).
- [ ] `\dx`: every prod extension exists self-hosted (pgcrypto, uuid-ossp,
      pgjwt, pg_graphql, pgsodium, …). Install missing (`create extension …`)
      and re-check. **If `create extension` fails (not bundled in the PG17
      image):** record it as a **blocker for 026** and find a source (another
      image / build it) — don't silently skip it.
- [ ] `\dn`: **compare by future restore scope, not strict equality.** Some
      removed-product schemas still appear self-hosted because db init scripts
      create them (e.g. `realtime` via `realtime.sql`), while others won't
      (e.g. `storage`, created by the storage service we dropped). Classify
      each diff:
      - **blocker** — the schema is in the future dump/restore scope (e.g.
        `auth`, `public`, `graphql`) and is missing self-hosted;
      - **acceptable divergence** — the product is unused and the schema is
        excluded from restore scope (e.g. `storage`, `realtime`).
      Record the classification in `parity-report.md`.
- [ ] Save all six outputs into `parity-report.md`.

✅ **SC-006/SC-007 check:** extensions/schemas parity proven; PG version
compatible & recorded → 026 `pg_restore` won't trip on a missing extension.

## Step 10 — Reboot resilience (SC-005)

```bash
sudo reboot
```
After reboot:
- [ ] all target containers healthy (`docker compose ps`)
- [ ] Studio loads (`https://db.theloopers.org`)
- [ ] Auth inside: `docker exec supabase-kong curl -s -o /dev/null -w "%{http_code}\n" http://auth:9999/health`
- [ ] REST inside: `docker exec supabase-kong curl -s -o /dev/null -w "%{http_code}\n" http://rest:3000/`
- [ ] Postgres inside: `docker exec supabase-db pg_isready -U postgres`
- [ ] 5432 still closed from outside

✅ **SC-005 check:** stack self-starts; all probes pass post-reboot.

## Step 11 — Confirm prod + staging untouched (SC-008)

The new instance is parallel; 023's deploy must be unaffected.
- [ ] `https://staging.theloopers.org` still loads and authenticates (it
      still points at **managed** Supabase, not the new instance).
- [ ] Prod managed Supabase still reachable (Dashboard up; a read in its SQL
      editor works). Nothing in 024 wrote to or repointed prod.

✅ **SC-008 check:** prod managed Supabase + `staging.theloopers.org` keep
working; the self-hosted instance didn't affect them.

---

## Done = ready for 025/026

All ✅ → empty, healthy, trimmed self-hosted Supabase on `db.theloopers.org`,
API internal-only, parity with prod proven. Prod managed Supabase +
`staging.theloopers.org` untouched. Next: **025** (backups & restore drill on
this empty stack), then **026** (schema + data + `auth.users`).

## If something breaks

Paste into chat: failing command + full output, `docker compose ps`,
relevant `docker compose logs <svc>`, `ufw status`. Claude diagnoses and
amends this runbook.
