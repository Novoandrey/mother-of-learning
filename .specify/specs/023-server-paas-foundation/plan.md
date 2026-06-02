# Implementation Plan: Server & PaaS Foundation (023)

**Feature Branch**: `023-server-paas-foundation`
**Phase**: Plan
**Status**: ✅ Implemented (2026-06-02, chat 83) — box live, staging deployed over HTTPS, survives reboot. 024 is next (rescale box to 8 GB first).
**Spec**: `./spec.md` (Clarified, chat 83)
**Runbook (исполняемый)**: `infra/server-paas-runbook.md` — конкретные
команды/конфиги, по которым катает оператор. `plan.md` — решения и
обоснования (spec-kit-гейт), runbook — «что именно набирать».

## Architecture decisions

| Решение | Выбор | Почему |
|---|---|---|
| PaaS | **Dokploy** | Легче Coolify (~350 МБ idle), Docker+Traefik под капотом; one-line install ставит Docker Swarm + Traefik + postgres:16 + redis:7 (служебные для самого Dokploy). |
| VPS | **Hetzner CX23** сейчас (2 vCPU / 4 ГБ / 40 ГБ NVMe, Helsinki), **rescale до 8 ГБ на 024** | CX33 (8 ГБ) — целевой, но Cost-Optimized «limited availability»; в наличии только CX23. 4 ГБ хватает для среза 023 (Dokploy + Next-staging, Supabase ещё нет). На 024 (self-hosted Supabase) — rescale вверх (CX33, либо always-available CPX31). Dokploy требует ≥2 ГБ / ≥30 ГБ — проходим. Ubuntu 24.04 LTS. |
| Reverse-proxy + SSL | **Traefik (встроен в Dokploy)** + Let's Encrypt | Из коробки; не поднимаем отдельный прокси. Traefik владеет портами 80/443 — приложения объявляют порт через `expose`, не биндят 80/443. |
| DNS + регистратор | **Cloudflare** (at-cost ~$10/год) | Одна экосистема с R2; A-записи в режиме **DNS-only (серое облако)** на старте, чтобы Traefik прошёл ACME-валидацию Let's Encrypt; проксирование (оранжевое облако) — опционально позже. |
| Схема доменов | `staging.<domain>` → приложение; `panel.<domain>` → дашборд Dokploy (HTTPS); **apex остаётся на Vercel до cutover (027)** | Переключение прода = одно осознанное действие в конце, а не «уронили живой домен на середине переезда». |
| Сборка приложения | **Dockerfile (Next 16 standalone)**, билдит Dokploy из сабдира монорепо `mat-ucheniya/` | Next 16 `output: 'standalone'` даёт компактный рантайм-образ. |
| Бэкенд для staging | **существующий managed Supabase** | Self-hosted Supabase — это 024, его ещё нет. Staging смотрит на текущий managed-инстанс **только чтобы проверить пайплайн+SSL** (см. risk «shared DB»). |
| Доступ к дашборду | **SSH-туннель для первичной регистрации** (порт 3000 наружу не открываем), затем `panel.<domain>` через Traefik HTTPS; 3000 закрыт в ufw | Закрывает FR-007 «дашборд не публичен» чисто, без окна, когда 3000 торчит в интернет. |

## Build/CI authority transition

Раньше авторитетной сборкой/тайпчеком был **Vercel CI** (локальный
`npm install` в песочнице падает с ENOTEMPTY — поэтому пушили и доверяли
Vercel). Теперь авторитет переходит к **серверной Docker-сборке Dokploy**:
билд идёт в чистом Linux-контейнере на боксе, ENOTEMPTY там нет. Claude
по-прежнему **не собирает локально** — собирает бокс. После cutover (027)
Vercel выводится из эксплуатации.

## Структура / где что лежит

- `infra/server-paas-runbook.md` — исполняемый runbook (переносимый; не
  app-specific). Оператор катает по нему.
- Добавляется в `mat-ucheniya/` на фазе Implement (готовые файлы — в
  runbook'е): `Dockerfile`, `.dockerignore`, правка `next.config.ts`
  (`output: 'standalone'`).
- Секреты — в **Environment-вкладке Dokploy**, не в git. Важно:
  `NEXT_PUBLIC_*` инлайнятся на **этапе сборки** Next — они должны быть в
  env Dokploy **до** билда (иначе фронт получит пустые значения). Сервисные
  ключи (`SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`) — рантайм.

## Version pins / research notes

- Dokploy install: `curl -sSL https://dokploy.com/install.sh | sh` (root,
  не в контейнере). Ставит Docker (если нет), Swarm-режим, Traefik,
  postgres:16, redis:7. Падает, если 80/443/3000 заняты.
- Порты: 80 + 443 (Traefik), 3000 (UI — закрываем после настройки домена).
- Ubuntu 24.04 LTS. Node 20-alpine в Docker-сборке (Next 16 требует Node ≥18.18; берём 20).
- fail2ban: дефолт мониторит SSH, банит после 5 неудач. unattended-upgrades — авто-патчи безопасности.

## Risks & mitigations

- **Лок-аут себя файрволом** → в ufw разрешить `22/tcp` **до** `ufw enable`; запасной доступ — веб-консоль Hetzner (FR-005).
- **Дашборд наружу** → первичная регистрация через SSH-туннель, 3000 закрыт в ufw; затем `panel.<domain>` за Traefik HTTPS; 2FA на админ-аккаунте; Dokploy держать обновлённым.
- **Доступность Hetzner из РФ** (троттлится) → для этого контента приемлемо; игроки при необходимости через VPN; для staging — не блокер.
- **Shared staging DB**: staging смотрит на тот же managed Supabase, что текущий прод (Vercel). На staging **не делать деструктивных записей**; либо поднять отдельный бесплатный Supabase-проект под staging. Решение оператора; по умолчанию — read-mostly, без деструктива.
- **Let's Encrypt / DNS не распространился** → A-запись в DNS-only; проверить пропагацию (`dig`) до выпуска серта; учитывать rate-limit LE.
- **NEXT_PUBLIC_* пустые на проде** → выставить их в env Dokploy до сборки.

## Integration points (на чём строятся 024–027)

- **024**: self-hosted Supabase как сервис/compose в Dokploy на `db.<domain>`; env staging-приложения репойнтится с managed на self-hosted.
- **025**: бэкапы целятся в self-hosted Postgres; restore-drill на нём.
- **027 cutover**: apex `<domain>` переключается с Vercel на бокс; managed Supabase и Vercel выводятся из эксплуатации.

## Maps to spec (что чем закрывается)

- US1/SC-001..002 (хардненинг, ключи, firewall) → runbook шаги 1–2.
- US2/SC-003 (дашборд за HTTPS, не публичен) → шаги 3–4 (туннель + panel + close 3000).
- US3/SC-004..005 (git-деплой `mat-ucheniya` по HTTPS + откат) → шаги 5–8.
- SC-006 (после reboot всё поднимается) → шаг 9.
- SC-007 (бэкап конфигурации Dokploy) → шаг 10.

## Deferred to Tasks / Implement

- Фактическое создание `Dockerfile` / `.dockerignore` / правки
  `next.config.ts` (готовые в runbook'е) — коммитит Claude на Implement.
- Прогон runbook'а на боксе — **оператор** (нет SSH-доступа у Claude);
  Claude разбирает присланные логи и правит артефакты.
- Опционально: формальный `tasks.md`. Для одного инфра-среза runbook уже
  упорядочен и с чекбоксами — отдельный `tasks.md` может быть избыточен.

## Execution

→ Открыть `infra/server-paas-runbook.md` и идти по шагам 0–10.
