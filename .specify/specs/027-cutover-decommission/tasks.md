# Tasks — 027 Cutover & Decommission

> _Retro-tick 2026-06-10 (chat 89, meta-refactor): чекбоксы приведены к
> реальности по chatlog/коду/проду; `(tail)` = осознанно отложено,
> не блокер; `(skipped)` = закрыто без прогона._

> Трекинг-чеклист среза. **Не дублирует runbook** — исполняемые команды живут в
> `.specify/specs/027-*/cutover-runbook.md` (+ `kong-traefik.md`, `env-matrix.md`,
> `rollback-runbook.md`, `decommission-checklist.md`, `verification-checklist.md`)
> и переиспуск 026-скриптов. Каждая задача ссылается на Phase из `plan.md` и US
> из `spec.md`. Источник правды по фазам: Specify → Clarify → Plan (готовы) →
> **Tasks (здесь)** → Analyze → Implement.
>
> Легенда владельца: 🧑 = оператор на боксе (Claude не может SSH/деплоить/трогать
> Cloudflare/Vercel), 🤖 = Claude (runbook/сниппеты/правка кода/close-out).
> `[P]` = можно писать/гонять параллельно с соседними. `[x]` — когда пройден
> ✅-check соответствующего Phase-шага.
>
> **ДВЕ СЕССИИ (Clarify):** Сессия 1 = Phase A–C (без окна, **прод на Vercel НЕ
> трогаем**), завершается **GATE US1** (sign-off). Сессия 2 = Phase D–L (короткое
> окно обслуживания), только после зелёного GATE.
>
> **0 миграций. 0 правок кода кроме `package.json` (1.0.0, Phase J).**

---

# ▼ СЕССИЯ 1 — без окна (прод на Vercel не тронут)

## Phase A — Публикация self-hosted API на `db.theloopers.org` (US1)

