# Tasks — 026 Data & Auth Migration

> Трекинг-чеклист среза. **Не дублирует runbook** — исполняемые команды живут в
> `.specify/specs/026-*/migrate-from-managed.md` и `infra/backup-restore-runbook.md`.
> Каждая задача ссылается на Phase из `plan.md` и US из `spec.md`.
> Источник правды по фазам: Specify → Clarify → Plan (готовы) → **Tasks (здесь)**
> → Analyze → Implement.
>
> Легенда владельца: 🧑 = оператор на боксе (Claude не может SSH/деплоить),
> 🤖 = Claude (скрипты/runbook/SQL в репо, close-out).
> `[P]` = можно писать/гонять параллельно с соседними. Отмечать `[x]` когда
> пройден ✅-check соответствующего Phase-шага.
>
> **Инвариант всего среза:** managed/прод/приложение НЕ трогаем ни на одном шаге.

## Phase A — Физический бэкап/restore self-hosted (US1 prep)

- [ ] **T001** 🤖 Переписать `infra/backup.sh`: логический `pg_dumpall` →
      **физический cold-copy** (`docker compose stop db` → `tar -C volumes/db -czf
      <ts>.data.tar.gz data` → health-check `db` после `start` → `rclone copy` в
      `daily/` + воскресенье `weekly/` → ротация 30/28). Ненулевой exit при любом
      сбое; temp чистится в любом исходе; R2/rclone/cron-обвязка из 025 сохраняется.
      _(Phase A, US1#1/#6)_
- [ ] **T002** 🤖 `[P]` Переписать `infra/restore.sh`: restore из физического tar
      (выбрать бэкап → corrupt-guard `tar -tzf` + `df` место → `stop` → отложить
      data-dir в `.old` → распаковать tar → `start` → health-check → rollback-
      подсказка). Механика stop/mv из 025 остаётся. _(Phase A, US1#5)_

## Phase B — Дамп из managed (US2/US3)

- [ ] **T003** 🤖 `scripts/dump-from-managed.sh` — обёртка над `supabase db dump`
      ×3 (`--role-only` → `roles.sql`; `schema.sql`; `--use-copy --data-only` →
      `data.sql`). Ассерты: 3 файла непустые, в `data.sql` есть `COPY auth.users`.
      _(Phase B, US2/US3)_
- [ ] **T004** 🧑 Взять `$MANAGED_URL` (Dashboard → Connect, session pooler),
      убедиться что Supabase CLI + Docker есть, прогнать `dump-from-managed.sh`.
      ✅-check: 3 файла непустые, `COPY auth.users` присутствует, managed неизменён.
      _(Phase B, US2#5, US3#1)_
- [ ] **CHECKPOINT B** — на боксе лежат `roles.sql`/`schema.sql`/`data.sql` с
      auth-данными; прод не затронут.

## Phase C — Накат в self-hosted (US2/US3) — обходит cli#3532

- [ ] **T005** 🤖 `scripts/restore-into-selfhosted.sh` — `docker cp` ×3 → `psql`
      под **`supabase_admin`** в контейнере: `--single-transaction
      --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql
      --command 'SET session_replication_role = replica' --file data.sql`.
      Флаг `--dry-run` = тот же накат БЕЗ `--single-transaction` (для сбора
      падений version-gap). _(Phase C, US2/US3, research R2)_
- [ ] **T006** 🤖 `[P]` `scripts/resync-sequences.sql` — генерит и выполняет
      `setval` по всем user-sequence в `public`+`auth` (по `max(колонка-владельца)`),
      гоняется под `supabase_admin`. _(Phase C, US2#4, research R5)_
- [ ] **T007** 🧑 Dry-run: `restore-into-selfhosted.sh --dry-run` → собрать ВСЕ
      падения version-gap. Закомментить лишние `COPY … FROM stdin;` + парные `\.`
      в `data.sql` (`auth.flow_state`/`auth.oauth_clients` с новыми колонками,
      `storage.*`); `sed -i 's/^SET transaction_timeout/-- &/' data.sql`.
      _(Phase C, US2#1, research R3)_
- [ ] **T008** 🧑 Финал: `restore-into-selfhosted.sh` (с `--single-transaction`,
      replica) → затем `psql -U supabase_admin -f scripts/resync-sequences.sql`.
      ✅-check: накат без `FATAL`; ownership/`schema_migrations`-конфликтов НЕТ
      (если упал на privilege `session_replication_role` — сверить, что гоним под
      `supabase_admin`, не `postgres`; проверить `POSTGRES_USER_READ_WRITE`).
      _(Phase C, US2#1, US3#1)_
- [ ] **CHECKPOINT C** — self-hosted содержит `public`-данные + `auth.users`;
      накат прошёл чисто.

## Phase D — Физ-бэкап + drill на РЕАЛЬНЫХ данных (US1 приёмка)

- [ ] **T009** 🧑 Прогнать новый `infra/backup.sh` (данные уже в self-hosted) →
      физический tar уехал в R2 `daily/`, размер ненулевой. _(Phase D, US1#1)_
- [ ] **T010** 🧑 Прогнать новый `infra/restore.sh` drill: отложить состояние →
      снести → восстановить из физ-бэкапа → health-check. ✅-check: counts ключевых
      таблиц `public` == до сноса; `auth.users` с **непустыми хешами** на месте;
      Auth/REST healthy. Замерить `stop → healthy`; путь назад (`.old`) < 1 мин.
      _(Phase D, US1#2/#3/#4/#5)_
- [ ] **CHECKPOINT D** — восстановились **реальные** данные (не пустой стек),
      хеши паролей выжили; тайминг restore зафиксирован.

## Phase E — Verification + runbook + close (US2/US3/US4)

- [ ] **T011** 🤖 `check-migration-026.sql` — counts managed vs self-hosted
      прямым `SELECT count(*)` (мимо клэмпа `db_max_rows=1000`) по
      `nodes/edges/transactions/categories/item_attributes/…`; выборочные FK
      (tx→nodes, edges→endpoints, item_node_id); `auth.users` непустой с хешами +
      `auth.identities` count (ссылочная целостность auth↔public косвенно
      доказывается логином T013). _(Phase E, US2#2/#3, US3#1/#2)_
- [ ] **T012** 🧑 Verification: counts равны, FK spot-check проходит,
      **sequence-insert тест** (вставка новой строки не падает duplicate-key),
      RLS spot-check под `authenticated` уважает политику как на проде.
      _(Phase E, US2#2/#3/#4, US3#4)_
- [ ] **T013** 🧑 **Тест логина (US3#3):** один существующий игрок логинится
      против self-hosted Auth текущим паролем (через SSH-туннель/тестовый клиент;
      API наружу НЕ публикуем) → успех. _(Phase E, US3#3)_
- [ ] **T014** 🤖 `migrate-from-managed.md` (copy-paste runbook переноса) +
      `verification-checklist.md`. **Черновик** выдаётся оператору до Phase B;
      после T013 **финализировать** (вписать тайминг + дату прогона). Runbook
      включает раздел **повторного прогона** (wipe-and-reload: снести data-dir →
      поднять пустой стек → перезалить; research R7 / deferred Clarify #4).
      Обновить `infra/backup-restore-runbook.md` (физический метод + раздел
      «Migration managed → self-hosted») и `infra/README.md`. _(Phase E, US4#1/#2)_
- [ ] **CHECKPOINT E** — self-hosted = верная копия прод-данных, надёжно
      бэкапится, restore доказан на реальных данных, логин работает → готовность к 027.

## Close-out

- [ ] **T015** 🤖 Close-out: `NEXT.md` (026 done → next **027 cutover**),
      `backlog.md` (только если всплыли баги/идеи), `chatlog/YYYY-MM-DD-chatNN-*.md`,
      commit + push. **Версию приложения НЕ бампаем** — инфра, app-код не менялся
      (бамп на cutover 027). _(process hygiene)_

---

**Implement-правило:** Claude пишет 🤖-артефакты пакетом — **T001, T002, T003,
T005, T006, T011 + черновик T014** — оператор идёт на бокс с полным комплектом.
Дальше 🧑-шаги гоняются по runbook Phase за Phase'ой (B → C → D → E); оператор
кидает вывод/ошибки в чат, Claude разбирает, правит скрипты/runbook/`data.sql`.
Задача `[x]` — когда её ✅-check пройден. **Точки боли:** T007 (version-gap
dry-run) и T010 (drill на реальных данных) — здесь вскрываем и чиним.
