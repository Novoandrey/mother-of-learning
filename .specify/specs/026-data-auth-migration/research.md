# Research — Data & Auth Migration (spec-026)

> HOW-investigations за решениями `plan.md`. Якорь — официальный гайд Supabase
> «Restore a Platform Project to Self-Hosted»
> (`https://supabase.com/docs/guides/self-hosting/restore-from-platform`,
> обновлён 2026-05-15), сверен 2026-06-07. Плюс находка drill'а 025 про снятый
> superuser у `postgres`.

## R1. Чем тянуть данные из managed (US2/US3)

**Решение: `supabase db dump` (Supabase CLI), не сырой `pg_dump`.**

Почему: CLI запускает `pg_dump` под капотом, но применяет Supabase-специфичную
фильтрацию — **исключает внутренние схемы, стрипает reserved-роли, добавляет
идемпотентные `IF NOT EXISTS`**. Сырой `pg_dump` тащит Supabase-внутренности и
даёт permission-ошибки на restore. Это ровно то, что обходит обе проблемы
находки 025 (ownership-конфликты + duplicate `schema_migrations`).

**`auth.users` входит в дамп** — гайд прямо подтверждает: dump includes schema,
data, roles, RLS policies, functions, triggers и `auth.users`. Снимает риск,
который мы флагнули в спеке («читаемость auth.users со стороны managed») — CLI
вытаскивает auth-данные корректно (структуру auth исключает как внутреннюю, а
**данные** `auth.users`/identities кладёт в data-дамп).

Три отдельных файла (порядок важен на restore):
```bash
# 1. роли (anon/authenticated/service_role/supabase_*), с IF NOT EXISTS
supabase db dump --db-url "$MANAGED_URL" -f roles.sql  --role-only
# 2. схема public (DDL: таблицы, функции, триггеры, RLS)
supabase db dump --db-url "$MANAGED_URL" -f schema.sql
# 3. данные (public + auth.users/identities), через COPY
supabase db dump --db-url "$MANAGED_URL" -f data.sql   --use-copy --data-only
```

`$MANAGED_URL` — строка подключения из Dashboard → Connect (session pooler или
direct; для дампа подходит session pooler, IPv4). CLI требует Docker (гоняет
`pg_dump` в контейнере из образа Supabase Postgres) — у оператора Docker есть.

**Зачем разбивка на 3 файла:** даёт упорядоченный накат roles → schema → data и
позволяет точечно править только `data.sql` при version-gap (см. R3), не трогая
схему.

## R2. Куда и как накатывать в self-hosted (US2/US3) — обходит cli#3532

