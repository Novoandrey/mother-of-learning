# cutover-runbook — spec-027 (мастер)

Полный переезд боевого трафика на собственный бокс + self-hosted Supabase, вывод
Vercel, грейс managed. **Две сессии** (Clarify): Сессия 1 = репетиция без окна;
Сессия 2 = cutover под коротким окном.

Контексты: 🖥️ LOCAL (твоя машина) · 🐧 SERVER (SSH на бокс) · 🌐 WEB (Cloudflare/
Dokploy/Vercel UI). Бокс: `andrey@37.27.254.49`, Supabase-стек в `~/supabase/docker`.

Сопутствующие файлы (рядом): `kong-traefik.md`, `env-matrix.md`,
`verification-checklist.md`, `rollback-runbook.md`, `decommission-checklist.md`,
`compose-override.kong.yml`. Синк переиспускает скрипты 026
(`.specify/specs/026-data-auth-migration/scripts/*`, `check-migration-026.sql`).

**Инвариант Сессии 1:** managed/Vercel/прод НЕ трогаем до пройденного GATE US1.
**0 миграций. 0 правок кода кроме `package.json` → 1.0.0.**

---

# ▼ СЕССИЯ 1 — репетиция (без окна обслуживания)

## Phase A — Опубликовать API `db.theloopers.org` (T003)

Полностью по `kong-traefik.md`. Кратко:
1. 🐧 Верифицировать имя сети Dokploy (`docker network ls`) + имя LE-резолвера →
   подставить в `compose-override.kong.yml`.
2. 🌐 Cloudflare: A `db` → `37.27.254.49`, **DNS-only**.
3. 🐧 `cd ~/supabase/docker && docker compose -f docker-compose.yml -f compose-override.kong.yml up -d kong`
4. 🖥️ `curl https://db.theloopers.org/auth/v1/health` → 200; 5432 закрыт.

✅ CHECKPOINT A.

## Phase B — Репетиция приложения на staging→self-hosted (T006–T008)

1. 🐧 `~/supabase/docker/.env` (rehearsal-колонка `env-matrix.md`):
   `API_EXTERNAL_URL=https://db.theloopers.org`,
   `SITE_URL=https://staging.theloopers.org`,
   `ADDITIONAL_REDIRECT_URLS=https://staging.theloopers.org/**`
   → `docker compose up -d auth`.
2. 🌐 Dokploy → приложение (staging) → Environment: тройку на self-hosted
   (URL=`https://db.theloopers.org`, anon/service = из `~/supabase/docker/.env`).
   **Продублировать `NEXT_PUBLIC_*` в Build-time Arguments.** Redeploy.
3. 🐧 **Hairpin (T007):** найти контейнер приложения
   (`docker ps | grep -i <app>`), затем
   `docker exec <app-container> sh -c 'curl -sS https://db.theloopers.org/auth/v1/health'`
   → ответ kong, **не таймаут**.
   - Если **таймаут** → митигация (research R4): добавить app-контейнеру
     `extra_hosts: ["db.theloopers.org:<внутр. IP Traefik в dokploy-network>"]`
     (Dokploy: app → Advanced → Add Host) так, чтобы резолв шёл на Traefik
     (он терминирует TLS), redeploy, повторить curl. Сообщи в чат вывод — добьём.
4. 🌐 Приёмка US1 по `verification-checklist.md` (B): логин текущим паролем; RLS
   (authenticated видит, anon — нет); запись через approval; CORS чисто.
   **Vercel/managed не тронуты.**

✅ CHECKPOINT B.

## Phase C — Dry-run отката (T010)

1. 🌐 **Зафиксировать** текущий apex-таргет Vercel + managed-значения тройки
   (раздел в `rollback-runbook.md`).
2. 🌐 На staging: тройка self-hosted→managed→self-hosted, redeploy на каждом
   шаге, **засечь время**; вписать в `rollback-runbook.md` + checklist.

✅ CHECKPOINT C → 🚦 **GATE US1: sign-off.** Дальше — отдельная сессия.

---

# ▼ СЕССИЯ 2 — cutover (короткое окно обслуживания)

> Откатные шаги (`rollback-runbook.md`) держать открытыми всю Сессию 2.

## Phase D — Фриз managed (T011)

1. 🌐 Объявить игрокам короткое окно обслуживания.
2. 🌐 Vercel: **поставить production-деплой на паузу / отключить** → записи в
   managed прекращаются.
3. 🌐 Убедиться: managed больше не получает боевых запросов (apex отдаёт
   paused-состояние Vercel — это ок, окно короткое).

