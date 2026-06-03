# Chat 84 — spec-024 self-hosted Supabase (Specify→Tasks), 2026-06-03

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

## Коммиты
- `b7322e9` spec(024): Specify + Clarify (Q1–Q4 resolved)
- `3ee4a90` docs: 026 sequence-resync note; rename helper → Lesha
- `ef095da` spec(024): Plan + Analyze + Tasks (plan/research/runbook/tasks + spec)
- (+ close-out: NEXT.md + этот chatlog)

## Действия пользователю (после чата)
- [ ] Прогнать `runbook.md` на боксе со Step 0 (выбрать путь Studio A/B).
- [ ] Перед первым `up` — db-образ на PG17 (Step 3a).
- [ ] Кидать вывод/ошибки в чат — Claude разбирает и правит runbook,
      отмечает задачи в tasks.md.
- [x] Запушено в `main` (планирование).

## Что помнить следующему чату
- 024: Implement = оператор катает runbook на боксе; Claude дебажит из
  присланных логов. Трекер прохождения — `tasks.md` (первый `[ ]`).
- 024 НЕ в проде — стек ещё не поднят; версию не бампали (0.9.0).
- Порядок эпика: 024 → 025 (бэкапы+drill) → 026 (данные+auth, resync
  sequences!) → 027 (cutover, managed не гасить сразу).
