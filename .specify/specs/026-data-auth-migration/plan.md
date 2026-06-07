# Implementation Plan — Data & Auth Migration (spec-026)

**Spec**: `.specify/specs/026-data-auth-migration/spec.md`
**Status**: Plan (awaiting Tasks)
**Research**: `research.md` (рядом) — обоснования и команды.

## Подход (одной фразой)

Переписываем бэкап/restore self-hosted на **физический cold-copy** (чинит
находку 025), затем переносим прод-данные **`supabase db dump` ×3 → `psql` с
`session_replication_role=replica` под `supabase_admin`** (обходит cli#3532 и
сохраняет хеши паролей), пере-синхроним sequences, и пере-прогоняем drill уже на
**реальных** данных. Всё параллельно проду; cutover — 027.

## Порядок (зависимости — спина для Tasks)

Физические скрипты пишем **первыми** (старому логическому `backup.sh` для
реальных данных не доверяем), но drill на реальных данных возможен только
**после** того как данные приехали. Отсюда последовательность:

```
A. Физ-бэкап/restore (US1 prep)   ─┐
                                   ├─ B. Дамп из managed (US2/US3)
                                   │     └─ C. Накат в self-hosted (US2/US3)
                                   │           └─ D. Физ-бэкап + drill на РЕАЛЬНЫХ данных (US1 приёмка)
                                   │                 └─ E. Verification + runbook + close (US2/US3/US4)
```

## Артефакты (создать / изменить)

**Переписать (переносимое, в `infra/`):**
- `infra/backup.sh` — логический `pg_dumpall` → **физический cold-copy** data-dir
  (stop `db` → `tar` `volumes/db/data` → health-check → upload R2 → ротация).
  R2/rclone/ротация/cron-обвязка сохраняются.
- `infra/restore.sh` — restore из физического tar (stop → swap data-dir → распаковать
  → start → health-check → rollback-подсказка). Механика stop/mv из 025 остаётся.
- `infra/backup-restore-runbook.md` — обновить под физический метод; добавить
  раздел «Migration managed → self-hosted» со ссылкой на app-specific runbook.

**Создать (app-specific, в `.specify/specs/026-data-auth-migration/`):**
- `migrate-from-managed.md` — copy-paste runbook переноса: dump ×3 → подготовка →
  restore (dry-run → правка `data.sql` → финал) → sequences → verification.
- `scripts/dump-from-managed.sh` — обёртка над `supabase db dump` ×3 (roles/schema/data)
  с проверкой непустоты файлов и наличия `auth.users` в `data.sql`.
- `scripts/restore-into-selfhosted.sh` — `docker cp` ×3 + `psql` replica-restore под
  `supabase_admin`; поддержка `--dry-run` (без `--single-transaction`, для сбора
  падений version-gap).
- `scripts/resync-sequences.sql` — генерит и выполняет `setval` по всем
  user-sequence в `public`+`auth` (см. research R5).
- `verification-checklist.md` — counts мимо клэмпа, 1 логин, sequence-insert,
  RLS spot-check, тайминг restore, дата прогона.
- SQL-проверки `check-migration-026.sql` — counts managed vs self-hosted, целостность
  FK, `auth.users` непустой с хешами (в BEGIN/ROLLBACK где можно).

**Не трогаем:** код приложения (0 изменений), `mat-ucheniya/supabase/migrations/`
(дамп managed — это НЕ commit-миграция приложения), версию (инфра-only, бамп → 027).

## Phase A — Физический бэкап/restore self-hosted (US1 prep)

Переписать `infra/backup.sh` и `infra/restore.sh` на cold-copy (research R6).
Ключевые гарантии: stop затрагивает только self-hosted (прод-трафика нет);
`db` поднимается healthy после start; tar непустой; corrupt-guard на restore
(`tar -tzf`); путь назад (`data.old`) сохраняется до подтверждения.

> Полноценный drill этих скриптов — **Phase D**, когда в self-hosted уже есть
> реальные данные (иначе докажем только пустой стек, как в 025).

## Phase B — Дамп из managed (US2/US3)

