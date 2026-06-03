# Implementation Plan — 024 Self-hosted Supabase (срез 2/5)

> HOW для `spec.md`. Опирается на решения Clarify (Q1–Q4). Версии и гочи —
> в `research.md`. Пошаговый прогон оператором — в `runbook.md` (пишется
> следующим). Исполнение на боксе из 023, **не** в песочнице Claude.

## Подход (Q1 = A)

Берём официальный `supabase/docker` **стабильный релиз целиком** (версии
протестированы вместе), **обрезаем** удалением неиспользуемых сервисов и
заводим в Dokploy как Compose-приложение. Не собираем compose с нуля —
официальный уже корректно сшивает Kong-роуты, GoTrue↔Postgres, роли
PostgREST, Studio↔meta и проброс JWT.

## Архитектура на боксе

Стек живёт рядом со staging-приложением (023) и Dokploy на том же CPX32.

- **Обрезанный набор:** `db`, `auth`, `rest`, `kong`, `studio`, `meta`
  (см. таблицу в `research.md`). Остальное удалено — с подтверждением
  неиспользования (FR-002).
- **Сеть / доступ (Q2 = B):**
  - **Studio** → наружу по HTTPS на `db.theloopers.org` через Dokploy/
    Traefik, на сервис `studio:3000`, + **basic-auth**. NB: у Dokploy нет
    UI basic-auth для compose-сервисов — middleware заводим вручную через
    Traefik file-provider (`htpasswd -nbB` → `middlewares.yml` →
    Middlewares в Domains). Kong как внешний гейт не используем (иначе
    наружу полезли бы и API-роуты). _Альтернатива (проще/безопаснее, но
    отклонение от FR-005): не публиковать Studio, ходить SSH-туннелем как в
    023 Step 4 — на усмотрение оператора._
  - **Kong** → только в Docker-сети; хост-публикацию портов 8000/8443
    **убираем** (ufw-bypass, гоча №1 в research). Проверяется изнутри.
  - **Postgres** → только в Docker-сети / с бокса; 5432 наружу не
    публикуется. `pg_restore` (026) — `docker exec` / локальный бинд.
- **Версии (research.md):** остальные образы — из стабильного релиза как
  есть; **db-образ обязательно override-им с PG15 (`15.8.1.085`, дефолт
  релиза) на `supabase/postgres:17.x`** (цель `17.6.1.104` / ближайший
  публичный `17.6.1.x`), т.к. прод на PG17, а дамп PG17 в PG15 не заливается
  (026). Отклонение от «протестировано вместе» принимаем (managed крутит те
  же компоненты на PG17). Прод не апгрейдим.
- **Секреты (Q4 = A):** `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`,
  `SERVICE_ROLE_KEY`, `PG_META_CRYPTO_KEY`, `DASHBOARD_*` — свежие
  (FR-008), в **Dokploy env**; имена + команды генерации в runbook;
  значения **не в git**. `.env.example` (без значений) — в папке спеки.

## Артефакты в репо

App-specific → всё в `.specify/specs/024-self-hosted-supabase/` (в repo-root
`infra/` ничего не кладём — стек привязан к приложению):

- `runbook.md` — пошаговый прогон оператором, включая **точный список
  правок официального compose** (какие сервисы снять, какой db-образ
  override, снятие host-портов Kong/db).
- `.env` — копируется из официального `.env.example` (Step 1), insecure-
  дефолты перегенерируются (вкл. `PG_META_CRYPTO_KEY`); полнота переменных
  под обрезанный compose проверяется командой в runbook (Step 2). Свой
  `.env.example` не держим — не плодим дрейф.
- `docker-compose.override.yml` (опц.) — override-слой (db-образ 17.x +
  снятие host-портов), если удобнее, чем патчить клон напрямую.
- `parity-report.md` (или секция в runbook) — вывод `\dx` / `\dn` /
  `server_version` self-hosted vs прод (FR-009..011).

> Полный compose в репо **не репродуцируем**: официальный тянет ещё
> `kong.yml`, seed-файлы `volumes/` и т.п. — клонируем официальный
> `supabase/docker` на боксе и патчим (правки задокументированы в runbook).

## Порядок реализации (высокоуровневый)

> Нумерация ниже — **внутренняя для plan**; детальный пошаговый прогон (с
> другой, более дробной нумерацией Step 0–11) — в `runbook.md`. Ссылки в
> «Из спека → покрытие» указывают на эти plan-шаги, не на Step'ы runbook.

1. Подготовить обрезанный compose + `.env`: снять realtime /
   storage / imgproxy / functions / analytics / vector / supavisor и
   **почистить их `depends_on`** у оставшихся сервисов (гоча №3).
2. Сгенерировать секреты, занести в Dokploy env (Q4).
3. Поднять стек в Dokploy; дождаться healthy: db, auth, rest, kong,
   studio, meta (SC-001).
4. Навесить Traefik-домен `db.theloopers.org` на `studio` + basic-auth;
   выпустить HTTPS-сертификат (SC-002, FR-005).
5. Убедиться, что Kong и 5432 наружу не торчат: порт-скан снаружи +
   проверка Docker-publish vs ufw (SC-004, FR-006/FR-007).
6. Перепроверить неиспользование Realtime / Edge (метод — Plan-вопрос 9
   спека) → подтвердить обрезку (FR-002).
7. Сверка паритета: `\dx` / `\dn` / `server_version` self-hosted vs прод;
   доустановить недостающее; зафиксировать отчёт (SC-006/007, FR-009..011).
8. Проверка reboot по чек-листу SC-005 (контейнеры healthy, Studio,
   Auth/REST изнутри, Postgres изнутри, 5432 снаружи закрыт).

## Бюджет RAM

Обрезка снимает самые тяжёлые сервисы (realtime/Elixir, functions/Deno,
analytics/Logflare, vector, storage, supavisor). Остаток (Postgres + 4
лёгких сервиса + Studio) + Dokploy (~350 МБ) + staging Next — комфортно на
8 ГБ + 2 ГБ swap. Следить за `shared_buffers` Postgres (дефолт образа).
Тесно — Studio гасится вне сессий администрирования.

## Из спека → покрытие

- FR-001/002 → шаги 1, 3, 6; FR-003 → параллельный пустой инстанс, прод
  не трогаем; FR-004 → шаг 8.
- FR-005 → шаг 4; FR-006 → шаг 5 (Kong внутр.); FR-007 → шаг 5; FR-008 → шаг 2.
- FR-009..011 → шаг 7. FR-012 → границы (без данных/бэкапов/cutover).

## Открытые HOW-детали (закрыть в runbook)

- Точная форма подключения Dokploy к compose (git-path vs inline) и
  Traefik labels/middleware для basic-auth Studio.
- Подтвердить теги `db` / `rest` в выбранном стабильном релизе compose.
- Метод reboot-проверки Postgres (docker healthcheck + `pg_isready`
  изнутри сети).
