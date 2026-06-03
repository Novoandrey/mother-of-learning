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

- [ ] **T001** 🧑 Решить путь Studio: **A** публичный HTTPS на
      `db.theloopers.org` или **B** SSH-туннель. → Step 0. (FR-005)
      _Блокирует:_ T006/T007 (нужны только для A).
- [ ] **T002** 🧑 Склонировать официальный `supabase/docker` на боксе,
      `cp .env.example .env`. → Step 1.
- [ ] **T003** 🧑 Сгенерировать свежие секреты (`POSTGRES_PASSWORD`,
      `JWT_SECRET`, `PG_META_CRYPTO_KEY`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
      `DASHBOARD_*`), занести в Dokploy env; проверить, что `.env` покрывает
      все `${VAR}` обрезанного compose. → Step 2. (FR-008) _Dep:_ T002.
- [ ] **T004** 🧑 Обрезать compose: **db→PG17 ДО первого старта**; снять
      realtime/storage/imgproxy/functions/analytics/vector/supavisor; чинить
      `studio.depends_on: analytics`; снять host-порты `kong`/`db`; **оставить
      db init-скрипты** (`roles.sql`/`jwt.sql` обязательны). → Step 3.
      (FR-001/002/006/007; PG17) _Dep:_ T002.

## Bring-up

- [ ] **T005** 🧑 Поднять стек в Dokploy (Git-источник; `.env` в
      `.gitignore`); дождаться healthy: db, auth, rest, kong, studio, meta.
      → Step 4. (FR-001, SC-001; FR-008) _Dep:_ T003, T004.

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
- [ ] **T009** 🧑 [P] Перепроверить неиспользование Realtime/Edge (grep) →
      подтвердить обрезку. → Step 8. (FR-002) _Dep:_ T005.
- [ ] **T010** 🧑 Паритет с продом: `\dx` / `\dn` / `server_version`;
      доустановить расширения (или зафиксировать блокер, если нет в образе);
      схемы классифицировать по restore-scope. → Step 9.
      (FR-009/010/011, SC-006/007) _Dep:_ T005.
- [ ] **T011** 🧑 Reboot-resilience чек-лист (контейнеры/Studio/Auth/REST/
      Postgres/5432). → Step 10. (FR-004, SC-005) _Dep:_ T005 (лучше после
      T008/T010).
- [ ] **T012** 🧑 [P] Прод managed + `staging.theloopers.org` нетронуты.
      → Step 11. (SC-008) _Dep:_ T005.

## Артефакты в репо

- [ ] **T013** 🤖 Записать `parity-report.md` в спек-папку (вывод обеих
      сторон + классификация схем). (FR-010, SC-006) _Dep:_ T010 (оператор
      присылает вывод).
- [ ] **T014** 🤖 (опц.) `docker-compose.override.yml` в спек-папку, если
      выбран override-слой вместо патча клона. _Dep:_ T004.

## Close-out

- [ ] **T015** 🤖 Версия-бамп, `NEXT.md` (024 → in prod / next 025),
      `chatlog/`, commit + push. _Dep:_ все выше.

---

**Implement-правило:** оператор гоняет Step за Step'ом, кидает вывод/ошибки
в чат; Claude разбирает и правит `runbook.md`. Задача `[x]` — когда её ✅-check
из runbook пройден.
