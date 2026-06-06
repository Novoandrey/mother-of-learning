# Chat 84 — spec-024 self-hosted Supabase (Specify→Implement, СРЕЗ ЗАКРЫТ), 2026-06-06

## Контекст (откуда пришли)
023 (Server & PaaS foundation) в проде. Просьба: начать 024 (self-hosted
Supabase на `db.theloopers.org`), сверившись с NEXT + git log, затем Specify.
Эпик 023→027 (съезд с managed Supabase на свой бокс).

## Что сделано
- spec-024 проведён через Specify → Clarify → Plan → Analyze → Tasks.
  Папка `.specify/specs/024-self-hosted-supabase/`: spec.md, plan.md,
  research.md, runbook.md (Step 0–11), tasks.md (T001–T015).
- Решения Clarify (Q1–Q4): официальный обрезанный `supabase/docker` compose
  в Dokploy (A); **API наружу не публикуем — вариант B** (проверка изнутри;
  публичный HTTPS на 027); PG-мажор = 17 под прод; секреты в Dokploy env.
- Правки по комментам Леши: трим Realtime/Edge гейтится подтверждением
  неиспользования; observability вне 024 (только liveness); SC-005 →
  полноценный пост-reboot чек-лист; FR-006/SC-003 сведены к B (убран
  конфликт «внешний HTTPS API»); PG17-override ДО первого старта + чистка
  bind-mount `volumes/db/data`; PG_META_CRYPTO_KEY в секреты + проверка
  полноты `.env`; схемы сравниваются по restore-scope; Step 7 — чёткий
  критерий (401/404 ок, PostgREST JSON — fail).
- Analyze: 6 находок (F1–F6) исправлены — postgres-meta как kept-зависимость
  в FR-001/SC-001/US1; SC-008 проверка в runbook (Step 11); FR-005/SC-002
  расширены (HTTPS|SSH-туннель); edge-case расширений в Step 9; нумерация
  plan помечена внутренней; `.env` gitignore-check.
- Имя devops-друга по всему репо: Степан → Леша.
- В 026-буллет NEXT добавлена заметка про resync sequences (`setval`) после
  импорта (иначе duplicate key).

## Находки / решения для памяти
- ⚠️ **Дефолтный self-hosted compose на PG15 (`15.8.1.085`), прод на PG17
  (`17.6.1.104`).** Дамп PG17 в PG15 не зальётся → db-образ override на
  `supabase/postgres:17.x` **до первого `up`** (data-dir — bind-mount, PG17
  не примет PG15-кластер). Прод НЕ апгрейдим (17.6.1.104 → .127).
- Прод-версии для пиннинга образов: GoTrue `2.189.0`, PostgREST `14.5`
  (compose: gotrue 2.186.0, postgrest 14.8 — допустимо).
- Kong в дефолте публикует порты 8000/8443 + у Dokploy нет UI basic-auth
  для compose → Studio вешаем на Traefik+ручной basicAuth, Kong наружу не
  публикуем; host-порты Kong/db снимаем (Docker обходит ufw, урок 023).

## Миграции
- Нет (инфра-срез; SQL-миграций не добавлялось).

## Коммиты (chat 84)
- `b7322e9` Specify + Clarify (Q1–Q4) → `3ee4a90` 026 resync note + rename Lesha
- `ef095da` Plan + Analyze + Tasks → `da2038b` T009 + PG17 tag pin
- `ab166ad` runbook LOCAL/SERVER/WEB labels → `38cb0c5` runbook re-entry section
- `479b4cc` pre-trimmed docker-compose.yml → `5a44479` T005 done
- `b802d94` parity-report + T010/T013 → `4a247d8` studio loopback port (tunnel)
- `3dce088` T006/T007 → `d86b42e` T011 → (+ this close-out)

## Implementation outcome (срез 2/5 ЗАКРЫТ)
- Стек поднят **через `docker compose up -d` на боксе** (НЕ через Dokploy);
  обрезанный `docker-compose.yml` лежит в спек-папке. db = PG17
  (`17.6.1.132`). Все 6 healthy, reboot переживают.
- **Паритет с продом доказан** (`parity-report.md`): 17.6=17.6, расширения
  self-hosted ⊇ прод (ничего доустанавливать), все прод-схемы есть. Блокеров
  для 026 нет.
- Наружу закрыто: supabase-* без `0.0.0.0`-публикации, 5432 закрыт.
- **Studio — путь B (SSH-туннель):** `studio` на `127.0.0.1:8001`,
  `ssh -L 8001:localhost:8001 andrey@37.27.254.49` → `http://localhost:8001`.
  FR-005 закрыт; Dokploy-домен (A) не понадобился.
- Прод/staging целы (staging грузится/логинится).
- Сервер: `andrey@37.27.254.49` (Hetzner CPX32), репо на боксе в `~/...`,
  стек в `~/supabase/docker`.

## Что помнить следующему чату
- **024 ГОТОВ.** Следующий приоритет — **025 (бэкапы off-box + restore-drill)**
  на этом пустом стеке.
- Версию приложения (0.9.0) НЕ бампали — 024 инфра, app-код не менялся;
  бамп уместен на cutover (027).
- Studio открывается только через SSH-туннель (порт `127.0.0.1:8001`).
- Для 026: `realtime` схему создаёт init-скрипт даже без сервиса;
  `storage`/`realtime` вне restore-scope (app не использует); resync
  sequences (`setval`) после импорта.
- Эпик: 024 ✅ → 025 → 026 (данные+auth) → 027 (cutover, managed не гасить
  сразу).
