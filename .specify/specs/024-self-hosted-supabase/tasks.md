# Tasks — 024 Self-hosted Supabase

> Трекинг-чеклист среза. **Не дублирует runbook** — каждая задача ссылается
> на его Step и на FR/SC. Исполняемые команды — в `runbook.md`.
> Источник правды по фазам: Specify → Clarify → Plan → Analyze (готовы) →
> **Tasks (здесь)** → Implement.
>
> Легенда владельца: 🧑 = оператор на боксе (Claude не может SSH/деплоить),
> 🤖 = Claude (артефакты в репо, close-out).
> `[P]` = можно параллельно с соседними. Отмечать `[x]` по факту прохождения
> ✅-check соответствующего Step.

## Setup / подготовка

- [x] **T001** ✅ Путь Studio: **A** — публичный HTTPS на
      `db.theloopers.org` + basic-auth (chat 84). _Steps 5–6 в игре._
- [x] **T002** ✅ Официальный `supabase/docker` склонирован, `cp .env.example
      .env` сделан (chat 84).
- [x] **T003** ✅ Секреты сгенерированы и получены (`POSTGRES_PASSWORD`,
      `JWT_SECRET`, `PG_META_CRYPTO_KEY`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
      `DASHBOARD_*`) — chat 84. _Должны лежать в `.env` / Dokploy env._
- [x] **T004** ✅ Обрезанный compose **собран Claude** →
      `docker-compose.yml` в этой папке (db→PG17 `17.6.1.132`; сняты
      realtime/storage/imgproxy/functions/analytics/vector/supavisor +
      их depends_on; studio без analytics/LOGFLARE; host-порты kong сняты;
      db init-скрипты сохранены). YAML валиден, 6 сервисов. Оператору —
      положить файл вместо `docker/docker-compose.yml` (Step 3). (chat 84)

## Bring-up

- [x] **T005** ✅ Стек поднят (chat 84) через `docker compose up -d` прямо
      на боксе (не через Dokploy). Все 6 healthy/up: db (PG17), auth, rest,
      kong, studio, meta (SC-001). Host-порты Kong/db не опубликованы —
      SC-004 подтверждён по `docker ps`. _NB: т.к. деплой не через Dokploy,
      публичный Studio (Step 5/6) потребует либо пересоздать как Dokploy-app,
      либо SSH-туннель (путь B) — решим отдельно, для проверок не нужно._

## Доступ к Studio (путь A; для B закрывается в T001/Step 0)

- [ ] **T006** 🧑 [A] DNS `db`→`<IP>` + Dokploy-домен `db.theloopers.org`
      на сервис `studio:3000` + HTTPS. → Step 5. (FR-005) _Dep:_ T005, T001=A.
- [ ] **T007** 🧑 [A] Traefik basic-auth middleware перед Studio
      (`htpasswd` → `middlewares.yml` → Middlewares). → Step 6.
      (FR-005, SC-002) _Dep:_ T006.

## Проверки

- [ ] **T008** 🧑 [P] API/Kong и 5432 наружу закрыты (порт-скан + curl-
      критерии Step 7), Auth/REST отвечают изнутри. → Step 7.
      (FR-006/007, SC-003/004) _Dep:_ T005.
- [x] **T009** 🤖 Перепроверить неиспользование Realtime/Edge/Storage —
      **СДЕЛАНО (chat 84, аудит в песочнице): 0 вхождений на 260 ts/tsx;**
      app использует только PostgREST (`.from`/`.rpc`) + `auth.*`. Обрезка
      подтверждена (FR-002). Оператор может пере-проверить на боксе (Step 8).
- [x] **T010** ✅ Паритет с продом (chat 84): server_version 17.6=17.6;
      расширения self-hosted ⊇ прод (доустанавливать нечего; extra pg_net);
      все прод-схемы присутствуют self-hosted (extras — суперсет). **Блокеров
      для 026 нет.** Отчёт → `parity-report.md`. (FR-009/010/011, SC-006/007)
- [ ] **T011** 🧑 Reboot-resilience чек-лист (контейнеры/Studio/Auth/REST/
      Postgres/5432). → Step 10. (FR-004, SC-005) _Dep:_ T005 (лучше после
      T008/T010).
- [ ] **T012** 🧑 [P] Прод managed + `staging.theloopers.org` нетронуты.
      → Step 11. (SC-008) _Dep:_ T005.

## Артефакты в репо

- [x] **T013** ✅ `parity-report.md` записан в спек-папку (chat 84) — оба
      вывода + классификация схем по restore-scope. (FR-010, SC-006)
- [~] **T014** 🤖 (опц.) override-файл — **не делаем:** Compose override
      меняет `db.image`/`ports`, но **не удаляет сервисы** (realtime/storage/
      …). Трим — правками клона по runbook Step 3. _(явное решение)_

## Close-out

- [ ] **T015** 🤖 Версия-бамп, `NEXT.md` (024 → in prod / next 025),
      `chatlog/`, commit + push. _Dep:_ все выше.

---

**Implement-правило:** оператор гоняет Step за Step'ом, кидает вывод/ошибки
в чат; Claude разбирает и правит `runbook.md`. Задача `[x]` — когда её ✅-check
из runbook пройден.
