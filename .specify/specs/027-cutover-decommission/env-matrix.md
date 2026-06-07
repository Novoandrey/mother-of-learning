# env-matrix — точные env до/после cutover (spec-027, research R1/R5)

Две стороны: (1) приложение в Dokploy, (2) `.env` self-hosted-стека на боксе.
Кода не трогаем — `NEXT_PUBLIC_SUPABASE_URL` читают и браузер, и сервер, и admin
(R1), поэтому URL **один и публичный** на всё.

## 1) Приложение в Dokploy (Environment секция)

| Переменная | Сейчас (managed) | После (self-hosted) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<managed-ref>.supabase.co` | **`https://db.theloopers.org`** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<managed anon>` | **`<self-hosted ANON_KEY>`** |
| `SUPABASE_SERVICE_ROLE_KEY` | `<managed service_role>` | **`<self-hosted SERVICE_ROLE_KEY>`** |

- **Откуда брать self-hosted ключи:** из `~/supabase/docker/.env` на боксе —
  `ANON_KEY` и `SERVICE_ROLE_KEY` (заданы в 024). Это ключи, подписанные
  **JWT_SECRET self-hosted** — managed-ключи НЕ подойдут (подпись не сойдётся).
- 🔴 **Build-time Arguments (грабли 023!):** оба `NEXT_PUBLIC_*` продублировать
  в **Build-time Arguments** Dokploy, иначе сборка стартует, но первый запрос
  500-ит: «Your project's URL and Key are required». `SUPABASE_SERVICE_ROLE_KEY`
  — runtime-only, в Build-args НЕ нужен.
- После правки env → **Redeploy**.

> На **rehearsal** (US1) меняем ровно эту тройку на staging-приложении. На
> **cutover** (US3) тройка уже self-hosted (с rehearsal) — меняется только
> фронт-домен (см. ниже) и `.env` self-hosted SITE_URL.

## 2) `.env` self-hosted (`~/supabase/docker/.env`)

| Переменная | Rehearsal (US1) | Cutover (US3) |
|---|---|---|
| `API_EXTERNAL_URL` | `https://db.theloopers.org` | `https://db.theloopers.org` |
| `SITE_URL` | `https://staging.theloopers.org` | **`https://theloopers.org`** |
| `ADDITIONAL_REDIRECT_URLS` | `https://staging.theloopers.org/**` | **`https://theloopers.org/**`** |

- `API_EXTERNAL_URL` задаёт `GOTRUE_JWT_ISSUER = <...>/auth/v1` — оставляем
  `db.theloopers.org` на обоих этапах (стабилен).
- `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` в `.env` **НЕ меняем** — это
  ключи self-hosted из 024; 026 уже доказал логин против них.
- После правки `.env`:
  ```bash
  cd ~/supabase/docker && docker compose up -d auth      # рестарт GoTrue
  ```
- На rehearsal можно временно держать в `ADDITIONAL_REDIRECT_URLS` и staging, и
  apex через запятую; на cutover оставить apex.

## Перелогин ожидаем

Issuer/secret self-hosted ≠ managed → старые managed-сессии не переносятся.
После cutover игроки **логинятся заново** текущим паролем (US3#4 это и
проверяет) — это нормально, не баг. Если у кого-то «висит» старая сессия с
прошлого origin — «выйти и зайти снова».

## CORS

kong-плагин `cors` включён (`KONG_PLUGINS`). На rehearsal (T008) убедиться, что
origin приложения (`https://staging.theloopers.org`, затем `https://theloopers.org`)
принимается — логин/запросы из браузера не режутся CORS-ошибкой в консоли.
