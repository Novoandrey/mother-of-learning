# Chat 87 — spec-027 cutover & decommission (эпик «своя инфра» завершён), 2026-06-07

## Контекст (откуда пришли)
spec-023→026 готовы (бокс+Dokploy, self-hosted Supabase, бэкапы, данные перенесены
параллельно проду). На входе — Implement spec-027: переключить прод с Vercel+managed
на бокс+self-hosted, заморозить/вывести Vercel, грейс managed, бамп версии.

## Что сделано
- **🤖-пакет рунбуков** для cutover: `kong-traefik.md` + `compose-override.kong.yml`,
  `cutover-runbook.md`, `env-matrix.md`, `verification-checklist.md`,
  `rollback-runbook.md`, `decommission-checklist.md` (+ заметка в
  `infra/backup-restore-runbook.md`).
- **spec-028 (auto-deploy / CI-on-push) — stub** заведён (Vercel-CI-парити, после 027).
- **Роадмап 030+ зафиксирован** (NEXT.md канонический + реконсиляция устаревших
  номеров 018–023 → 031–036 в backlog.md с «(was NN)»).
- **Сессия 1 (US1 rehearsal), GATE пройден:** kong опубликован на `db.theloopers.org`
  (LE-серт, 5432 закрыт, Studio туннель); **hairpin HTTP 200** (главный риск снят);
  логин/RLS/запись/CORS на staging→self-hosted; dry-run отката пропущен (US4 покрыт
  заполненным runbook'ом + Phase B).
- **T026 ротация ключей:** демо-`JWT_SECRET` → свежий hex; новые HS256 anon/service
  (payload `iss=supabase`) сминчены python, `.env` + env приложения обновлены.
- **Сессия 2 (cutover):** Vercel-прод заморожен (REST API pause → 503); страховочный
  бэкап в R2; финальный синк из managed через **direct connection** (session-пулер
  ломал pg_dump: «Invalid format for user»); wipe-and-reload; атомарный restore,
  data-driven закомментил 10 пустых внутр. таблиц (3 auth + 7 storage) по
  `dry-run.log`; resync sequences. counts **== managed** (nodes 1601 / edges 667 /
  item_attributes 1118 / auth.users 27, 0 сирот, 27/27 хешей, write-smoke ✓). Apex
  `theloopers.org` создан (A→бокс, DNS-only) + домен приложения + GoTrue
  `SITE_URL`=apex. **Smoke реального игрока на https://theloopers.org ✓**
  (логин+чтение+запись).
- **Версия 0.9.0 → 1.0.0.** redeploy под 1.0.0, бэкап живого прода в R2, staging-домен
  снят. Vercel оставлен на паузе (грейс).
- **Эпик «своя инфра» (023→027) закрыт.**

## Миграции
- нет (инфра-спека; 0 миграций кода). Версия 0.9.0 → 1.0.0.

## Решения / находки
- **session-пулер Supabase ломает pg_dump** (юзер без tenant-префикса) → дамп через
  **direct connection** (IPv6, `db.<ref>.supabase.co`); roles снимались, schema/data
  падали с «Invalid format for user».
- **`COMPOSE_FILE` в self-hosted `.env`** должен включать `compose-override.kong.yml`,
  иначе любой bare `docker compose up` пересоздаёт kong без Traefik-лейблов → 404
  (корень повторявшихся 404 во время сессии).
- **демо-ключи/`JWT_SECRET`** в self-hosted `.env` (`iss=supabase-demo`) — ротированы
  перед cutover; bcrypt-пароли от ротации не страдают (только перелогин).
- **apex `theloopers.org` записи НЕ имел** — прод-адрес был `vercel.app`; cutover
  apex **создал**, не флипал; игрокам сменился адрес → `theloopers.org`.
- **Vercel Hobby:** «Pause» только через Spend Management / REST API (project pause →
  503), не через UI-сайдбар; staging-домен снят в Dokploy.
- managed + Vercel на **грейсе** (старт 2026-06-07); гасить в T025 (~1–2 нед).

## Открытые хвосты
- **T025 (отложен ~1–2 нед):** погасить managed Supabase после грейса + удалить
  Vercel-проект. До этого — revert-страховка (env приложения назад на managed +
  снять apex-запись).
- мелочь: подчистить `staging.theloopers.org` из `ADDITIONAL_REDIRECT_URLS` в
  self-hosted `.env` (домен уже снят; редирект безвреден).
- опц.: read-only Postgres MCP в Claude Code через SSH-туннель (живой DB-доступ
  Claude для анализа; запись — через UI/выверенный SQL).