## Phase E — Финальный свежий синк (T012–T013, переиспуск 026)

1. 🐧 **Страховка:** `cd ~ && sudo <repo>/infra/backup.sh` (физ-бэкап текущего
   self-hosted в R2).
2. 🐧 Свежий дамп из managed (026):
   ```bash
   MANAGED_URL="postgresql://postgres.<ref>:<pw>@<host>:5432/postgres" \
     <repo>/.specify/specs/026-data-auth-migration/scripts/dump-from-managed.sh ./dump-027
   ```
3. 🐧 **Wipe-and-reload** (research R7):
   ```bash
   cd ~/supabase/docker
   docker compose down db
   sudo rm -rf volumes/db/data
   docker compose up -d db          # entrypoint переинициализирует пустой стек
   # дождаться healthy: docker compose ps db
   ```
4. 🐧 Restore (026): dry-run version-gap → закомментить лишние `COPY`/`\.` в
   `data.sql` (как в 026: новые `auth.*` + `storage.*`) → финал:
   ```bash
   sudo <repo>/.../026.../scripts/restore-into-selfhosted.sh --dry-run ./dump-027
   # (правка data.sql при необходимости)
   sudo <repo>/.../026.../scripts/restore-into-selfhosted.sh ./dump-027
   docker cp <repo>/.../026.../scripts/resync-sequences.sql supabase-db:/tmp/
   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/resync-sequences.sql
   ```
   > После wipe ключи/JWT_SECRET/роли восстанавливаются из `.env`+init+`roles.sql`
   > — `.env` не трогали.

## Phase F — Counts == managed (T014)

🐧 Прогнать `check-migration-026.sql` на обеих сторонах, сверить (раздел D
`verification-checklist.md`). **Не сходится → снять фриз (re-enable Vercel),
диагностика, окно отменяется.**

✅ CHECKPOINT F.

## Phase G — Флип домена + env (T015–T016)

1. 🌐 Cloudflare: apex `theloopers.org` A → `37.27.254.49`, **DNS-only**.
2. 🌐 Dokploy → приложение: сменить домен `staging.theloopers.org` →
   **`theloopers.org`**, port 3000, HTTPS (LE). `NEXT_PUBLIC_SUPABASE_URL`
   остаётся `https://db.theloopers.org`. Тройка уже self-hosted (с rehearsal).
3. 🐧 `~/supabase/docker/.env` (cutover-колонка): `SITE_URL=https://theloopers.org`,
   `ADDITIONAL_REDIRECT_URLS=https://theloopers.org/**` → `docker compose up -d auth`.
4. ⏳ Дождаться apex-серта (LE) + распространения DNS (`dig +short theloopers.org`).

✅ CHECKPOINT G.

## Phase H — Smoke реального игрока (T017)

🌐 Существующий игрок на **`https://theloopers.org`**: логин текущим паролем →
читает свои данные → делает запись (полный путь, при необходимости аппрув).
**До анонса «готово».** Фейл → откат (`rollback-runbook.md`).

## Phase I — Снять окно (T018)

🌐 Объявить завершение. Записи идут в self-hosted; managed заморожен/Vercel
выведен из тракта; подтвердить отсутствие двойной записи.

✅ CHECKPOINT I — боевой прод на self-hosted.

## Phase J — Бамп версии (T019, 🤖)

🤖 Claude: `package.json` 0.9.0 → 1.0.0, commit+push. 🌐 Оператор: redeploy
(или часть деплоя cutover'а).

## Phase K — Бэкап на боевом self-hosted (T020–T021)

🐧 Подтвердить ночной cron-бэкап после cutover (раздел F `verification-checklist.md`):
exit 0, свежий R2-бэкоп с боевыми данными + `auth.users` хеши, ротация 30/28.

## Phase L — Decommission (T022–T025)

Полностью по `decommission-checklist.md`:
- 🌐 **Сейчас:** Vercel prod-деплой → пауза; снять `staging.theloopers.org` в
  Dokploy; зафиксировать **дату старта грейса**.
- 🤖 `NEXT.md`/chatlog/commit (T024).
- 🌐 **После грейса (~1–2 нед, T025):** по чек-листу погасить managed (+ удалить
  Vercel-проект).

✅ CHECKPOINT L — эпик «Своя инфра» закрыт.

---

## Что кидать в чат при проблемах

Команда + полный вывод; `docker compose ps`; для Traefik/серта — `docker logs`
traefik-контейнера; для hairpin — вывод `docker exec <app> curl ...`. Claude
разбирает и правит сниппеты/`data.sql`/лейблы.
