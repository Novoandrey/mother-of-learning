# Research — 024 Self-hosted Supabase

> Факты для пиннинга образов и обрезки стека. Источник для `plan.md` и
> будущего `runbook.md`. Версии сверены 2026-06-06.

## Версии (источник истины для пиннинга)

**Прод (managed, Dashboard → Infrastructure):**
- Postgres **`17.6.1.104`** (доступен апгрейд до `17.6.1.127` — **НЕ применяем**)
- GoTrue / Auth **`2.189.0`**
- PostgREST **`14.5`**

**Официальный self-hosted compose** (`supabase/supabase`, `docker/docker-compose.yml`,
срез ~апрель 2026) — версии в стабильном релизе «протестированы вместе»:
- studio `supabase/studio:2026.04.27-sha-5f60601`
- kong `kong/kong:3.9.1`
- auth `supabase/gotrue:v2.186.0` ← на 3 патча старше прода (2.189.0)
- rest `postgrest/postgrest:v14.8` (прод 14.5 — compose новее, обратно совместимо, ок)
- meta `supabase/postgres-meta:v0.96.3`
- db `supabase/postgres:15.8.1.085` ← **PG15!** прод на **PG17** → override обязателен (ниже)

> ⚠️ Дока: стабильные релизы compose выходят ~раз в месяц; версии в релизе
> протестированы вместе, смена тега отдельного образа — «совместимость не
> гарантируется». **Подтверждено: дефолтный compose на PG15
> (`15.8.1.085`), а прод на PG17 (`17.6.1.104`).** `pg_dump`/`pg_restore`
> дамп более старшего мажора (17) в более младший (15) **не заливает** →
> PG15 self-hosted = жёсткий блокер для миграции данных в 026. Значит
> **db-образ обязательно override-им на `supabase/postgres:17.x`** (любой
> публичный `17.6.1.x`, latest `17.6.1.132` — это PostgreSQL **17.6**, как у
> прода `.104`; 4-й сегмент = билд образа Supabase, не патч PG → одинаковый
> PG-мажор+минор, restore-совместимо). Это отклонение от «протестировано вместе», но практический
> риск низкий: managed Supabase крутит ровно эти компоненты (gotrue,
> postgrest, postgres-meta, studio) поверх PG17. Прод НЕ апгрейдим (17.6.1.104
> → 17.6.1.127); self-hosted догоняет прод. Остальные образы — из релиза как
> есть.

## Состав официального стека и решение по обрезке

| Сервис | Образ | 024 | Причина |
|---|---|---|---|
| db (Postgres) | supabase/postgres | **KEEP** | ядро |
| auth (GoTrue) | supabase/gotrue | **KEEP** | приложение использует Auth |
| rest (PostgREST) | postgrest/postgrest | **KEEP** | Data API |
| kong (gateway) | kong/kong | **KEEP** | роутинг + ключи |
| studio | supabase/studio | **KEEP** | управление инстансом |
| meta (postgres-meta) | supabase/postgres-meta | **KEEP** | Studio зависит (SQL / table editor) |
| realtime | supabase/realtime | REMOVE* | не используется |
| storage | supabase/storage-api | REMOVE* | не используется |
| imgproxy | darthsim/imgproxy | REMOVE | нужен только storage |
| functions (edge-runtime) | supabase/edge-runtime | REMOVE* | не используется |
| analytics (Logflare) | supabase/logflare | REMOVE | observability вне 024; ломает Studio «Logs» UI (ок) |
| vector | timberio/vector | REMOVE | питает только analytics |
| supavisor (pooler) | supabase/supavisor | REMOVE | приложение ходит через REST/Auth API, не прямым PG-коннектом; `pg_restore` (026) — на боксе напрямую |

(*) удаление гейтится подтверждением неиспользования (US1 / FR-002).

## Гочи (из compose + доки)

1. **Kong публикует порты.** В compose: `${KONG_HTTP_PORT}:8000` и
   `${KONG_HTTPS_PORT}:8443`. Docker-publish **обходит ufw** (урок 023,
   порт 3000). → Под вариант B хост-публикацию Kong **убираем** (или
   биндим на `127.0.0.1`); Kong доступен только в Docker-сети.
2. **Studio за Kong.** В дефолте Studio отдаётся через Kong (плагин
   basic-auth, `DASHBOARD_USERNAME/PASSWORD`). Чтобы под B Kong не
   публиковать, но дать Studio наружу: Traefik (Dokploy-домен) вешаем на
   сервис `studio:3000` напрямую + Traefik basic-auth middleware. Studio
   server-side всё равно ходит в `meta:8080` и `kong:8000` по Docker-сети
   (SQL / table editor → meta, что нам и нужно для миграций и `\dx`/`\dn`).
   Альтернатива — публиковать Kong и резать `/rest|/auth` на Traefik
   (грязнее). Финальная форма — в runbook.
3. **`depends_on: analytics`.** У studio (и др.) есть зависимость от
   analytics (`condition: service_healthy`). Удаляя analytics + vector,
   надо снять эти `depends_on` у оставшихся сервисов и ссылки на
   vector-логирование, иначе не стартуют.
4. **GoTrue 2.186 (compose) vs 2.189 (прод).** На 024 (пусто) не критично.
   Для 026 (миграция `auth.users` + хеши паролей): auth-схему мигрирует
   сам GoTrue на старте; держать версию ≥ прод желательно — **watch-item
   для 026**.
5. **Ключи.** `ANON_KEY` / `SERVICE_ROLE_KEY` — JWT, производные от
   `JWT_SECRET`; при смене секрета перегенерировать. Генерация:
   `openssl rand -base64 32` (для `POSTGRES_PASSWORD`, `JWT_SECRET`) +
   генератор ключей Supabase для anon/service.

## Сверка паритета (US3 / FR-009..011, на пустом стеке до 026)

- расширения: `\dx` self-hosted vs прод;
- схемы: `\dn` self-hosted vs прод (ожид.: `auth`, `storage`, `extensions`,
  `graphql`, `realtime`, …);
- версия: `show server_version;` обе стороны.

## Источники
- docs: `supabase.com/docs/guides/self-hosting` и `.../self-hosting/docker`
  (.md) — удаление ненужных сервисов, reverse-proxy для HTTPS, ритм релизов.
- `github.com/supabase/supabase` → `docker/docker-compose.yml` (теги образов,
  `depends_on`, публикация портов Kong).
- supabase-скилл (`/mnt/skills/user/supabase`): «сверяться с актуальной
  докой», RLS/безопасность.
