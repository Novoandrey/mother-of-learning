# Feature Specification: Staging environment (spec-043)

**Feature Branch**: `043-staging-environment`
**Created**: 2026-06-11
**Status**: Done — staging live (tail: T017 SC-003 прогон тиммейтом)
**Origin**: IDEA-066 [P2] (backlog) — "Тест обновлений до мержа в main", deferred in chat 88.
**Depends on**: spec-023 (box + Dokploy), spec-027 (cutover; prod is self-hosted),
spec-028 (CI gate + Dokploy auto-deploy pattern).

> Three developers now push straight to `main`, which auto-deploys to prod with
> live players. The only protection is the CI gate (lint + tsc + vitest) — there
> is no place to *run* a change before it lands in prod. This spec brings back a
> staging environment: a second app instance with its **own database**, fed by a
> `staging` git branch, so changes can be exercised by hand before merging to
> `main`.

## Context & fixed decisions (from Andrey, 2026-06-11)

1. **Staging DB lives on Supabase Cloud (free tier)** — deliberately *not* on
   the prod box and *not* in the prod Postgres. Full blast-radius isolation: a
   broken migration or runaway query on staging cannot touch prod data or prod
   box resources (CPX32 already carries the whole self-hosted stack).
2. **Staging app is a second Dokploy application** on the existing box,
   reachable at `staging.theloopers.org` (the pre-cutover staging app used this
   exact shape; Dokploy + Traefik + Cloudflare DNS path is proven, runbook
   exists in `infra/server-paas-runbook.md`).
3. **Auto-deploy**: push to `staging` branch → CI gate → Dokploy deploys the
   staging app. Same pattern as spec-028 US2, second pipeline.
4. **Team workflow** (target shape, refined below): feature branch → merge into
   `staging` → test by hand on `staging.theloopers.org` → if good, merge into
   `main`.

### Branch topology refinement (recommended, to confirm in Clarify)

`main` must receive the **feature branch**, never the `staging` branch.
`staging` is a *disposable integration branch*: with 3 developers it will
accumulate experiments that were tested but consciously not shipped, abandoned
half-features, and merge artifacts. Merging `staging → main` would ship all of
that in a bundle. Rules:

- Merge `feature → staging` to test; ship by merging `feature → main` **via a
  Pull Request** (Clarify Q3 — direct merges to `main` are retired for feature
  work).
- `staging` may be **reset to `main`** by anyone at any time (it is never the
  source of truth for anything). A broken staging is cheap by design — that is
  what it is for; the thing being protected is `main`/prod.
- Consequence: at any moment `staging` = `main` + zero or more feature branches
  under test. If two features collide on staging, reset and re-merge the one
  you are testing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Staging database (Priority: P1)

A developer points a non-prod app instance at a staging database that has the
same schema as prod (and agreed-upon data), so the app behaves realistically
without any path to prod data.

**Why this priority**: the database is the dangerous part; everything else is
plumbing around it. Also the only part with an external dependency (Supabase
Cloud project provisioning).

**Independent Test**: connect to the staging DB with the app locally (env trio
swapped), log in with a staging account, browse nodes/encounters, perform a
destructive write (delete a test node) → prod data verifiably unchanged.

**Acceptance Scenarios**:
1. **Given** the staging Supabase project exists, **When** schema is compared
   with prod (`public` schema objects), **Then** they match at the time of
   provisioning.
2. **Given** staging data is loaded, **When** each of the 3 developers logs in
   on staging, **Then** they get a working account with enough data (nodes,
   PCs, loops, items) to exercise real features.
3. **Given** a refresh runbook exists, **When** a developer follows it,
   **Then** staging schema+data are re-synced from prod in bounded, documented
   steps (manual trigger, not scheduled).

### User Story 2 — Staging app on the box (Priority: P1)

A developer opens `https://staging.theloopers.org` and uses the app exactly as
on prod, except it talks to the staging DB.

