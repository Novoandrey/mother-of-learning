# Chat 85 — spec-025 backups & restore-drill, 2026-06-06

## Контекст (откуда пришли)
024 закрыт (пустой self-hosted Supabase на боксе). Пользователь начал 025
(off-box бэкапы + restore-drill на пустом стеке). Прошли Specify → Clarify →
Plan → Tasks → Analyze, затем Implement: написаны скрипты, оператор прогнал
их на боксе по runbook.

## Что сделано
- **Спека 025 пройдена по фазам** (Specify→Analyze) + Implement.
- **Артефакты в `infra/`:** `backup.sh` (pg_dumpall → gzip → R2, Sunday weekly,
  rotation 30/28), `restore.sh` (drill helper), `backup-restore-runbook.md`,
  `rclone.conf.example`. Скрипты shellcheck-clean.
- **Off-box бэкапы РАБОТАЮТ** (US1): R2-бакет `mat-ucheniya-backups` +
  scoped-токен; rclone-remote; первый бэкап уехал (16.5 KB, пустой стек);
  cron daily 03:00 UTC; ротация проверена (старое чистится, свежее живёт).
- **Restore-механика РАБОТАЕТ** (US2): drill «снёс → поднял» = **18 сек**
  (лимит был 5 мин); путь назад (откат к `data.old`) подтверждён.
- **Runbook поправлен по ходу** (4 фикса, всё закоммичено): scoped-токен не
  умеет ListBuckets (проверять внутри бакета); `no_check_bucket=true` для
  scoped-токенов; конфиг rclone нужен и root'у (cron/sudo от root); большие
  heredoc-вставки бьются по SSH → брать файлы из клона репо `git checkout`.

## КЛЮЧЕВАЯ НАХОДКА (drill вскрыл до 026)
**Логический `pg_dumpall` НЕ годится для restore self-hosted Supabase.** Две
причины:
1. `postgres` в self-hosted лишён супер-прав (remove-superuser-access), поэтому
   `pg_dumpall -U postgres` **не читает** таблицы, принадлежащие
   `supabase_admin`/`supabase_auth_admin` (`auth.users` с хешами паролей и пр.) —
   защищённые данные молча выпадают из дампа.
2. Накат логического дампа в свежеинициализированный Supabase-контейнер
   конфликтует с само-созданными ролями/схемами/миграциями (ownership-ошибки,
   duplicate-key на `schema_migrations`) — подтверждённый баг Supabase (cli#3532),
   который указывает на `pg_basebackup` как единственный надёжный путь.
→ **Решение отложено в 026:** сменить метод бэкапа на ФИЗИЧЕСКИЙ (cold-copy
  data-dir vs `pg_basebackup` — взвесить трейдоффы). Pipeline rclone/R2,
  ротация, cron и механика stop→restore→healthy+rollback из 025 переиспользуются
  как есть; меняется только ядро dump/restore.

## Коммиты
- `cd90e3f` — спека/план/таски 025 + infra-скрипты & runbook
- `e6225b2` — runbook fix: scoped-токен и ListBuckets
- `7167932` — rclone no_check_bucket=true для scoped-токенов
- `251c8d3` — rclone config для root (cron/sudo)
- (close-out) — находка в spec/plan/tasks, NEXT, пометки в restore.sh/runbook

## Действия пользователю (после чата)
- [x] R2-бакет + scoped-токен заведены
- [x] rclone + backup.sh на боксе, cron активен
- [ ] cron уже копит бэкапы пустого стека — **бессмысленны до 026**; можно
      оставить (безвреден) или отключить (`sudo rm /etc/cron.d/supabase-backup`)
- [ ] на старте 026: НЕ доверять текущему `backup.sh` для реальных данных
      (дамп под postgres неполон) — сперва сменить метод на физический

## Что помнить следующему чату (026)
- **Первый шаг 026 — выбрать и внедрить физический метод бэкапа** (cold-copy
  data-dir с краткой остановкой стека vs `pg_basebackup` без downtime), затем
  пере-снять бэкап и пере-прогнать drill уже с реальными данными.
- 025 закрыт по механике (бэкап-pipeline + restore + rollback доказаны), но
  ядро dump/restore переопределяется в 026 — это вход, а не довесок.
- Стек на боксе откатан к чистому 024-состоянию (исходный data-dir), healthy.
- Большие скрипты на бокс — через `git fetch` + `git checkout origin/main -- <path>`,
  не heredoc-вставкой.
