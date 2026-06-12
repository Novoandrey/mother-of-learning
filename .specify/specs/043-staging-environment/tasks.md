# Tasks: Staging environment (spec-043)

**Spec**: `./spec.md` · **Plan**: `./plan.md`
Legend: 🤖 Claude (sandbox) · 🖥️ LOCAL · 🐧 SERVER · 🌐 WEB · 🧑 operator.
Phase A runs in-session; Phase B is one operator batch (order matters inside);
Phase C closes after B.

---

## Phase A — repo artifacts (🤖, chat 94)

- [x] **T001** 🤖 `infra/staging-refresh.sh` — prod → staging snapshot script
      (direction guard per FR-002; public schema+data, auth rows data-only;
      verification SELECTs print ✅/❌). _(US1)_
- [x] **T002** 🤖 `infra/staging-runbook.md` — provisioning (downgrade), box
      setup, refresh, branch reset, keep-alive, secrets map, gotchas. _(US1/US4)_
- [x] **T003** 🤖 Workflow contents parked in `./workflows/` (bot PAT lacks
      `workflow` scope): `deploy-staging.yml`, `ci-pr.yml`,
      `staging-keepalive.yml`. Andrey moves them in T011. _(US3)_
- [x] **T004** 🤖 `mat-ucheniya/AGENTS.md` — "Shipping" section (feature →
      staging → PR to main; staging disposable; migration practice). _(US4)_
- [x] **T005** 🤖 `meta/claude-project-instructions.md` → universal (FR-011):
      `<GITHUB_USERNAME>`/`<GITHUB_PAT>` placeholders, teammate setup header,
      Shipping rules. _(US4)_
- [x] **T006** 🤖 R4 probe — **403**: bot PAT has NO `pull-requests: write`
      → extension needed (→ T020). _(US4)_

**CHECKPOINT A** — repo side complete; nothing live yet.

## Phase B — operator batch (🧑, in this order)

- [ ] **T007** 🌐 Supabase Cloud, старый managed-проект: проверить квоту free
      (R3) → **Subscription → downgrade to Free** → Auth: Site URL =
      `https://staging.theloopers.org`, email confirmations OFF → собрать:
      Project URL, `anon`, `service_role`, **DB password**, session-pooler DSN
      (port 5432). _(US1; закрывает Supabase-половину 027/T025)_
- [ ] **T008** 🐧 Бокс: R2 (`curl -6 https://api64.ipify.org` — есть ли v6) →
      `postgresql-client` → root-only `/root/.config/mat-ucheniya/staging.env`
      (`STAGING_DB_URL`, `STAGING_PROJECT_REF`) → установить скрипт в
      `/opt/mat-ucheniya/`. Команды — в runbook §2. _(US1)_
- [ ] **T009** 🐧 Первый прогон `staging-refresh.sh` — R5 (колонки auth)
      проверяется здесь; скрипт печатает ✅/❌. _(US1, SC-002 prep)_
- [ ] **T010** 🖥️ Создать ветку: `git push origin main:staging`. _(US3)_
- [ ] **T011** 🖥️ Перенести воркфлоу (своим аккаунтом):
      `git mv .specify/specs/043-staging-environment/workflows/*.yml
      .github/workflows/ && git commit && git push`. _(US3)_
- [ ] **T012** 🌐 GH → Settings → Secrets and variables → Actions:
      `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`,
      `DOKPLOY_STAGING_APP_ID` (id — из T013). _(US3)_
- [ ] **T013** 🌐 Dokploy: R1 — жив ли pre-cutover staging-app; жив →
      перенастроить (branch `staging`, env-тройка облака, 🔴 `NEXT_PUBLIC_*`
      продублировать в Build-time Arguments, домен
      `staging.theloopers.org`:3000), мёртв → создать по
      `infra/server-paas-runbook.md`. Один ручной deploy. _(US2)_
- [ ] **T014** 🌐 GitHub → Settings → Rules → Rulesets → New branch ruleset:
      target `main`, ✓ Require a pull request before merging (approvals 0),
      Bypass list: **Repository admin** (Role), Enforcement: Active. _(US4/FR-009)_
- [ ] **T015** 🖥️ Smoke: тривиальный коммит в `staging` → гейт → авто-деплой →
      изменение видно на `staging.theloopers.org`; прод-пайплайн молчит. _(SC-001)_

- [ ] **T020** 🌐 Расширить бот-PAT (GitHub → Settings → Developer settings →
      Fine-grained tokens → существующий токен): добавить **Pull requests =
      Read and write** (R4 показал 403). Без этого Claude не сможет открывать
      PR в Phase C и дальше. _(US4)_

**CHECKPOINT B** — staging live, PR-flow enforced.

## Phase C — verification & close-out

- [ ] **T016** 🧑/🤖 SC-002: логин на staging прод-паролем; удалить тестовый
      узел на staging → на проде данные нетронуты.
- [ ] **T017** 🧑 SC-003: Лёша или Никита прогоняет полный цикл (ветка →
      staging → PR в main) только по докам, без Андрея.
- [ ] **T018** 🧑 FR-011 доставка: переклеить инструкции в свой Claude-проект;
      отправить универсальный файл Никите и Лёше (подставляют username+token).
- [ ] **T019** 🤖 Close-out: тикнуть 027/T025 (Supabase-половина), backlog
      IDEA-066 → ✅, chatlog + NEXT.md, Status → `Done — staging live`.
