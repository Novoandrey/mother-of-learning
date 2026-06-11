# Feature Specification: Staging environment (spec-043)

**Feature Branch**: `043-staging-environment`
**Created**: 2026-06-11
**Status**: Specify draft — awaiting Clarify
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

- Merge `feature → staging` to test; merge `feature → main` to ship.
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
test → merge feature to `main` → (optionally) reset `staging` — using only a
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
  versa). Mitigation: the migration rule (Clarify Q5) + refresh runbook as the
  reset-to-known-good hammer.
- **Free-tier pause**: Supabase pauses free projects after ~1 week of
  inactivity; staging may be asleep when someone finally needs it. Handling
  decided in Clarify Q6.
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
- **FR-002**: Staging `public` schema matches prod at provisioning time; a
  documented manual refresh procedure restores schema+data parity on demand.
- **FR-003**: Staging data includes working accounts for the 3 developers and
  a realistic dataset (composition per Clarify Q1).
- **FR-004**: A second Dokploy app serves the same codebase at
  `staging.theloopers.org` over HTTPS, configured via env only (no code
  branches per environment).
- **FR-005**: Push to `staging` that passes the quality gate auto-deploys the
  staging app; failures block deploy; no cross-triggering with the prod
  pipeline in either direction.
- **FR-006**: The `staging` branch is documented as disposable: anyone may
  reset it to `main`; shipping to `main` happens only via feature branches.
- **FR-007**: The team workflow (branch, test, ship, reset, migration rule) is
  written down and referenced from the project's canon docs.
- **FR-008**: Telegram visibility of staging deploys per Clarify Q4.

### Key Entities

- **Staging Supabase project** (cloud, free tier) — the staging DB + auth.
- **Staging Dokploy app** — second app on the box, `staging.theloopers.org`.
- **`staging` branch** — disposable integration branch.
- **Staging deploy workflow** — `.github/workflows/deploy-staging.yml`.
- **Refresh runbook** — prod → staging schema/data re-sync procedure.
- **Workflow doc** — the team-facing "how we ship" page.

## Success Criteria *(mandatory)*

- **SC-001**: A green push to `staging` is live on `staging.theloopers.org`
  within ~5 minutes; prod deploy pipeline did not run.
- **SC-002**: A destructive write on staging (e.g., deleting a node) leaves
  prod data byte-identical (spot-checked via prod read path).
- **SC-003**: A developer other than Andrey completes the full loop (feature
  branch → staging merge → manual test with own staging login → feature merge
  to `main`) using only the workflow doc.
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
- Cloud Supabase ≠ self-hosted in infra details (Kong/Traefik, GoTrue env,
  Studio access). Accepted: staging validates **app + schema changes**, not
  self-hosted infra changes — those keep their own runbooks/rehearsals.

## Out of Scope

- Per-PR ephemeral preview environments (IDEA-066: "оверкилл").
- Scheduled/automatic prod → staging data sync (refresh is manual).
- Anonymization pipeline for copied data (decision about *whether* to copy
  PII at all is Clarify Q1; building sanitization tooling is not in scope).
- Staging for self-hosted infra changes (Supabase stack upgrades etc.).
- Branch protection rules / required PR reviews on `main` (revisit separately
  once staging exists — noted in memory as gated on this spec).
- Monitoring/alerting for staging.

## Clarifications

### Resolved at Specify (Andrey, 2026-06-11)

- Staging DB on Supabase Cloud free tier (not on the box, not in prod PG).
- Second app on existing Dokploy; auto-deploy wanted.
- Flow: feature branch → staging (test) → main (ship). Databases differ.
- 3 developers, all with box admin + repo access — no new access work needed.

### Open questions (queue for Clarify phase)

- **Q0 — Reuse the old managed project?** spec-027 **T025** (deadline window
  2026-06-14..21) says "погасить managed Supabase". Option A: instead of
  deleting, **downgrade it to free tier and repurpose as the staging project**
  (one less project to create; T025 closes as "downgraded + repurposed"; its
  stale pre-cutover data gets wiped on first refresh). Option B: delete per
  plan, create a fresh free project. Lean: **A**, after confirming the org's
  free-project quota and that nobody still wants the pre-cutover snapshot
  (backups + passed restore drill say no).
- **Q1 — Staging data composition.** (A) Full logical copy of prod (`public`
  + `auth`): realistic data, devs log in with their prod passwords; accepts
  that player emails/password hashes live in a cloud free project (IDEA-066
  flagged this PII). (B) Schema + curated seed: 3 dev accounts + fixture
  campaign; no PII, but `user_id`-linked features need fixture wiring. Lean:
  **A** with documented PII acceptance — the point is testing on real-shaped
  data.
- **Q2 — Staging reset policy.** Anyone resets anytime (recommended), or
  Andrey-only? Force-push to `staging` must stay allowed for the team either
  way.
- **Q3 — `main` merge mechanics.** Plain `git merge feature` push (current
  habit) vs introduce PRs now that there is a pre-merge sandbox. Lean: keep
  direct merges; PR/branch-protection is its own later conversation.
- **Q4 — Telegram.** Notify staging deploys to the forum topic (same thread /
  separate thread / not at all)? Lean: same thread, distinct prefix.
- **Q5 — Migration rule.** "Every new SQL migration is applied to staging
  first, then prod" as a hard rule (staging doubles as migration rehearsal) vs
  best-effort. Lean: hard rule — it is cheap and catches the scariest class of
  mistakes.
- **Q6 — Free-tier pause handling.** Accept manual unpause when it happens vs
  add a weekly keep-alive ping. Lean: accept manual; active development keeps
  it awake anyway.

## Review & Acceptance checklist

- [ ] All FRs map to at least one acceptance scenario.
- [ ] Clarify Q0–Q6 answered; spec updated; Status → `Clarified — awaiting Plan`.
- [ ] No tech-stack mechanics beyond the user-fixed decisions (Plan owns HOW).
- [ ] T025 (spec-027) outcome reconciled with Q0 decision.
