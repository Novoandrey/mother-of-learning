# Research — Cutover & Decommission (spec-027)

**Spec**: `.specify/specs/027-cutover-decommission/spec.md`
Обоснования технических решений Plan'а. Ссылки R1–R10 — на эти разделы.

---

## R1 — Env/клиентская топология приложения: один URL на всё

Аудит кода (chat 87):

| Файл | Клиент | URL-переменная | Ключ |
|---|---|---|---|
| `lib/supabase/client.ts` | `createBrowserClient` (браузер) | `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `lib/supabase/server.ts` | `createServerClient` (RSC/actions) | `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `lib/supabase/proxy.ts` | `createServerClient` (proxy/refresh) | `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `lib/supabase/admin.ts` | `createClient` (service role) | `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_SERVICE_ROLE_KEY` |

**Вывод:** отдельного server-only URL нет — **все три** клиента (браузер, сервер,
admin) читают **`NEXT_PUBLIC_SUPABASE_URL`**. Спека запрещает правки кода (кроме
бампа версии), значит ввести `SUPABASE_INTERNAL_URL` нельзя. Следствие: URL
обязан быть **один и тот же**, и поскольку браузеру он должен быть достижим
(R2) — это **публичный** URL. Server-side ходит по тому же публичному URL
(локальный hop на том же боксе — R4).

Итого env на cutover меняем **тройку**: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — все на
**self-hosted** значения (не managed-ключи!). Ключи self-hosted уже существуют
и работают: 026 проверил логин против self-hosted, т.е. self-hosted anon/JWT
валидны.

## R2 — Браузер ходит в Supabase напрямую → нужен публичный TLS-эндпоинт

`createBrowserClient` шлёт запросы (логин GoTrue, anon/authenticated-чтения под
RLS) **из браузера игрока** напрямую на Supabase. Значит self-hosted API должен
быть **публично достижим по HTTPS**. Вариант «только внутренняя docker-сеть»
(из `NEXT.md`) отпадает. Публикуем **только kong** (API-гейтвей); Postgres
(5432) и Studio наружу не идут (Studio — SSH-туннель, наследие 024).

## R3 — Как Traefik (Dokploy) маршрутит на kong из plain-compose

**Факты (из `infra/server-paas-runbook.md`, 023):**
- Traefik у Dokploy — **обычный контейнер**, не swarm-сервис («Traefik runs as a
  plain container (not a swarm service)»). → нет несовместимости
  swarm-overlay ↔ bridge; plain-compose контейнер может делить сеть с Traefik.
- Subdomain-план 023 уже резервирует **`db.theloopers.org` → self-hosted
  Supabase** (в 024 не публиковали, ходили туннелем; теперь публикуем).
- TLS у 023: Cloudflare **A-record DNS-only (grey cloud)** → IP бокса, потом
  Dokploy/Traefik делает **Let's Encrypt** (ACME HTTP-01 на :80). Порты бокса:
  только 22/80/443.

**Решение:** self-hosted kong публикуется на **`db.theloopers.org`** через тот
же Traefik:
1. Прицепить контейнер `supabase-kong` к сети, которую слушает Traefik Dokploy
   (`dokploy-network` — точное имя **проверить** на боксе:
   `docker network ls`), как **external** сеть в compose self-hosted (kong
   остаётся на своём `default` + дополнительно в `dokploy-network`).
2. Навесить Traefik-лейблы на kong: `Host(\`db.theloopers.org\`)`,
   `loadbalancer.server.port=8000` (kong слушает HTTP на 8000),
   `tls.certresolver=<тот же LE-резолвер, что у Dokploy>`, entrypoint
   `websecure`.
3. Cloudflare: A-record `db` → `37.27.254.49`, **DNS-only (grey cloud)** (как
   `staging`/`panel` в 023), чтобы ACME прошёл.

Альтернатива (fallback, если лейблы/сеть не схватываются): отдать kong хост-порт
`127.0.0.1:8000` и описать его Traefik **file-provider**'ом, либо завести kong
как Dokploy-managed compose-сервис (тогда домен/HTTPS через UI Dokploy). Основной
путь — лейблы + `dokploy-network`, он минимально трогает 024-стек.

> Точное имя сети Dokploy и имя LE-certresolver — **верифицировать на боксе** в
> начале US1 (Phase A). От них зависят лейблы.

## R4 — Server-side hairpin к публичному URL (NAT loopback)

Раз URL один и публичный (R1), server-side (RSC/actions/admin) внутри
app-контейнера на боксе будет резолвить `https://db.theloopers.org` → публичный
IP бокса → Traefik :443 → kong. Это **hairpin/NAT-loopback** (контейнер стучится
на собственный публичный IP хоста). На Hetzner это **обычно** работает, но
бывает залипает в зависимости от сетевой конфигурации Docker/хоста.

**Проверка (US1, обязательная):** из app-контейнера
`curl -sS https://db.theloopers.org/auth/v1/health` (или REST root) — должен
вернуть ответ kong, не таймаут.

**Митигации, если hairpin не работает:**
- (a) `extra_hosts` / docker DNS: добавить app-контейнеру резолв
  `db.theloopers.org` → внутренний IP Traefik/kong на `dokploy-network`. Но
  внутренний путь должен сохранить **HTTPS** на том же хосте — проще указать на
  Traefik (он терминирует TLS), а не напрямую на kong:8000 (HTTP).
- (b) Положиться на то, что DNS-only (grey-cloud) резолвит в IP бокса, и
  настроить на хосте loopback NAT (Docker `userland-proxy`/iptables) — последнее
  средство.

Это **ровно та проблема, ради которой US1 — отдельная сессия без окна** (Clarify
chat 87): ловим hairpin/CORS/SITE_URL пока прод на Vercel и не тронут.

## R5 — Ключи, JWT, GoTrue SITE_URL/CORS на self-hosted

- **JWT_SECRET self-hosted не меняем** — 026 уже доказал логин против
  self-hosted (значит self-hosted GoTrue + перенесённые `auth.users` совместимы
  с текущим JWT_SECRET self-hosted). Менять нечего.
- **anon/service_role на cutover** = **self-hosted** значения (подписаны
  JWT_SECRET'ом self-hosted), НЕ managed-ключи. Иначе подпись не сойдётся.
- **GoTrue env** в `.env` self-hosted-стека (compose 024 читает их):
  - `API_EXTERNAL_URL` = `https://db.theloopers.org`
    (→ `GOTRUE_JWT_ISSUER=https://db.theloopers.org/auth/v1`).
  - `SITE_URL` = `https://theloopers.org` (на rehearsal — `https://staging.theloopers.org`).
  - `ADDITIONAL_REDIRECT_URLS` (=`GOTRUE_URI_ALLOW_LIST`) включает
    `https://theloopers.org/**` (+ staging на время rehearsal).
  - После правки `.env` — `docker compose up -d auth` (рестарт GoTrue).
- **Перелогин ожидаем:** issuer/secret self-hosted ≠ managed → старые
  managed-сессии не переносятся; игрок логинится заново (US3#4 это и проверяет).
- **CORS** — kong-плагин `cors` (есть в `KONG_PLUGINS`). Проверить, что origin
  `https://theloopers.org` принимается (Supabase-дефолт обычно `*`/настраиваемо).
  Верификация — в US1.

## R6 — Механизм фриза записи на managed

apex `theloopers.org` сейчас указывает на **Vercel** (план 023: «apex → Vercel
until cutover»), Vercel → managed. Значит **единственный путь боевой записи в
managed — через Vercel**. Фриз = убрать Vercel из пути на время финального синка.

**Решение (основное):** в начале окна **отключить/поставить на паузу
production-деплой Vercel** (Vercel UI). apex (всё ещё на Vercel) отдаёт
paused-состояние; записи в managed прекращаются. Это **обратимо** (rollback =
re-enable Vercel + вернуть apex), просто и быстро.

**Опционально (belt-and-suspenders):** на managed выставить read-only на роль/
сессии — но на managed Supabase прав может не хватить (`postgres` без
superuser); **не закладываемся**, проверка опциональна. Отключение Vercel —
достаточный и надёжный фриз для ~20 игроков и окна в минуты.

Порядок в окне: announce → **отключить Vercel** (managed затих) → финальный синк
→ counts → **флип apex DNS → бокс** → smoke → done. Короткий outage
(apex отдаёт paused, потом DNS-флип) для хобби-кампании приемлем (спека:
downtime некритичен).

## R7 — Финальный свежий синк: переиспускаем скрипты 026

Не пишем новых скриптов синка — переиспользуем 026:
- `scripts/dump-from-managed.sh` (Supabase CLI `db dump` ×3: roles/schema/data).
- `scripts/restore-into-selfhosted.sh` (`docker cp` + `psql` под
  `supabase_admin`, `session_replication_role=replica`, dry-run для version-gap).
- `resync-sequences.sql` (после импорта `setval` по `max(id)`).
- `check-migration-026.sql` (counts managed vs self-hosted **прямым SQL
  `count(*)`** — мимо клэмпа `db_max_rows=1000`, целостность FK, `auth.users`
  непустой).

**Повторяемость (Clarify→Plan):** на cutover это **повторный** прогон поверх уже
населённого 026 self-hosted. Безопасный путь — **«снёс данные self-hosted →
залил заново»** (а не дельта-merge): `docker compose down db` → удалить bind-mount
`volumes/db/data` → `up` (init заново) → restore из свежего managed-дампа. Так
исключаем дубли/расхождения от двух наложений. Объём мал (~1200 нод) → быстро.
Идемпотентный merge сложнее и рискованнее — не выбираем.

> Тонкость: после пересоздания data-dir self-hosted JWT_SECRET/ключи/роли должны
> сохраниться (они из `.env`/init, не из данных). Перед сносом — **снять
> физический бэкап** (R10) как страховку.

## R8 — DNS / Cloudflare: флип apex

**Текущее (проверить на cutover):** apex `theloopers.org` → Vercel (A-record на
anycast Vercel либо CNAME-flattening). `staging` и `panel` → IP бокса DNS-only.

**Флип:** изменить apex A-record `theloopers.org` → **`37.27.254.49`**,
**DNS-only (grey cloud)** (как `staging`/`panel`, чтобы Traefik ACME выдал серт
на apex). TTL на Cloudflare короткий → распространение быстрое. Опционально
`www` → apex (редирект) — не блокер.

**App-домен в Dokploy:** у приложения сейчас домен `staging.theloopers.org`. На
cutover в Dokploy сменить домен приложения на **`theloopers.org`** (apex), порт
3000, HTTPS (LE) — это UI-действие Dokploy (не ручные лейблы). `staging` снимаем
(Clarify: один env). `NEXT_PUBLIC_SUPABASE_URL`=`https://db.theloopers.org` при
этом **не меняется** между rehearsal и cutover — флипается только фронт-домен и
GoTrue `SITE_URL`.

## R9 — Откат: механика и «чистое окно»

**env-откат:** Dokploy хранит предыдущие деплои; откат тройки env
(URL+anon+service) на **managed**-значения — это смена env + redeploy (или
redeploy прежнего деплоя). **Домен-откат:** вернуть apex A-record → Vercel +
re-enable Vercel production-деплой.

**Правило (US4):**
- Откат **чистый** только в **узком окне** сразу после флипа, пока в self-hosted
  не накопились новые записи (managed заморожен с момента фриза и не растёт).
- Триггеры отката: smoke реального игрока не проходит (логин/чтение/запись),
  hairpin/CORS-сбой не чинится за окно, серт/домен не поднялись.
- **Поздний откат** (после значимых записей в self-hosted) теряет их → это не
  штатный путь; тогда «вперёд + чинить».
- После **вывода** Vercel (decommission) быстрый возврат на Vercel недоступен;
  страховка тогда — env приложения назад на managed при живом приложении на
  боксе (managed грейс-период жив).

**Dry-run (US4):** прогнать смену env приложения managed→self-hosted→managed на
rehearsal-URL (staging) и засечь время — до реального cutover.

## R10 — Бэкапы после cutover

Физический бэкап 026 (`infra/backup.sh`: stop `db` → tar `volumes/db/data` →
R2 → ротация 30/28; ночной cron) **уже нацелен на self-hosted-бокс**. После
cutover этот же бокс держит **боевые** данные → бэкапы автоматически защищают
прод; менять скрипты не нужно. Подтвердить (US5): ночной прогон после cutover
зелёный, свежий бэкап содержит актуальные данные + `auth.users` с хешами (на
restore). Нюанс: cold-copy подразумевает краткую остановку `db` — теперь это
короткий **ночной** downtime боевого self-hosted; приемлемо (или подтвердить
`pg_basebackup` без downtime — опция из 026). `infra/backup-restore-runbook.md`
дописать строкой «self-hosted = prod после 027; окно ночного cold-copy».

---

## Сводка решений (для Plan)

| # | Вопрос | Решение |
|---|---|---|
| R1 | URL для server vs browser | **Один публичный** (кода не трогаем) |
| R2 | Экспозиция | Только kong, публично по HTTPS; 5432/Studio закрыты |
| R3 | Маршрут Traefik→kong | kong в `dokploy-network` + Traefik-лейблы; `db.theloopers.org` |
| R4 | Server-side доступ | По тому же публичному URL (hairpin); проверить в US1, митигация наготове |
| R5 | Ключи/GoTrue | env-тройка → self-hosted; SITE_URL/API_EXTERNAL_URL/redirects; перелогин ок |
| R6 | Фриз | Отключить Vercel prod-деплой на время окна |
| R7 | Финальный синк | Переиспуск 026-скриптов; «снёс data → залил заново» |
| R8 | DNS-флип | apex A → IP бокса (grey-cloud); домен приложения staging→apex в Dokploy |
| R9 | Откат | env-тройка назад + apex назад; чистое окно узкое |
| R10 | Бэкапы | 026-бэкап уже на боксе = теперь прод; подтвердить ночной прогон |