- [x] **T001** 🤖 `[P]` `kong-traefik.md` + `compose-override.kong.yml` —
      прицепить `supabase-kong` к сети Dokploy (external) + Traefik-лейблы:
      `Host(\`db.theloopers.org\`)`, `loadbalancer.server.port=8000`,
      entrypoint `websecure`, `tls.certresolver=<LE>`. Внутри — шаг **верификации**
      имени сети (`docker network ls`) и имени certresolver.
      _(file: `.specify/specs/027-*/kong-traefik.md` + `compose-override.kong.yml`; Phase A, US1#1, R3)_
- [x] **T002** 🤖 `cutover-runbook.md` — мастер copy-paste весь cutover (Phase
      A–L), контексты 🖥️/🐧/🌐. **Черновик** выдаётся до Сессии 1; финализируется
      в T024 (тайминги/даты).
      _(file: `.specify/specs/027-*/cutover-runbook.md`; Phase A–L, US1–6)_
- [x] **T003** 🧑 Верифицировать сеть/certresolver; применить kong-override
      (`docker compose -f docker-compose.yml -f compose-override.kong.yml up -d kong`);
      Cloudflare A `db` → `37.27.254.49` **DNS-only**; дождаться LE-серта.
      ✅: `curl https://db.theloopers.org/auth/v1/health` снаружи → ok; 5432 закрыт;
      Studio только туннель.
      _(Phase A, US1#1, R3/R8)_
- [x] **CHECKPOINT A** — kong доступен по `https://db.theloopers.org`; наружу
      опубликован только kong.

## Phase B — Rehearsal end-to-end на `staging`→self-hosted (US1)

- [x] **T004** 🤖 `[P]` `env-matrix.md` — карта env **до/после**: (1) приложение
      в Dokploy — `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
      managed→self-hosted **+ дубль `NEXT_PUBLIC_*` в Build-time Arguments**;
      (2) `.env` self-hosted — `API_EXTERNAL_URL`/`SITE_URL`/`ADDITIONAL_REDIRECT_URLS`.
      _(file: `.specify/specs/027-*/env-matrix.md`; Phase B/G, US1, R1/R5)_
- [x] **T005** 🤖 `[P]` `verification-checklist.md` — US1 (hairpin curl, логин,
      RLS authenticated/anon, запись через approval, server action/RPC, CORS) +
      US3 (smoke реального игрока, counts, sequence-insert, бэкап-live). Черновик
      до Сессии 1; финал в T024.
      _(file: `.specify/specs/027-*/verification-checklist.md`; Phase B/H, US1/US3)_
- [x] **T006** 🧑 `.env` self-hosted: `API_EXTERNAL_URL=https://db.theloopers.org`,
      `SITE_URL=https://staging.theloopers.org`, `ADDITIONAL_REDIRECT_URLS` += staging;
      `docker compose up -d auth`. Dokploy staging-app: env-тройка → **self-hosted**;
      **`NEXT_PUBLIC_*` в Build-time Arguments**; redeploy.
      _(Phase B, US1, R1/R5; edge: Build-args 023)_
- [x] **T007** 🧑 **Hairpin-проверка** из app-контейнера:
      `curl -sS https://db.theloopers.org/auth/v1/health` → ответ kong, **не
      таймаут**. Фейл → митигация R4 (extra_hosts на Traefik / внутренний путь).
      _(Phase B, US1, R4 — точка боли)_
- [x] **T008** 🧑 Приёмка US1 по `verification-checklist.md`: логин игрока текущим
      паролем; RLS (authenticated видит, anon — нет); запись через approval
      (pending→approve); server action/RPC ок; CORS ок. **Vercel/managed не тронуты.**
      _(Phase B, US1#1–6)_
- [x] **CHECKPOINT B** — приложение работает end-to-end против self-hosted на
      staging-URL; прод на Vercel не тронут.

## Phase C — Dry-run отката (US4)

- [x] **T009** 🤖 `[P]` `rollback-runbook.md` — **правило** (триггеры отката,
      «чистое окно») + copy-paste шаги (env-тройка → managed + apex → Vercel +
      re-enable Vercel prod-деплой).
      _(file: `.specify/specs/027-*/rollback-runbook.md`; Phase C, US4#1/#2, R9)_
- [x] **T010** 🧑 ~~Dry-run отката на staging~~ **ПРОПУЩЕН по решению (chat 87)**:
      US4 удовлетворён иначе — `rollback-runbook.md` заполнен/корректен, а механика
      env-swap + redeploy уже доказана в Phase B (managed→self-hosted; обратное —
      та же операция). _(Phase C, US4#3 → covered; R9)_
- [x] **CHECKPOINT C / 🚦 GATE US1** — ✅ rehearsal зелёный (hairpin 200, логин/RLS/
      запись/CORS), rollback-runbook готов (dry-run пропущен, T010). **Sign-off
      получен (chat 87).** → Сессия 2 (после T026).

---

## Phase C.5 — Pre-cutover hardening (BLOCKER, между GATE и Сессией 2)

- [x] **T026** 🧑 **Ротация демо-ключей/секрета self-hosted** (находка US1, chat 87).
      `.env` self-hosted содержит демо `JWT_SECRET` + демо `ANON_KEY`/`SERVICE_ROLE_KEY`
      (`iss=supabase-demo`) → публично известны, подделка service_role обходит RLS.
      Сгенерить новый `JWT_SECRET` + перевыпустить `ANON_KEY`/`SERVICE_ROLE_KEY`
      (Supabase key-generator под новый secret), вписать в `~/supabase/docker/.env`,
      `docker compose up -d` (kong+auth подхватят), затем **обновить env-тройку
      приложения в Dokploy на новые ключи** (+ Build-time Args). Пароли НЕ ломаются
      (bcrypt независим от JWT_SECRET) — только перелогин. **Блокирует Сессию 2.**
      _(Phase C.5, US1-finding; security)_
- [x] **CHECKPOINT C.5** — self-hosted на собственном секрете/ключах; приложение
      на новых ключах; логин игрока всё ещё проходит. Только теперь — Сессия 2.

# ▼ СЕССИЯ 2 — короткое окно обслуживания (только после GATE US1)

## Phase D — Фриз managed (US2)

- [x] **T011** 🧑 Announce окно игрокам; **отключить/pause Vercel production-
      деплой** (Vercel UI); убедиться, что managed больше не получает боевых
      записей.
      _(Phase D, US2#1, R6)_

## Phase E — Финальный свежий синк (US2)

- [x] **T012** 🧑 **Страховка:** `infra/backup.sh` — физ-бэкап текущего
      self-hosted в R2 (перед сносом data-dir).
      _(Phase E, US2, R7/R10)_
- [x] **T013** 🧑 Переиспуск 026 (wipe-and-reload, R7): свежий
      `dump-from-managed.sh` → `down db` + rm `volumes/db/data` + `up db` (re-init)
      → `restore-into-selfhosted.sh` (dry-run version-gap → правка `data.sql` →
      финал replica под `supabase_admin`) → `resync-sequences.sql`.
      _(reuses `.specify/specs/026-*/scripts/*`; Phase E, US2#2/#5, R7)_

## Phase F — Counts == managed на момент щелчка (US2)

- [x] **T014** 🧑 `check-migration-026.sql` (прямой `count(*)`, мимо клэмпа):
      `public` + `auth.users` self-hosted **==** managed; FK-целостность;
      sequence-insert не падает duplicate-key; выборочно — свежая правка игрока
      (после 026) присутствует. **Не сходится → снять фриз (re-enable Vercel),
      диагностика, окно отменяется.**
      _(reuses `.specify/specs/026-*/check-migration-026.sql`; Phase F, US2#2/#3/#4/#5/#6)_
- [x] **CHECKPOINT F** — self-hosted == managed на момент фриза; целостность ок.

## Phase G — Флип: домен + env приложения (US3)

- [x] **T015** 🧑 Cloudflare: apex `theloopers.org` A → `37.27.254.49`
      **DNS-only**.
      _(Phase G, US3#1/#3 — apex-флип уводит боевой трафик с Vercel; формальный вывод деплоя — T023; R8)_
- [x] **T016** 🧑 Dokploy app: домен `staging.theloopers.org` → **`theloopers.org`**
      (apex), port 3000, HTTPS (LE). `NEXT_PUBLIC_SUPABASE_URL` остаётся
      `https://db.theloopers.org` (не меняется). env-тройка уже self-hosted (с
      rehearsal). `.env` self-hosted: `SITE_URL=https://theloopers.org`,
      `ADDITIONAL_REDIRECT_URLS` → apex; `up -d auth`. Дождаться apex-серта + DNS.
      _(Phase G, US3#1/#2, R5/R8)_
- [x] **CHECKPOINT G** — apex резолвится в бокс, HTTPS валиден, приложение на
      self-hosted.

## Phase H — Smoke реального игрока (US3)

- [x] **T017** 🧑 Существующий игрок на **`https://theloopers.org`**: логин
      текущим паролем → читает свои данные → делает запись (полный путь, при
      необходимости с аппрувом). **До анонса «готово».** Фейл → откат (шаги
      `rollback-runbook.md` наготове с Phase C).
      _(Phase H, US3#4)_

## Phase I — Снять окно (US3)

- [x] **T018** 🧑 Объявить завершение; записи идут **в self-hosted**; managed
      заморожен/Vercel выведен из тракта; подтвердить отсутствие двойной записи
      (managed боевых записей не получает).
      _(Phase I, US3#5/#6)_
- [x] **CHECKPOINT I** — боевой прод на self-hosted; окно закрыто.

## Phase J — Бамп версии (US5)

- [x] **T019** 🤖 `mat-ucheniya/package.json` **0.9.0 → 1.0.0**; commit + push.
      _(file: `mat-ucheniya/package.json`; Phase J, US5#1)_

## Phase K — Бэкап на боевом self-hosted (US5)

- [x] **T020** 🧑 Подтвердить: ночной cron-бэкап после cutover зелёный (exit 0,
      без ERROR/FATAL); свежий R2-бэкап содержит боевые данные + `auth.users` с
      хешами (на restore); ротация 30/28 цела.
      _(Phase K, US5#2/#3/#4, R10)_
- [x] **T021** 🤖 `[P]` Дописать `infra/backup-restore-runbook.md`: self-hosted =
      прод после 027; окно ночного cold-copy на боевом стеке.
      _(file: `infra/backup-restore-runbook.md`; Phase K, US5, R10)_

## Phase L — Decommission + close-out (US6)

- [x] **T022** 🤖 `[P]` `decommission-checklist.md` — Vercel (вывод сейчас) +
      `staging` (снять домен/деплой сейчас) + managed (чек-лист, гасить **после
      грейса**, зафиксировать дату старта грейса).
      _(file: `.specify/specs/027-*/decommission-checklist.md`; Phase L, US6#1/#2/#3)_
- [x] **T023** 🧑 Выполнить **сейчас**: вывести Vercel prod-деплой (apex на него
      не указывает); снять `staging.theloopers.org` (домен/деплой в Dokploy) —
      один env. Зафиксировать **дату старта грейса** managed.
      _(Phase L, US6#2/#3)_
- [x] **T024** 🤖 Финализировать `cutover-runbook.md` + `verification-checklist.md`
      (тайминги/даты); `NEXT.md` (027 done, эпик «Своя инфра» закрыт, новое
      прод-состояние); `backlog.md` если всплыли баги/идеи; `chatlog/YYYY-MM-DD-
      chatNN-*.md`; commit + push.
      _(files: runbook + `NEXT.md` + `chatlog/*`; Phase L / close-out, US6#5)_
- [x] **T025** 🧑 **Отложенный тик (~1–2 нед после cutover):** по
      `decommission-checklist.md` убедиться, что self-hosted стабилен + свежий
      бэкап есть → **Vercel погасить; managed Supabase НЕ удалять** —
      даунгрейд до free и передача проекта под staging-БД (spec-043, Q0).
      Не в сессии cutover'а. _(Phase L, US6#3/#4 — deferred; судьба managed
      пересмотрена 2026-06-11, spec-043)_ **Supabase-половина закрыта
      2026-06-12: даунгрейд до Free, проект живёт как staging-БД (spec-043
      Done). Остаток тика — только Vercel.** **Vercel погашен — подтверждено Андреем 2026-06-20 (chat 96); тик закрыт, spec-027 → Done.**
- [x] **CHECKPOINT L** — эпик «Своя инфра» закрыт; приложение целиком на
      собственном боксе + self-hosted; `NEXT.md` отражает новый прод.
      _(managed гасится в T025 после грейса.)_

---

**Implement-правило:** Claude пишет 🤖-пакет до Сессии 1 — **T001, T002, T004,
T005, T009** (+ заготовки T021/T022) — оператор идёт на бокс с полным комплектом.
Сессия 1: Phase A→B→C, на CHECKPOINT C — **GATE US1 sign-off**. Сессия 2 (после
GATE): Phase D→L по runbook'у; оператор кидает вывод/ошибки в чат, Claude
разбирает, правит. T019 (бамп) и T021/T022/T024 (🤖) — на/после cutover. T025 —
отложенный тик. **Точки боли:** T007 (hairpin) и T013/T014 (повторный синк +
counts) — здесь вскрываем и чиним. **Инвариант Сессии 1:** managed/Vercel/прод
не трогаем до пройденного GATE.
