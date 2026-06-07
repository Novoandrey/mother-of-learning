# kong-traefik — публикация self-hosted API на `db.theloopers.org` (spec-027 Phase A)

Цель: сделать self-hosted Supabase API (kong) доступным браузеру по HTTPS через
тот же Traefik, что крутит Dokploy — **без host-порта**. Наружу только kong;
Postgres 5432 и Studio закрыты (Studio = SSH-туннель, как в 024).

Почему публично: браузер ходит в Supabase напрямую (`createBrowserClient` +
`NEXT_PUBLIC_SUPABASE_URL`), значит эндпоинт обязан быть публичным (research R2).
Server-side приложение ходит туда же (один URL, research R1/R4).

## Шаг 1 — 🐧 Верифицировать имена на боксе (T003)

```bash
# имя сети Dokploy (обычно dokploy-network):
docker network ls
# имя LE-резолвера Traefik у Dokploy (обычно letsencrypt):
#   посмотреть в конфиге Traefik Dokploy или на дашборде Traefik
docker ps | grep -i traefik         # найти контейнер traefik
# (если есть доступ к traefik.yml/динамике — grep certresolver)
```

Подставить найденные имена в `compose-override.kong.yml` (поля помечены `VERIFY`).

## Шаг 2 — 🌐 Cloudflare DNS

Добавить A-запись `db` → `37.27.254.49`, **DNS-only (серое облако)** — как
`staging`/`panel` в 023 (нужно, чтобы Traefik прошёл ACME HTTP-01).

```bash
dig +short db.theloopers.org        # → 37.27.254.49
```

## Шаг 3 — 🐧 Применить override

```bash
cd ~/supabase/docker
docker compose -f docker-compose.yml -f compose-override.kong.yml up -d kong
docker compose ps kong              # healthy
```

Traefik (Docker-provider) подхватит лейблы и выпустит LE-серт на `db.theloopers.org`.

## Шаг 4 — 🐧 Проверка

```bash
# снаружи (или с локальной машины):
curl -sS https://db.theloopers.org/auth/v1/health        # → {"...":true} / 200, валидный серт
# 5432 закрыт:
nc -z -w3 37.27.254.49 5432 && echo OPEN || echo CLOSED  # → CLOSED
```

✅ **CHECKPOINT A:** `https://db.theloopers.org/auth/v1/health` отвечает с
валидным сертом; 5432 закрыт; Studio только туннель.

## Если не схватилось (troubleshoot)

- **Серт не выпустился** → проверь A-запись **DNS-only** (не оранжевое облако,
  иначе ACME HTTP-01 не пройдёт); порт 80 открыт на боксе (ufw 80/443 из 023);
  имя certresolver в лейбле совпадает с конфигом Dokploy-Traefik.
- **Traefik не видит kong / 404** → `traefik.docker.network` должен указывать на
  сеть Dokploy; kong реально в этой сети (`docker inspect supabase-kong | grep -A3 Networks`);
  Traefik watch'ит docker (Dokploy так и настроен), `traefik.enable=true` стоит.
- **502 от Traefik** → `loadbalancer.server.port=8000` (kong слушает HTTP на 8000),
  не 8443.
- **Имя сети external не найдено** → раскомментить `name:` в `networks:` блоке
  override и вписать точное имя из `docker network ls`.

> **Hairpin server-side** проверяется отдельно в Phase B (T007) — это про доступ
> из app-контейнера, не из браузера.
