# Implementation Plan — Cutover & Decommission (spec-027)

**Spec**: `.specify/specs/027-cutover-decommission/spec.md`
**Status**: Tasks done · Analyze clean (awaiting Implement)
**Research**: `research.md` (рядом) — обоснования R1–R10.

## Подход (одной фразой)

Публикуем self-hosted kong на **`db.theloopers.org`** за тем же Traefik (kong в
`dokploy-network` + лейблы, grey-cloud DNS + LE), **отдельной сессией обкатываем**
приложение целиком против self-hosted на `staging`-URL (ловим hairpin/CORS/
SITE_URL пока прод на Vercel не тронут), затем в **коротком окне** фризим managed
(отключаем Vercel), пере-прогоняем синк 026, флипаем apex `theloopers.org` →
бокс + env-тройку приложения на self-hosted, проверяем реальным игроком, бампаем
**1.0.0**, выводим Vercel+staging и (после грейса) гасим managed. Кода не трогаем,
миграций ноль.

## Порядок (зависимости — спина для Tasks)

Clarify зафиксировал **две сессии**. US1 (репетиция) — самостоятельная, со своим
sign-off; cutover (US2→US3) — отдельной сессией только после зелёного US1.

```
СЕССИЯ 1 (без окна, прод на Vercel не тронут):
  A. Публикация API (db.theloopers.org) ──► B. Rehearsal end-to-end (staging→self-hosted)
                                                  └─► C. Dry-run отката (env staging туда-обратно)
                                              [GATE: US1 зелёный — sign-off оператора]

СЕССИЯ 2 (короткое окно обслуживания):
  D. Фриз managed (off Vercel) ─► E. Финальный синк 026 ─► F. Counts == managed
        └─► G. Флип apex DNS→бокс + env-тройка self-hosted + GoTrue SITE_URL=apex
              └─► H. Smoke реального игрока ─► I. Снять окно / Vercel остаётся выведенным
                    └─► J. Бамп 1.0.0 + commit ─► K. Подтвердить ночной бэкап на боевом self-hosted
                          └─► L. Decommission: Vercel+staging сейчас; managed — чек-лист, гасить после грейса
```

Откатные шаги (R9) держим **готовыми до G** (на случай провала H).

## Артефакты (создать / изменить)

**Код (минимум):**
- `mat-ucheniya/package.json` — версия **0.9.0 → 1.0.0** (Phase J, на cutover).
  Других правок кода нет; **миграций ноль**.

**App-specific (в `.specify/specs/027-cutover-decommission/`):**
- `cutover-runbook.md` — copy-paste весь cutover: публикация API → rehearsal →
  фриз → синк → флип → smoke → бамп → decommission. Контексты помечены
  🖥️/🐧/🌐.
- `kong-traefik.md` (+ `compose-override.kong.yml` сниппет) — как прицепить
  `supabase-kong` к `dokploy-network` и навесить Traefik-лейблы под
  `db.theloopers.org` (R3); шаг верификации имени сети/certresolver.