**Independent Test**: open the URL, valid TLS, login page loads, login with a
staging account works, a write made on staging is visible on staging and absent
on prod.

**Acceptance Scenarios**:
1. **Given** the second Dokploy app is configured, **When** it is deployed,
   **Then** it serves `staging.theloopers.org` over HTTPS and uses the staging
   env trio (URL / anon key / service-role key of the **cloud** project).
2. **Given** prod is deploying or down, **When** staging is used, **Then**
   staging is unaffected (and vice versa) — independent apps, independent DBs.

### User Story 3 — Auto-deploy on push to `staging` (Priority: P2)

A developer merges a feature branch into `staging` and, a few minutes later,
the change is live on `staging.theloopers.org` — no manual deploy steps.

**Why this priority**: without it staging still works (manual Dokploy deploy
button), but the loop "merge → wait → click around" is the whole point of the
environment.

**Independent Test**: push a trivial visible change to `staging` → CI gate runs
→ staging app shows the change within minutes; prod pipeline did not run.

**Acceptance Scenarios**:
1. **Given** the staging workflow exists, **When** a push to `staging` passes
   the gate (lint + tsc + vitest), **Then** the staging Dokploy app redeploys
   automatically.
2. **Given** the gate fails, **Then** staging is not redeployed and the failure
   is visible in GitHub Actions.
3. **Given** a push to any other branch, **Then** the staging pipeline does not
   run (and the prod pipeline still runs only on `main`).

### User Story 4 — Team workflow documented (Priority: P2)

Any of the 3 developers can run the full loop — branch → merge to `staging` →
test → PR the feature into `main` → (optionally) reset `staging` — using only a
written doc, without asking Andrey.

**Acceptance Scenarios**:
1. **Given** the doc exists (location decided in Plan; canon pointers updated),
   **When** a developer follows it end-to-end on a toy change, **Then** every
   step works as written, including the staging reset routine.
2. **Given** a new SQL migration is authored, **Then** the doc states the
   agreed rule for applying it to staging vs prod (order, who, how — rule
   itself decided in Clarify Q5).

### Edge Cases

- **Schema drift**: a migration applied to prod but not staging (or vice
  versa). Expected and tolerated (Q5): the refresh command re-snapshots
  staging from prod — drift never outlives the next refresh.
- **Free-tier pause**: Supabase pauses free projects after ~1 week of
  inactivity; staging may be asleep when someone finally needs it. Handled by
  the FR-010 keep-alive (Q6: every 5 days; threshold ~7).
- **Free-tier row clamp**: cloud PostgREST enforces `db_max_rows` (default
  1000); the app already paginates after the spec-018 lesson — verify on
  staging data volume, raise the project setting if needed.
- **Concurrent testing collisions**: two features merged into `staging`
  interfere. By design: reset + re-merge; doc must say so explicitly.
- **Workflow file permissions**: `.github/workflows/deploy-staging.yml` must be
  committed by Andrey — bot PAT lacks `workflow` scope (spec-028 lesson).
- **Secrets**: the cloud project's service-role key must exist only in Dokploy
  env (runtime) and GitHub secrets if needed — never in the repo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A dedicated Supabase Cloud (free tier) project serves as the
  staging database; no app path from staging to the prod DB exists (different
  URL + keys; prod DSN absent from staging config).
- **FR-002**: Staging `public` schema matches prod at provisioning time;
  thereafter parity is restored by a **single documented on-demand command**
  that copies prod → staging (schema + data). No scheduled sync. Tooling for
  the reverse direction (staging → prod) must not exist.
- **FR-003**: Staging data is a full logical copy of prod (`public` +
  `auth`, Q1) — developers log in with their prod passwords; PII trade-off
  accepted and documented.
- **FR-004**: A second Dokploy app serves the same codebase at
  `staging.theloopers.org` over HTTPS, configured via env only (no code
  branches per environment).