**Решение: накат в уже инициализированный self-hosted стек через `psql` с
`session_replication_role = replica`. Vanilla-PG-до-init НЕ нужен.**

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$SELFHOSTED_URL"
```

- `session_replication_role = replica` **отключает триггеры на время импорта
  данных** → предотвращает double-encryption колонок (критично для `auth.users`:
  иначе bcrypt-хеш пере-шифруется триггером и логин ломается). Это прямой ответ
  на US3.
- Идемпотентные `IF NOT EXISTS` (из CLI-дампа) + стрипнутые reserved-роли = накат
  поверх предсозданных Supabase-объектов **не конфликтует**. Кандидаты (a)
  vanilla-PG и (c) ручной roles→schema→data из `restore.sh` отпадают — CLI+psql
  делает это чисто.

**Privilege-нюанс (флаг находки 025 → проверить на drill).** Гайд коннектится
как `postgres.<tenant-id>` через **Supavisor**. У нас Supavisor **вырезан** в 024
(trimmed-стек), и у роли `postgres` **снят superuser** (remove-superuser-access).
`SET session_replication_role = replica` требует superuser. Поэтому накат гоним
**внутри db-контейнера под суперпользователем `supabase_admin`**, а не `postgres`:
```bash
docker cp roles.sql  supabase-db:/tmp/
docker cp schema.sql supabase-db:/tmp/
docker cp data.sql   supabase-db:/tmp/
docker exec supabase-db psql -U supabase_admin -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file /tmp/roles.sql --file /tmp/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file /tmp/data.sql
```
`supabase_admin` — реальный superuser self-hosted: может ставить
`session_replication_role`, владеет `auth.*`, пишет в `public`/`auth`. Это же
снимает «Legacy Studio configuration» риск из гайда (объекты, созданные через
Studio, исторически принадлежат `supabase_admin`). **На drill'е подтвердить**,
что под `supabase_admin` накат проходит; если нет — упасть назад на проверку
`POSTGRES_USER_READ_WRITE=postgres` в compose.

## R3. Главный реальный риск — version-gap Auth-сервиса (не мажор PG)

Паритет PG у нас есть (024: 17.6 = 17.6), так что классический PG15-target
quirk нас НЕ касается напрямую (напр. `SET transaction_timeout = 0` — PG17-only —
на нашем PG17 пройдёт).

**Реальный риск:** managed может гонять **более свежий Auth/Storage сервис**, чем
наш self-hosted Docker-образ. Тогда `data.sql` несёт `COPY` для таблиц/колонок,
которых в нашем GoTrue ещё нет. Гайд перечисляет типовые: `auth.oauth_clients`,
`auth.flow_state` с новыми колонками (`oauth_client_state_id`,
`linking_target_id`), `storage.buckets_vectors`, `storage.vector_indexes`.

**Решение (метод гайда):**
1. Первый прогон restore **без** `--single-transaction` → собрать ВСЕ падения.
2. Закомментить проблемные строки в `data.sql`: `COPY … FROM stdin;` + парный
   терминатор `\.` ; PG17-only настройки — `sed -i 's/^SET transaction_timeout/-- &/' data.sql`.
3. Финальный прогон **с** `--single-transaction`.

`storage.*` COPY-строки всё равно убираем (Clarify-решение: storage/realtime
исключаем). Альтернатива чистке — **подтянуть self-hosted Docker-стек к свежему**
(гайд советует держать конфиг up-to-date), но это трогает рабочий 024-стек →
по принципу «сначала как есть»: сначала dry-run меряем gap, апаем образы только
если gap реальный и крупный.

## R4. JWT-секреты и логин (US3)

Гайд: **JWT-секреты managed и self-hosted различаются → старые токены невалидны →
пользователи пере-логинятся.** Для нас это ок и даже упрощает:

- Тест US3#3 (один логин текущим паролем) работает независимо от JWT-секрета:
  GoTrue сверяет bcrypt-хеш из `auth.users`, и **только после успеха** выдаёт
  токен, подписанный *своим* (self-hosted) секретом. PostgREST self-hosted этот
  же токен и проверяет. Совпадение секрета с managed НЕ требуется.
- Значит сверку `JWT_SECRET` из спеки для 026 **снимаем** — это даже не нужно для
  cutover (модель Supabase = re-auth). Self-hosted держит свой `JWT_SECRET`/ключи
  из `.env`. (Генерация новых ключей/секретов и OAuth-провайдеры — отдельная
  ручная настройка `.env`, но для 026-теста с email/password логином не нужна.)

## R5. Sequence trap (US2#4) — совет Леши, подтверждён

После data-only restore последовательности могут не доехать до `max(id)` →
duplicate-key на следующей вставке. Даже если `data.sql` несёт часть `setval`,
закладываем **явный resync как страховку** (идемпотентен, безвреден если уже ок).
Генерим `setval` по всем user-sequence через каталог и гоним под `supabase_admin`:
```sql
-- для каждой последовательности выставить в max(id) её колонки-владельца
SELECT 'SELECT setval(' || quote_literal(s.seqrelid::regclass::text) || ', '
       || 'COALESCE((SELECT MAX(' || quote_ident(a.attname) || ') FROM '
       || n.nspname || '.' || c.relname || '), 1));'