Оператор берёт `$MANAGED_URL` (Dashboard → Connect, session pooler) и гоняет
`scripts/dump-from-managed.sh`:
```bash
supabase db dump --db-url "$MANAGED_URL" -f roles.sql  --role-only
supabase db dump --db-url "$MANAGED_URL" -f schema.sql
supabase db dump --db-url "$MANAGED_URL" -f data.sql   --use-copy --data-only
```
Приёмка фазы: 3 файла непустые; в `data.sql` присутствует `COPY auth.users`.
managed read-only/неизменён (US2#5). **Прод не трогаем.**

## Phase C — Накат в self-hosted (US2/US3) — обходит cli#3532

Под `supabase_admin` внутри контейнера (research R2), с version-gap процедурой
(research R3):
1. `scripts/restore-into-selfhosted.sh --dry-run` (без `--single-transaction`) —
   собрать ВСЕ падения version-gap.
2. Если есть лишние `COPY` (напр. `auth.flow_state`/`oauth_clients` с новыми
   колонками, `storage.*`) — закомментить строки `COPY … FROM stdin;` + парные
   `\.` ; `sed` на `SET transaction_timeout`. (storage/realtime всё равно исключаем —
   Clarify.)
3. Финал: `scripts/restore-into-selfhosted.sh` (с `--single-transaction`,
   `session_replication_role=replica`).
4. `psql -U supabase_admin -f scripts/resync-sequences.sql` (sequence-resync).

Приёмка: накат без `FATAL`; ownership/`schema_migrations`-конфликтов нет.

## Phase D — Физ-бэкап + drill на РЕАЛЬНЫХ данных (US1 приёмка)

Теперь, когда данные в self-hosted:
1. `infra/backup.sh` — снять физический бэкап (с данными), уехал в R2.
2. `infra/restore.sh` — drill: снести → поднять из бэкапа → health-check.
3. Проверить: counts ключевых таблиц `public` == до сноса; `auth.users` с
   **непустыми хешами** присутствует; Auth/REST healthy.
4. Замерить `stop → healthy`; проверить rollback (`data.old`) < 1 мин.

Приёмка: восстановились **реальные** данные (а не пустой стек); хеши на месте.

## Phase E — Verification + runbook + close (US2/US3/US4)

- **Counts мимо клэмпа** (`db_max_rows=1000` не применять — прямой SQL):
  `SELECT count(*)` по `nodes/edges/transactions/categories/item_attributes/…`
  на обеих сторонах, равенство.
- **Целостность**: выборочные FK (tx→nodes, edges→endpoints, item_node_id).
- **Логин (US3#3)**: один существующий игрок логинится против self-hosted Auth
  текущим паролем (через SSH-туннель/тестовый клиент; API наружу НЕ публикуем).
- **Sequence-insert (US2#4)**: тестовая вставка новой строки не падает duplicate-key.
- **RLS spot-check**: запрос под `authenticated` уважает политику как на проде.
- Заполнить `verification-checklist.md` (тайминг restore + дата прогона).
- Финализировать `migrate-from-managed.md` и `infra/backup-restore-runbook.md`.

## Integration points

- **024 self-hosted стек** — цель наката; PG17, `supabase_admin` superuser,
  Supavisor вырезан → коннект внутри контейнера через `docker exec`.
- **025 R2-пайплайн** — `rclone.conf`, бакет `mat-ucheniya-backups`, ротация 30/28,
  ночной cron — переиспользуются физическим `backup.sh`.
- **Studio по SSH-туннелю** (024) — канал для verification-запросов и теста логина.
- **managed Supabase** — источник дампа, read-only, неизменён до 027.

## Риски и откат

- **Version-gap Auth** (главный) → процедура dry-run→comment→final (R3). Запасной
  вариант — апнуть self-hosted Docker-образы к свежим (трогает 024-стек → только
  если gap крупный; принцип «сначала как есть»).
- **Privilege на `session_replication_role`** → гоним под `supabase_admin`, не
  `postgres` (R2); проверить на Phase C, иначе сверить `POSTGRES_USER_READ_WRITE`.
- **Sequence trap** → явный resync + insert-тест (R5).
- **Битый бэкап** → corrupt-guard в `restore.sh` ловит на Phase D, не в 027.
- **Откат всего среза**: self-hosted параллельный и одноразово заливаемый —
  «снёс data-dir → поднял пустой → перезалил» (R7). managed/прод/приложение не
  затронуты ни на одном шаге.

## US → Phase соответствие (для Analyze)

| US | Phases |
|---|---|
| US1 (физ-бэкап + drill на реальных данных) | A (скрипты) + D (приёмка) |
| US2 (данные public) | B + C + E (counts/sequences/целостность) |
| US3 (auth.users + логин) | B + C (replica-restore) + D (хеши выжили) + E (логин/RLS) |
| US4 (runbook + чек-лист, managed untouched) | E + сквозной инвариант «прод не трогаем» |

## Out of scope (подтверждаем из спеки)

Cutover/decommission/env-switch (027), публикация API наружу, PITR/WAL,
шифрование бэкапов, storage/realtime данные, мониторинг бэкапов, версионный бамп.