- **FR-005**: Push to `staging` that passes the quality gate auto-deploys the
  staging app; failures block deploy; no cross-triggering with the prod
  pipeline in either direction.
- **FR-006**: The `staging` branch is documented as disposable: anyone may
  reset it to `main`; shipping to `main` happens only via feature branches.
- **FR-007**: The team workflow (branch, test via staging, ship via PR,
  reset, refresh, migration practice) is written down and referenced from the
  project's canon docs.
- **FR-008**: No new notification work (Q4): repo-wide PR opened/closed
  Telegram notifications already cover the new flow; pushes to `staging` stay
  deliberately silent (spec-028 design); deploy events stay silent on both
  environments (parity with prod today).
- **FR-009**: Changes ship to `main` only via Pull Requests (Q3); the quality
  gate (lint + tsc + vitest) runs on every PR targeting `main`, so a red gate
  is visible before merge. Enforcement mechanics (GitHub rulesets — available,
  repo is public) and the bot/meta-commit exception are settled by Q7 + Plan.
- **FR-010**: The staging database receives an automated keep-alive touch at
  least every 5 days, preventing free-tier auto-pause (Q6).
- **FR-011**: `meta/claude-project-instructions.md` reflects the new shipping
  flow (Q7: code via PR, meta/doc commits direct to `main`) and is
  **teammate-universal**: `<GITHUB_USERNAME>` / `<GITHUB_PAT>` placeholders
  plus a minimal token-setup note (fine-grained PAT: Contents + Pull
  requests, read/write), so Никита and Лёша only substitute their token.
  Andrey re-syncs the Claude-project-settings copies. The flip happens at
  Implement, together with the flow going live — instructions must not
  describe a process that does not exist yet.

### Key Entities

- **Staging Supabase project** (cloud, free tier) — the staging DB + auth.
- **Staging Dokploy app** — second app on the box, `staging.theloopers.org`.
- **`staging` branch** — disposable integration branch.
- **Staging deploy workflow** — `.github/workflows/deploy-staging.yml`.
- **Refresh runbook** — prod → staging schema/data re-sync procedure.
- **Workflow doc** — the team-facing "how we ship" page.
- **Universal instructions file** — teammate-ready Claude project
  instructions (username/token placeholders only).

## Success Criteria *(mandatory)*

- **SC-001**: A green push to `staging` is live on `staging.theloopers.org`
  within ~5 minutes; prod deploy pipeline did not run.
- **SC-002**: A destructive write on staging (e.g., deleting a node) leaves
  prod data byte-identical (spot-checked via prod read path).
- **SC-003**: A developer other than Andrey completes the full loop (feature
  branch → staging merge → manual test with own staging login → PR of the
  feature into `main`) using only the workflow doc.
- **SC-004**: Resetting `staging` to `main` takes ≤2 documented commands and
  leaves the staging app deployable.
- **SC-005**: A broken staging (red gate or broken app) does not delay or
  block a prod deploy, and vice versa.

## Assumptions

- Auth is password-only (`signInWithPassword`); no email flows are needed for
  3 dev accounts → cloud free-tier SMTP limits are irrelevant here.
- The app is fully env-driven for Supabase endpoints (proven: the same build
  ran against managed Supabase before spec-027 cutover; env trio per
  `027/env-matrix.md`, including the Dokploy Build-time Arguments gotcha for
  `NEXT_PUBLIC_*`).
- Free-tier limits (500 MB DB, pause-on-idle, row clamp) are acceptable for a
  staging environment of this project's size (~1600 nodes).
- No storage parity needed: the app does not use object storage yet (R2 enters
  with spec-030 Portraits; staging storage story joins then).
- The GitHub repo is **public** (verified 2026-06-11) → branch
  protection / rulesets are available on the free plan if Q7 lands on
  enforcement.
