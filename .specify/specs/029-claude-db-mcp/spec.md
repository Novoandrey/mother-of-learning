# Feature Specification: Read-only Postgres MCP for Claude (spec-029) — mini-spec

**Feature Branch**: `029-claude-db-mcp`
**Created**: 2026-06-07
**Status**: Done — in prod (chat 90; smoke 4/4, see Execution log)
**Depends on**: spec-027 cutover (self-hosted Postgres is the live prod DB on the box).

> Mini-spec. Goal: give **Claude** (Claude Code / Desktop on Andrey's machine)
> **live read-only** access to the self-hosted Postgres for analysis — exploring
> the schema and data, sanity-checking counts, drafting queries. **Writes stay
> out of scope**: they go through the app UI or reviewed SQL migrations, exactly
> as today. This was the earmarked "029 buffer" item in `NEXT.md`.

## Зачем (one-liner)

Сейчас, чтобы что-то узнать про БД, Андрей вручную бегает в Studio и копирует
результаты в чат. Хочется, чтобы Claude сам смотрел схему и данные (только
чтение) — быстрее анализ, меньше копипасты. Запись остаётся через UI/выверенный
SQL.

## Архитектура решения

```
Claude Code/Desktop (🖥️ Windows)
        │  stdio
   Postgres MCP server (docker, --access-mode=restricted)   ← read-only #1 (MCP layer)
        │  postgresql://claude_ro@localhost:5433/postgres
   SSH tunnel  ssh -L 5433:localhost:5432 andrey@<box>       ← 5432 закрыт наружу
        │
   self-hosted Postgres  →  role claude_ro                   ← read-only #2 (DB layer, ГАРАНТИЯ)
```

**Два слоя read-only, и нижний — настоящая гарантия:**

1. **Роль `claude_ro` в Postgres** — без единого write/DDL-гранта +
   `default_transaction_read_only = on`. Даже `DROP TABLE` упрётся в «permission
   denied» / «read-only transaction». **Это и есть боундари.**
2. `--access-mode=restricted` у MCP-сервера — пояс поверх подтяжек.

Почему так строго: эталонный `@modelcontextprotocol/server-postgres`
**заархивирован и имеет SQL-инъекцию, обходящую его же read-only** (типа
`COMMIT; DROP TABLE …`). Поэтому (а) берём не его, а поддерживаемый Postgres MCP
Pro; (б) полагаемся на **роль БД**, а не на «режим сервера». Лучшая практика
прямо гласит: не подключай ИИ к мощному пользователю Postgres — заведи роль,
которая умеет читать ровно то, что нужно.

## Scope (что входит)

1. **Роль `claude_ro`** (SQL — `sql/001-claude-ro-role.sql`):
   `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS`; `CONNECT` к БД;
   (**BYPASSRLS обязателен** — выяснено при исполнении: все public-таблицы под
   RLS с политиками только для supabase-ролей, без bypass роль молча видит
   0 строк; read-only граница — гранты + read-only транзакции, не RLS);
   `USAGE` + `SELECT` на схему **`public`** (+ default privileges на будущие
   таблицы); session-уровень `default_transaction_read_only = on`,
   `statement_timeout = 30s`. **Никаких** INSERT/UPDATE/DELETE/DDL-грантов.
2. **SSH-туннель** с машины Андрея до Postgres на боксе (5432 закрыт наружу).
   > Транспорт-опция (chat 88): у нас уже есть self-hosted MCP как **remote-URL**
   > (`mcp.theloopers.org` — Google-доки). Postgres-MCP можно поднять так же
   > (remote-URL) ВМЕСТО stdio+туннеля — но это **откроет путь к БД наружу** (за
   > read-only-ролью + auth). По умолчанию выбираем **туннель** (порт БД остаётся
   > закрыт); remote — только если осознанно нужен общий доступ. Google-MCP сам по
   > себе для БД не переиспользуется — это другой сервер; держим рядом.
3. **MCP-сервер**: **Postgres MCP Pro** (`crystaldba/postgres-mcp`,
   `--access-mode=restricted`) через docker (образ авто-ремапит `localhost` на
   хост на Win/Mac). Конфиг — в локальном MCP-файле клиента (Claude Desktop /
   проектный `.mcp.json`), **не коммитим** (там пароль).
4. **Пароль `claude_ro`** — генерим, ставим **вне гита** (`ALTER ROLE … PASSWORD`),
   кладём в менеджер паролей.

## Out of scope (не входит)

- **Запись из Claude** — осознанно нет. Мутации = UI / ревью-миграции.
- **Доступ к схемам `auth` / `storage`** — **намеренно не грантим**: `auth.users`
  хранит хеши паролей и PII. Если позже понадобится (напр. посчитать юзеров) —
  заводим узкую вьюху и грантим только её.
- **Публикация 5432 наружу** — нет, только туннель ad-hoc.
- **Постоянно поднятый MCP/туннель** — поднимаем по необходимости.

## Готовый конфиг (для локального MCP-файла, НЕ в гит)

🖥️ LOCAL — сначала туннель (PowerShell, OpenSSH встроен):

```powershell
ssh -L 5433:localhost:5432 andrey@37.27.254.49
```

MCP-клиент (docker-вариант; `localhost` авто-ремапится образом на хост):

```json
{
  "mcpServers": {
    "mat-ucheniya-db": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "DATABASE_URI",
               "crystaldba/postgres-mcp", "--access-mode=restricted"],
      "env": {
        "DATABASE_URI": "postgresql://claude_ro:<<password>>@localhost:5433/postgres"
      }
    }
  }
}
```

Без docker: `pipx install postgres-mcp`, тогда
`"command": "postgres-mcp", "args": ["--access-mode=restricted"]` и тот же
`DATABASE_URI` (localhost:5433 напрямую, ремап не нужен).

> ⚠️ **Проверить порт на боксе:** туннель `-L 5433:localhost:5432` ведёт на
> `localhost:5432` **на сервере**. Убедиться, что контейнер `db` публикует 5432
> на loopback бокса (compose `ports:` у `db`). Если он только во внутренней
> docker-сети — туннелить на опубликованный host-порт или на IP контейнера.
> (supavisor-пулер вырезан, так что цель — прямой `db`, как при миграции.)

## Acceptance scenarios

1. **Given** применённый `001-claude-ro-role.sql` + пароль выставлен,
   **When** при поднятом туннеле Claude дёргает MCP, **Then** видит список схем
   и таблиц `public`, выполняет `SELECT`.
2. **Given** read-only роль, **When** через MCP пытается `INSERT`/`UPDATE`/
   `DROP`, **Then** Postgres отбивает: «cannot execute … in a read-only
   transaction» / «permission denied». Запись невозможна на уровне БД.
3. **Given** запрос без `WHERE` по большой таблице, **When** он крутится >30с,
   **Then** `statement_timeout` его рубит.
4. **Given** туннель закрыт, **When** MCP стартует, **Then** коннекта нет
   (5432 наружу закрыт) — доступ только при явно поднятом туннеле.

## Deliverables

- Этот `spec.md`.
- `sql/001-claude-ro-role.sql` — идемпотентная роль (применить в Studio
  SQL Editor под суперюзером). **Отдаётся через `present_files`.**
- Готовый MCP-конфиг (выше) — для локального файла клиента, не в гит.

## Связь

- Паттерн «read-only роль + туннель + restricted MCP» переносим — кандидат в
  `infra/` runbook, если заведём это и на других проектах.
- Парная мини-спека **028** (доступ людей к серверу) — отдельные учётки/отзыв.

## Execution log (chat 90, 2026-06-10)

Deviations and lessons from the actual rollout:

- **Phase 0 surprise**: the `db` container published no host port at all —
  added `compose-override.db-loopback.yml` (`127.0.0.1:5432:5432`) and wired
  `COMPOSE_FILE` in the stack `.env` so bare `docker compose` always sees all
  overrides (kills the documented kong-label trap as a side effect).
- **Claude Desktop on Windows is an MSIX install**: the real config lives in
  `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`, not the
  documented `%APPDATA%\Claude` (known bug anthropics/claude-code#26073; the
  Edit Config button may open the wrong file).
- **First start raced the 60s MCP init timeout** against `docker pull` of the
  image — pre-pull `crystaldba/postgres-mcp` once before first launch.
- **NOBYPASSRLS was wrong for this role**: every public table is RLS'd with
  policies for supabase roles only, so `claude_ro` silently read 0 rows.
  Fixed to `BYPASSRLS` — the read-only boundary is grants + read-only
  transactions, not RLS; `auth`/`storage` stay ungranted, PII invisible.
- **Restricted mode validates queries client-side**: rejects INSERT/UPDATE,
  the `set_config(transaction_read_only, off)` trick, and even `pg_sleep` —
  timeout was proven with a triple CROSS JOIN, killed at 30s.
- **Bonus over spec**: the server is visible from Claude Desktop *project*
  chats too (this very session ran the smoke), not just fresh local chats.

Smoke: 4/4 ✅ (read with real counts matching cutover reference; write
rejected at both layers; 30s kill; tunnel-closed = no path to DB).
