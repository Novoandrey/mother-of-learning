# Chat 86 — spec-026 Data & Auth migration (managed → self-hosted), 2026-06-07

## Контекст (откуда пришли)
Эпик переезда на свою инфру, 023/024/025 закрыты. Находка drill'а 025: логический
`pg_dumpall` не годится для self-hosted Supabase (под `postgres` без супер-прав не
читается `auth.users`; накат конфликтует по владельцам + duplicate
`schema_migrations`, Supabase cli#3532). spec-026 = перенести реальные прод-данные
+ `auth.users` (хеши) на self-hosted **параллельно проду**, без cutover (cutover =
027). Прошли полный spec-kit (Specify→Clarify→Plan→Tasks→Analyze→Implement) и
выполнили перенос на боксе. Оператор гонял всё на сервере, Claude поставлял
артефакты (`git pull`).

## Что сделано
- **Метод бэкапа сменён на физический.** `infra/backup.sh` + `infra/restore.sh`
  переписаны с логического `pg_dumpall` на cold-copy: стоп db → `tar` data-dir +
  named-volume `supabase_db-config` (хранит pgsodium-ключ дешифровки) → старт →
  R2. Restore = своп data-dir обратно. R2/rclone/ротация/cron из 025 сохранены.
  Захват pgsodium-ключа добавлен для полноты off-box бэкапа (на свежем боксе без
  него не расшифруется vault; bcrypt-хеши паролей это НЕ затрагивает — они не
  pgsodium).
- **Перенос managed → self-hosted** (метод по офиц. доке Supabase
  restore-from-platform): `supabase db dump` ×3 (roles/schema/data, через
  `npx -y supabase`) → `psql` под `supabase_admin` с
  `session_replication_role=replica` (триггеры off → хеши не перешифровываются) →
  resync sequences. Накат под `supabase_admin`, не `postgres` (у последнего сняты
  супер-права, а `replica` требует superuser; Supavisor в обрезанном 024 нет).
- **version-gap разрулен через dry-run.** `--dry-run` (без `--single-transaction`)
  вывалил 10 падений — все на ПУСТЫХ внутренних таблицах, которых нет в обрезанном
  024-стеке: 3 новых auth (`custom_oauth_providers`, `webauthn_challenges`,
  `webauthn_credentials`) + весь `storage.*` (storage-сервис выпилен в 024).
  Скрипт-питон закомментил эти `COPY`-блоки в `data.sql`, затем wipe-and-reload
  (т.к. dry-run в autocommit частично залил данные) → финальный накат одной
  транзакцией без единой ошибки.
- **Проверки (Phase E) — всё зелёное:** counts self-hosted **== managed** по 12
  выборочным таблицам (diff пустой); целостность (сироты edges/item_attrs/dangling
  item-links) — 0; **27/27** непустых bcrypt-хешей; один реальный игрок залогинился
  в self-hosted GoTrue текущим паролем (`provider=email`, `amr=password`);
  RLS-спот admin видит 1601 нод, anon — 0.
- **Физ-drill на реальных данных:** бэкап-пара (data + dbconfig) в R2 → restore
  **stop → healthy ~20 сек** (`real 0m19.796s`); `auth.users`=27 пережили.
- **Sequence trap:** в скоупе одна owned-sequence (`auth.refresh_tokens_id_seq`
  → 153), всё прикладное на UUID → trap почти не грозит, resync-скрипт всё равно
  отрабатывает идемпотентно.
- Спека `024` подтвердила точные имена: сервис `db` / контейнер `supabase-db` /
  PG17 / data-dir `volumes/db/data` / healthcheck `pg_isready -U postgres` /
  named-volume `db-config` → `/etc/postgresql-custom` (pgsodium). Колонки FK
  проверены по миграциям (`edges.source_id/target_id`, `item_attributes.node_id`,
  `transactions.item_node_id` → `nodes`).

## Миграции
- 0 миграций приложения (инфра-спека; app-код не менялся). version-gap-правки —
  в `data.sql` дампа на боксе (не репо-артефакт).

## Коммиты
- `f140612` `spec-026 Implement: physical backup/restore + managed→self-hosted
  migration kit (🤖 batch)` — физ-`backup.sh`/`restore.sh` + `scripts/` +
  `check-migration-026.sql` + `migrate-from-managed.md` + spec/plan/research/tasks.
- close-out (этот коммит) — финализация runbook (тайминг ~20s, физ-метод),
  `infra/backup-restore-runbook.md` + `infra/README.md` обновлены, tasks все `[x]`,
  `NEXT.md` (026 done → 027), chatlog.

## Действия пользователю (после чата)
- [x] перенос выполнен и проверен на боксе (Phase A–E зелёные)
- [x] физ-бэкап/restore-drill пройден на реальных данных
- [ ] **сменить пароль БД managed** (использовался для дампа — был назван в чате,
      пользователь сказал сменит; в репо/chatlog НЕ записан)
- [ ] (опц.) подчистить на боксе: `~/dump-026/`, `volumes/db/data.old`, старые
      025-бэкапы `*.sql.gz` в R2 `daily/`/`weekly/` (логические, больше не нужны)

## Что помнить следующему чату (027 cutover)
- **Версия:** на cutover бампнуть (0.9.0 → дальше) — бамп отложен из инфра-спек сюда.
- **Сеть:** self-hosted API наружу не опубликован (host-портов нет), 5432 закрыт.
  На cutover решить, как приложение в Dokploy достучится до self-hosted db:
  общая docker-сеть + внутренний DNS (`kong`/`db`) vs публикация kong за Traefik.
  Это главный открытый архитектурный вопрос 027.
- **JWT:** секреты self-hosted ≠ managed → активные сессии не переедут, пере-логин
  ожидаем (bcrypt-проверка пароля независима — логин работает). На cutover свериться,
  что `.env` приложения берёт ANON/SERVICE-ключи именно self-hosted-инстанса.
- **Грейс-период:** managed Supabase НЕ гасить сразу после cutover — держать
  ~1–2 недели как revert/эталон (совет Леши).
- **Повторяемость переноса:** при необходимости перезалить — wipe-and-reload
  (снести `volumes/db/data` → поднять пустой стек → повторить Phase C), задокументировано
  в `migrate-from-managed.md`. Дамп идемпотентен по DDL, но `data.sql` дублирует
  строки при повторной заливке в непустую БД.
