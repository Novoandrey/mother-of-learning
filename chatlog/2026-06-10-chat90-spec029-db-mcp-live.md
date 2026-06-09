# Chat 90 — spec-029 исполнена: read-only Postgres MCP живой, 2026-06-10

## Контекст (откуда пришли)

Та же сессия, что chat 89 (meta-refactor). Пользователь: «давай 029
попробуем сначала» (вместо Clarify по 022). Спека была Written — операторский
runbook: роль `claude_ro` + SSH-туннель + Postgres MCP Pro restricted.

## Что сделано

- **Роль**: `001-claude-ro-role.sql` докручен (✅/❌-верификация, default
  privileges под обоих владельцев postgres/supabase_admin) и применён в Studio.
  Пароль выставлен вне гита/чата. Корневой `.gitignore` закрывает `.mcp.json`.
- **Phase 0 сюрприз**: у `db` вообще не было host-порта — добавлен
  `compose-override.db-loopback.yml` (127.0.0.1:5432) + `COMPOSE_FILE` в .env
  стека (заодно убит compose-trap из памяти).
- **Гонки клиента**: (1) Docker Desktop не был запущен; (2) первый старт MCP
  упёрся в 60-сек init-timeout против `docker pull` — лечится pre-pull;
  (3) MSIX-установка Claude Desktop держит конфиг в
  `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` (bug #26073),
  путь найден скриптом; в конфиге сохранены существующие preferences.
- **Главный урок — BYPASSRLS**: все 27 public-таблиц под RLS для
  supabase-ролей → `claude_ro` молча читал 0 строк. `ALTER ROLE … BYPASSRLS`;
  read-only граница = гранты + read-only-транзакции, auth-схема не выдана.
  Канон (sql + spec rationale) исправлен.
- **Смоук 4/4** (гонял сам, из этого же Desktop-чата): чтение с эталонными
  counts (1602/667/1118), запись отбита на обоих слоях (вкл. трюк с
  `set_config`), тяжёлый CROSS JOIN убит на 30 с, закрытый туннель = нет
  пути к БД (сайт не зависит).
- Бонус: сервер виден из project-чатов Desktop, не только из новых локальных.
- Backlog: **IDEA-067** — Telegram-бот для бухгалтерии (ledger пуст, команда
  живёт в TG; «пара спек» по словам Андрея).

## Миграции
- (нет — роль/гранты применены через Studio из spec-папки, не migrations/)

## Коммиты
- `bd0df61` spec-029: live verification SELECT + owners + gitignore .mcp.json
- `880aa94` spec-029: db loopback ports override (Phase 0)
- `cdc6f1c` spec-029: claude_ro needs BYPASSRLS
- (этот) spec-029 close-out: Done + execution log, NEXT, chatlog, IDEA-067

## Действия пользователю (после чата)

- [ ] Ритуал доступа Claude к БД: поднять туннель `ssh -L 5433:localhost:5432
      andrey@37.27.254.49` (Developer покажет failed при закрытом — это норма).
- [ ] T025 (дедлайн 14–21.06) и хвосты chat 89 (вставить project instructions,
      paths-ignore) — без изменений.

## Что помнить следующему чату

- БД теперь видна напрямую (mat-ucheniya-db MCP) — анализ данных без
  копипасты через Андрея; туннель = выключатель.
- Активная работа: spec-022 — ждёт «ок, едем в clarify».
