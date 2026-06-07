# Chat 88 — spec-028 (доступ + автодеплой) + spec-029 (read-only DB MCP), 2026-06-07

## Контекст (откуда пришли)
Эпик «своя инфра» (023→027) закрыт в chat 87; прод на боксе (Dokploy + self-hosted
Supabase), `theloopers.org`. Пользователь попросил завести мини-спеку 028 (доступ к
серверу для Лёши/Никиты) + мини-спеку 029 (read-only Postgres MCP для Claude). Затем
свернул auto-deploy (бывш. стаб 043) в 028 как US2 и прогнал по 028 полный цикл
Specify→Clarify→Plan→Tasks→Implement; добавил Сергея в доступ (full-ops).

## Что сделано
- **spec-029** (мини-спека) — read-only Postgres MCP для Claude: роль `claude_ro`
  (read-only на уровне БД — нет write/DDL-грантов + `default_transaction_read_only`),
  SSH-туннель (5432 закрыт наружу), MCP-сервер **Postgres MCP Pro**
  (`crystaldba/postgres-mcp`, `--access-mode=restricted`; эталонный
  `@modelcontextprotocol/server-postgres` НЕ берём — архив + SQL-инъекция, обходящая
  read-only). Схему `auth` не грантим (хеши/PII). **Ещё не исполнена** (SQL роли +
  пароль + туннель + конфиг MCP — на пользователе).
- **spec-028** — переписана из мини- в полную спеку, **два user stories**:
  - **US1 доступ (P1)**: Лёша/Никита/Сергей — **full-ops** (шелл+деплой+консоль БД),
    персональные sudo-учётки, key-only. Онбординг-док `infra/server-access.md` (+ add/
    revoke команды, вариант без sudo как шаблон). **Ждёт SSH-ключей ребят.**
  - **US2 автодеплой (P2)**: push в `main` → **GitHub Actions** gate
    (`lint`+`typecheck`+`vitest`, node 20) → на зелёном job `deploy` дёргает
    **Dokploy API** (`/api/application.deploy`). Сборку в CI не делаем (образ собирает
    Dokploy на боксе). **В проде, проверено.**
- Реализация US2: `mat-ucheniya/package.json` +скрипт `typecheck` (T007); workflow
  `.github/workflows/deploy.yml` (T008) — **коммитил пользователь** (PAT бота без
  `workflow`-scope). Позитивный смоук — пользователь (ok). Негативный смоук — Claude
  (run 27096111523): gate **failure** (test ✗, lint+typecheck ✓), deploy **skipped**,
  прод не тронут → FR-009/FR-012/SC-006 ✓.
- Auto-deploy-стаб переехал 043→свёрнут в 028 (043 удалён).
- **spec-028 US3** (chat 88, решение в конце): Telegram-уведомления о ветках/мержах
  в `main` — добавлен **Specify** (FR-014..016, SC-007); ждёт своих Clarify/Plan/
  Tasks/Implement. Бывш. IDEA-065; кладём в 028 (git/CI-домен), НЕ в 029.
- Полный аудит/детали MCP-стека и Dokploy/Cloudflare — в спеке `029` и
  `028/research.md`.

## Миграции
- Нет app-миграций. `029/sql/001-claude-ro-role.sql` — роль БД (применяется в Studio,
  **ещё не применена**), не app-миграция.

## Коммиты
- `9db2df6` mini-specs 028+029 (первый заход) — позже 028 переработан
- `da694d9` 028: свёрнут auto-deploy + full Specify; +Сергей
- `5f9e00e` 028 Clarify: Сергей full-ops; гейт lint+tsc+vitest
- `c496fe0` 028 Plan + research + Tasks
- `ed6e71c` 028 Implement T007 (typecheck) (+T008 написан, коммитит оператор)
- `2f12900` Create deploy.yml — **commit пользователя** (workflow на main)
- `65d13ca` 028 T013 негативный смоук подтверждён; откат temp-теста `[skip ci]`

## Действия пользователю (после чата)
- [x] US2 автодеплой — в проде, оба смоука зелёные
- [ ] **A (US1 доступ)** — когда придут ed25519-ключи: A2 завести учётки + ключи,
      A3 проверить SSH, A4 завести в Dokploy (+2FA), A5 Studio-туннель, A6 отзыв-смоук
      (см. `infra/server-access.md`). A4 и A6 можно начать без ключей.
- [ ] **029 MCP** — применить `001-claude-ro-role.sql` в Studio, выставить пароль
      `claude_ro` (вне гита), поднять туннель `ssh -L 5433:localhost:5432`, прописать
      Postgres MCP Pro `--access-mode=restricted` в локальный MCP-конфиг.

## Что помнить следующему чату
- **028 US1 заблокирована SSH-ключами** Лёши/Никиты/Сергея — не кодом. Добиваем в
  новом чате, когда ключи придут.
- **029 не исполнена** (роль + туннель + MCP-конфиг).
- **PAT бота без `workflow`-scope** → файлы в `.github/workflows/` коммитит
  пользователь (web UI / свой токен).
- **Решения в конце chat 88**: бот → **spec-028 US3** (Specify готов); тест-окружение
  (IDEA-066) **отложено** — пока льют/тестят прямо в `main`, защита = CI-гейт. US3 и
  IDEA-066 спецятся/берутся отдельными заходами.
- Версию **не бампали** (US2 — CI-тулинг, не фича; уже 1.0.0).