- `env-matrix.md` — точная карта env **до/после** для (1) приложения в Dokploy
  (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` managed→self-hosted +
  Build-time Args!) и (2) `.env` self-hosted-стека
  (`API_EXTERNAL_URL`/`SITE_URL`/`ADDITIONAL_REDIRECT_URLS`) (R1, R5).
- `rollback-runbook.md` — правило отката (триггеры, «чистое окно») + copy-paste
  шаги (env-тройка назад + apex назад + re-enable Vercel) (R9).
- `decommission-checklist.md` — Vercel (вывод сейчас) + `staging` (снять домен/
  деплой сейчас) + managed (чек-лист, гасить **после грейса**, дата старта
  грейса) (US6).
- `verification-checklist.md` — US1 (hairpin/CORS/логин/RLS/запись) и US3
  (smoke реального игрока, counts, sequence-insert, бэкап-live), тайминги, даты.

**Переиспускаем без изменений (из 026):**
- `.specify/specs/026-data-auth-migration/scripts/{dump-from-managed.sh,
  restore-into-selfhosted.sh}`, `resync-sequences.sql`, `check-migration-026.sql`
  — финальный синк (R7). В runbook'е 027 — ссылки, не копии.

**Переносимое (в `infra/`):**
- `infra/backup-restore-runbook.md` — дописать: после 027 self-hosted = прод;
  окно ночного cold-copy на боевом стеке (R10). Скрипты `backup.sh`/`restore.sh`
  **не меняем** (уже физические, уже на боксе).

**Не трогаем:** код приложения (кроме версии), `mat-ucheniya/supabase/
migrations/`, compose-структуру 024 (только доп. сеть/лейблы на kong).

## Phase A — Публикация self-hosted API (US1) 🐧

1. **Верифицировать** на боксе: `docker network ls` → имя сети Dokploy
   (`dokploy-network`?); имя LE-certresolver Traefik (из конфигурации Dokploy).
2. kong → доп. сеть `dokploy-network` (external) + Traefik-лейблы:
   `Host(\`db.theloopers.org\`)`, port **8000**, `websecure`, `tls.certresolver`.
   Применить через `compose-override.kong.yml` (`docker compose -f ... -f override up -d kong`).
3. Cloudflare: A `db` → `37.27.254.49`, **DNS-only** (R3, R8).
4. Дождаться серта; `curl https://db.theloopers.org/auth/v1/health` снаружи → ok.
5. Postgres 5432 наружу закрыт, Studio только туннель — подтвердить (наследие 024).

## Phase B — Rehearsal end-to-end на staging→self-hosted (US1) 🌐🐧

1. `.env` self-hosted: `API_EXTERNAL_URL=https://db.theloopers.org`,
   `SITE_URL=https://staging.theloopers.org`, `ADDITIONAL_REDIRECT_URLS` += staging;
   `up -d auth` (R5).
2. Dokploy app (staging): env-тройка → **self-hosted** (URL=`https://db.theloopers.org`,
   anon/service = self-hosted). **`NEXT_PUBLIC_*` продублировать в Build-time
   Arguments** (грабли 023!), redeploy (R1, US1-edge).
3. **Hairpin-проверка** из app-контейнера: `curl https://db.theloopers.org/...`
   → ответ kong, не таймаут. Если фейл — митигация R4.
4. Приёмка US1 (`verification-checklist.md`): логин игрока текущим паролем; RLS
   (authenticated видит, anon — нет); запись через approval (pending→approve);
   server action/RPC ок; CORS ок. **Прод (Vercel/managed) не тронут.**

## Phase C — Dry-run отката (US4) 🌐

На staging: сменить env-тройку self-hosted → managed → self-hosted, redeploy,
засечь время. Зафиксировать правило отката и тайминг в `rollback-runbook.md`.

> **GATE US1:** sign-off оператора, что rehearsal зелёный. Только потом Сессия 2.

## Phase D — Фриз managed (US2) 🌐

Announce окно игрокам. **Отключить/pause Vercel production-деплой** (R6) →
записи в managed прекращаются. Убедиться: managed больше не получает боевых
запросов.

## Phase E — Финальный синк (US2) 🐧

Переиспуск 026 (R7), вариант «снёс data → залил заново»:
1. **Страховка:** `infra/backup.sh` (физ-бэкап текущего self-hosted в R2).
2. `dump-from-managed.sh` (свежий дамп roles/schema/data из managed).
3. Пересоздать data-dir self-hosted (`down db` → rm `volumes/db/data` → `up db`).
4. `restore-into-selfhosted.sh` (dry-run version-gap → правка `data.sql` → финал
   под `supabase_admin`, replica).
5. `resync-sequences.sql`.

## Phase F — Counts == managed (US2) 🐧

`check-migration-026.sql` (прямой `count(*)`, мимо клэмпа): `public`-таблицы +
`auth.users` self-hosted **==** managed на момент фриза; целостность FK;
sequence-insert не падает duplicate-key; выборочно — свежая правка игрока (после
026) присутствует. **Не сходится → откат фриза (re-enable Vercel), диагностика.**

## Phase G — Флип: домен + env приложения (US3) 🌐🐧

1. Cloudflare: apex `theloopers.org` A → `37.27.254.49`, **DNS-only** (R8).
2. Dokploy app: домен `staging.theloopers.org` → **`theloopers.org`** (apex),
   port 3000, HTTPS (LE). `NEXT_PUBLIC_SUPABASE_URL` остаётся
   `https://db.theloopers.org` (не меняется!).
3. `.env` self-hosted: `SITE_URL=https://theloopers.org`,
   `ADDITIONAL_REDIRECT_URLS` → apex; `up -d auth`.
4. Дождаться apex-серта (LE) + DNS-распространения.

## Phase H — Smoke реального игрока (US3) 🌐

Существующий игрок на **`https://theloopers.org`**: логин текущим паролем →
читает свои данные → делает запись (полный путь, при необходимости с аппрувом).
**До анонса «готово».** Фейл → откат (R9, шаги наготове с Phase C).

## Phase I — Снять окно (US3) 🌐

Объявить завершение. Записи идут **в self-hosted**; managed/Vercel из тракта
выведены (managed заморожен/жив как эталон, Vercel выведен).

## Phase J — Бамп версии (US5) 🖥️

`package.json` 0.9.0 → **1.0.0**; commit+push (Claude готовит правку; оператор
триггерит redeploy либо это часть деплоя cutover'а).

## Phase K — Бэкап на боевом self-hosted (US5) 🐧

Подтвердить: ночной cron-бэкап после cutover зелёный (exit 0, без ERROR/FATAL),
свежий бэкап в R2 содержит боевые данные + `auth.users` с хешами (на restore),
ротация 30/28 цела (R10). Дописать строку в `infra/backup-restore-runbook.md`.

## Phase L — Decommission (US6) 🌐🐧

- **Сейчас:** вывести Vercel (pause/delete prod-деплой; apex на него не
  указывает); снять `staging.theloopers.org` (домен/деплой в Dokploy) — один env.
- **После грейса (~1–2 нед):** по `decommission-checklist.md` убедиться, что
  self-hosted стабилен + свежий бэкап есть → погасить managed-проект. Зафиксировать
  дату старта грейса; фактическое удаление managed — **отложенный** тик оператора.
- Обновить `NEXT.md` (новое прод-состояние; эпик «Своя инфра» закрыт).

## Integration points

- **Dokploy app** ↔ self-hosted: через публичный `https://db.theloopers.org`
  (env-тройка); фронт-домен apex; Build-time Args для `NEXT_PUBLIC_*`.
- **Traefik** ↔ kong: `dokploy-network` + лейблы; общий LE-certresolver.
- **Cloudflare** ↔ Traefik: grey-cloud A-records (`db`, apex) для ACME.
- **026-скрипты** ↔ финальный синк: вызов как есть, ссылки в runbook.
- **infra/backup** ↔ боевой self-hosted: без изменений, теперь защищает прод.

## Risks / открытые проверки (в US1, до окна)

- **Hairpin server-side** (R4) — главный риск; проверяется первым в Phase B,
  митигация наготове.
- **Имя сети Dokploy / certresolver** (R3) — верифицировать в Phase A; от них
  зависят лейблы.
- **CORS/SITE_URL GoTrue** (R5) — проверяется в Phase B.
- **Cloudflare apex-флип** (R8) — DNS-only обязателен для ACME; короткий TTL.
- **Повторный синк поверх населённого self-hosted** (R7) — снимаем «снёс→залил»;
  страховочный физ-бэкап перед сносом.
- **Поздний откат теряет данные** (R9) — правило отката фиксирует «чистое окно».

## Quality gate (Plan → Tasks)

Каждое решение Plan'а имеет обоснование в research (R1–R10); каждая Phase
привязана к US (US1: A–C; US2: D–F; US3: G–I; US5: J–K; US6: L). Артефакты к
созданию перечислены. Tasks разложит Phases на dependency-ordered чек-лист с
файлами и чекпоинтами по US.
