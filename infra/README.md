# infra/

Cross-project, **transferable** infrastructure artifacts: runbooks, scripts,
and configs that describe **the box and shared services**, not this specific
application.

## Why this folder is separate

`mat-ucheniya` is currently the largest, most complex project — so the
self-hosting work starts here. But some of it isn't really about *this app*;
it's about the server every future project will share. Keeping the transferable
pieces physically separated from app-specific specs means the eventual carve-out
into a dedicated `infra` repo is a clean copy-paste, not an archaeology dig.

| Lives here (`infra/`) | Lives in `.specify/specs/` |
|---|---|
| Server + PaaS setup (spec-023 runbook) | Self-hosted Supabase for *this app* (024) |
| Backup & restore-drill runbook (025) | Data + `auth.users` migration (026) |
| Cloudflare R2 object-storage runbook (later) | Cutover for *this app* (027) |
| Reverse-proxy / SSL / hardening notes | App features (022 mobile, portraits, …) |

## There is no "infra service" to plug into

The "shared infra" is just three things:

1. **One box** (Hetzner CX33 candidate).
2. **Dokploy** on it — multi-project by nature; a second project = add it to the
   same Dokploy dashboard.
3. **One Cloudflare R2 account** — one bucket per project, each with its own
   scoped token.

Each project keeps its **own backend** (its own Supabase instance / Postgres,
its own auth pool, its own RLS, its own R2 bucket). Nothing is a shared monolith
that everything reaches into. "Connecting a new project" = deploy it under the
same Dokploy + give it its own DB + its own bucket.

## Status (chat 83, 2026-06-02)

`server-paas-runbook.md` (023) + `backup-restore-runbook.md` (025) written;
R2 runbook comes later (portraits). Decisions locked so far:

- **PaaS: Dokploy.**
- **Object storage: Cloudflare R2** (managed, even though the rest is
  self-hosted — blobs + image delivery are the one workload a single box is the
  wrong tool for). Set up **later**, as the opening step of the portraits
  feature (first image consumer), after the mobile MVP.

## Division of labor

Claude can't SSH into the server. Claude produces the artifacts here (runbooks,
scripts, compose files, drill procedures); the operator (Andrey + Леша) runs
them and pastes logs back for debugging. The hands-on ops reps are the point.

## Planned contents

- ✅ `server-paas-runbook.md` — provision + harden VPS, install Dokploy, SSL,
  deploy `mat-ucheniya` staging (from spec-023 Plan). **Written.**
- ✅ `backup-restore-runbook.md` — automated off-box backups + verified
  restore drill (spec-025). **Written** (+ `backup.sh`, `restore.sh`,
  `rclone.conf.example`). The drill itself is run by the operator on the box.
- `r2-object-storage-runbook.md` — R2 account, bucket-per-project, scoped
  tokens, presigned-upload + serve helper, custom domain + transforms
  (written with the portraits feature).