FROM pg_depend d
JOIN pg_class s   ON s.oid = d.objid AND s.relkind = 'S'
JOIN pg_class c   ON c.oid = d.refobjid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid
WHERE d.deptype = 'a' AND n.nspname IN ('public','auth');
```
(Скрипт миграции сгенерит и выполнит эти `setval` — кладём в
`.specify/specs/026-*`.) Приёмка: тестовая вставка новой строки не падает.

## R6. Физический бэкап self-hosted (US1) — cold-copy vs pg_basebackup

**Решение: cold-copy bind-mount data-dir с краткой остановкой `db`.** (Не
pg_basebackup.)

Контекст: self-hosted параллельный, прод-трафика на нём НЕТ, данных мало
(~1200 нод) → секундный downtime несущественен.

| | cold-copy data-dir | pg_basebackup |
|---|---|---|
| Что делает | stop `db` → `tar` `volumes/db/data` → R2 → start | replication-стрим базового бэкапа |
| Захватывает auth.users/роли/всё | да (побайтово) | да |
| Downtime | секунды (stop/start) | нет |
| Доп. настройка | нет | нужна роль с `REPLICATION`, pg_hba |
| Restore | stop → swap data-dir → start | развернуть базовый бэкап |
| Сложность | минимальная | выше |

Оба обходят обе проблемы находки 025 (это физика, не логический дамп под
`postgres`). Для нашего контекста cold-copy строго проще при равной точности, и
его restore-механика (`stop → mv data aside → start`) — ровно та, что `restore.sh`
уже отрепетировал за 18 c. pg_basebackup/WAL-PITR — будущий no-downtime апгрейд
(уже помечен как future PITR), для 027-cutover вернёмся если секундный stop ночью
будет мешать.

Новый `backup.sh` (физический):
```bash
docker compose -f $COMPOSE/docker-compose.yml stop db
tar -C "$COMPOSE/volumes/db" -czf "$WORK/$TS.data.tar.gz" data
docker compose -f $COMPOSE/docker-compose.yml start db
# health-check db → upload tar в R2 (daily/ + Sunday weekly/) → ротация 30/28
```
R2/rclone-пайплайн, ротация, cron, rollback из 025 переиспользуются как есть.

## R7. Повторяемость миграции (deferred Clarify #4)

**Решение: wipe-and-reload, не наивный повтор.** CLI-дамп идемпотентен по DDL
(`IF NOT EXISTS`), но `data.sql` при повторном накате в непустую БД **задвоит
строки**. Чистый повтор = снести self-hosted data-dir → поднять пустой стек →
прогнать restore заново. Это ровно механика 025 (`stop → mv data.old → up`), так
что отдельного idempotent-кода не пишем — переиспользуем физический restore-путь
как «откат к чистому листу» перед повторным накатом.

## R8. Extensions / schemas — блокеров нет

Паритет 024 (`parity-report.md`): self-hosted ⊇ прод по расширениям
(доустанавливать нечего), все прод-схемы присутствуют. Гайд тоже велит
пред-проверить расширения — у нас уже сделано. `storage`/`realtime` схемы есть, но
их сервис-данные исключаем (Clarify).

## Сводка решений → артефакты

| Вопрос | Решение | Где реализуется |
|---|---|---|
| Тянуть из managed | `supabase db dump` ×3 (roles/schema/data) | runbook + migration-скрипт |
| Накат | `psql … session_replication_role=replica` под `supabase_admin` в контейнере | runbook + migration-скрипт |
| Version-gap auth | dry-run без `--single-transaction` → закомментить лишние `COPY` | runbook (процедура) |
| JWT | свой секрет self-hosted, re-auth; сверка не нужна | (снято) |
| Sequences | явный `setval`-resync под `supabase_admin` | SQL-скрипт в specs/026 |
| Физ-бэкап | cold-copy data-dir | `infra/backup.sh` (переписать) |
| Restore-механика | stop → swap data-dir → start | `infra/restore.sh` (переписать) |
| Повторяемость | wipe-and-reload (физ-restore путь) | runbook |
| Проверка | counts мимо клэмпа + 1 логин + sequence-insert + RLS | verification-чек-лист |