- Cloud Supabase ≠ self-hosted in infra details (Kong/Traefik, GoTrue env,
  Studio access). Accepted: staging validates **app + schema changes**, not
  self-hosted infra changes — those keep their own runbooks/rehearsals.

## Out of Scope

- Per-PR ephemeral preview environments (IDEA-066: "оверкилл").
- Scheduled/automatic prod → staging data sync (refresh is manual).
- Anonymization pipeline for copied data (decision about *whether* to copy
  PII at all is Clarify Q1; building sanitization tooling is not in scope).
- Staging for self-hosted infra changes (Supabase stack upgrades etc.).
- Required PR approvals / review policies (the PR flow itself is **in**
  scope per Q3; whether and how to enforce it with rulesets is a Plan
  decision).
- Monitoring/alerting for staging.

## Clarifications

### Resolved at Specify (Andrey, 2026-06-11)

- Staging DB on Supabase Cloud free tier (not on the box, not in prod PG).
- Second app on existing Dokploy; auto-deploy wanted.
- Flow: feature branch → staging (test) → main (ship). Databases differ.
- 3 developers, all with box admin + repo access — no new access work needed.

### Session 2026-06-11 (chat 94)

- **Q0 — Reuse the managed project**: **yes.** Downgrade the old managed
  Supabase project to free tier and repurpose it as staging instead of
  deleting it. spec-027 **T025** changes meaning for the Supabase half:
  "decommission" → "downgrade + wipe + repurpose" (the Vercel half of T025 is
  unchanged). Its stale pre-cutover data is overwritten by the first refresh.
- **Q1 — Staging data**: **full logical copy of prod** (`public` + `auth`).
  Developers log in with their prod passwords. PII trade-off (player emails +
  password hashes in a cloud free project) explicitly accepted.
- **Q2 — Reset policy**: anyone resets `staging` to `main` at any time.
- **Q3 — Shipping to `main`**: **Pull Requests only** — team-wide workflow
  change, replaces direct merges. Gate must run on PRs (→ FR-009). Scope for
  bot/meta commits → Q7.
- **Q4 — Telegram**: resolved by inspection, no new work (→ FR-008). PR
  opened/closed pings are repo-wide and cover the new flow automatically;
  `staging` pushes are deliberately silent (spec-028); deploy events are
  silent on prod today and stay silent on staging (parity).
- **Q5 — Migrations & data model** (Claude's proposal, accepted direction per
  "подумай"): staging DB is an **on-demand snapshot of prod** — one command
  copies prod → staging, and that is the *only* direction that exists (no
  reverse tooling, ever). No hard "staging-first" migration rule: a feature's
  migration is applied to staging manually when testing that feature needs
  it; drift self-heals at the next refresh; prod migration flow unchanged.
- **Q6 — Free-tier pause**: automated keep-alive every **5 days** (pause
  threshold ~7 days of inactivity; mechanics → Plan).

### Session 2026-06-11 (chat 94) — continued

- **Q7 — PR scope for Claude/meta commits**: **(b).** Code ships via PR —
  Claude pushes a branch, opens the PR, the human merges. Meta/doc commits
  (specs, chatlog, `NEXT.md`, backlog, `infra/`, `meta/`) keep going direct
  to `main`. Follow-on deliverables folded into US4 / FR-011: canon
  instructions updated to the new flow and made teammate-universal for
  Никита and Лёша.

## Review & Acceptance checklist

- [x] All FRs map to at least one acceptance scenario.
- [x] Clarify Q0–Q6 answered (2026-06-11); spec updated.
- [x] Q7 answered: (b) — code via PR, meta direct; Status → `Clarified —
  awaiting Plan`.
- [ ] No tech-stack mechanics beyond the user-fixed decisions (Plan owns HOW).
- [x] T025 (spec-027) reconciled with Q0 (2026-06-11): T025 +
  decommission-checklist + NEXT.md deadline reworded — managed project and
  the old staging app/DNS must NOT be deleted; they are reused by this spec.
