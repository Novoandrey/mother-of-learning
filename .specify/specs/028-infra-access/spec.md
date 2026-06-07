# Feature Specification: Infra access for collaborators (spec-028) — mini-spec

**Feature Branch**: `028-infra-access`
**Created**: 2026-06-07
**Status**: Specify — recommended defaults baked in; ready to execute (awaiting "ok")
**Depends on**: spec-027 cutover (the box is the live prod: app on Dokploy +
self-hosted Supabase, prod = https://theloopers.org).

> Mini-spec (runbook-style, like 027 family). Goal: give **Лёша** and **Никита**
> hands-on operational access to the production box + a short onboarding doc, so
> they can help with ops/debugging without routing every command through Andrey.
> They already have Git. This grants **server / panel / Studio** access only.

## Зачем (one-liner)

Сейчас на боксе руками ходит только Андрей; `infra/README.md` прямо фиксирует
оператора как «Андрей + Лёша». Лёша — DevOps-советчик по проекту, Никита
подключается к инфре. Нужно дать им собственный, аудируемый и легко отзываемый
доступ к серверу (Hetzner CPX32, Helsinki, theloopers.org) и написать короткую
вводную «что это за коробка и как в неё заходить».

## Scope (что входит)

1. **SSH — персональные учётки.** Заводим отдельных Unix-пользователей `lesha`
   и `nikita`, у каждого свой `~/.ssh/authorized_keys` ровно с его **публичным**
   ed25519-ключом. Не общий аккаунт, не общий ключ, не root. Даёт: пер-человека
   аудит (`auth.log` видит кто заходил), независимый отзыв, никакого
   шеринга ключей.
2. **sudo.** Оба в группе `sudo` (они делают реальный ops). Альтернатива
   «только `docker`-группа без sudo» рассмотрена и **отклонена**: доступ к
   docker-сокету и так = root-эквивалент, экономия нулевая, а трения добавляет.
3. **Dokploy панель** (`panel.theloopers.org`). Каждому — **свой** аккаунт в
   Dokploy с **2FA**. Не делимся логином Андрея. (RBAC/мультиюзер зависят от
   версии Dokploy — точные роли подтвердить в Web → Settings; если мультиюзера
   нет — общий логин как fallback, но это хуже, отметить.)
4. **Supabase Studio.** Studio висит **без авторизации за SSH-туннелем**
   (порт 8001) — значит **SSH-доступ = Studio-доступ**. Каждый туннелит под
   своей SSH-учёткой (`ssh -L 8001:localhost:8001 lesha@<box>` → `localhost:8001`).
   Отдельных кред у Studio нет.
5. **Онбординг-док** `infra/server-access.md` (по-русски, для Лёши и Никиты):
   карта коробки и доменов, контексты команд (🖥️/🐧/🌐), как зайти по SSH, как
   деплоить через Dokploy, как открыть Studio туннелем, правила безопасности,
   отзыв доступа. + точные команды для Андрея «как добавить нового человека».

## Out of scope (не входит)

- **Root-логин** — никто не логинится root'ом; только key-only sudo-юзеры
  (наследие `00-hardening.conf`: `PermitRootLogin no`, `PasswordAuthentication no`).
- **Внешний прямой доступ к Postgres** — 5432 остаётся закрыт фаерволом.
  Read-only туннель к БД для Claude — отдельная **spec-029**, не здесь.
- **Авто-деплой / CI-on-push** — это relocated **spec-043** (бывш. 028-стаб).
- **Пер-человека гранулярные роли в БД** — оба пользуются Studio под
  service-role (обходит RLS). Для маленькой доверенной команды приемлемо; можно
  пересмотреть позже, если состав вырастет.

## Security notes (важное)

- **Studio = полный доступ к данным.** Studio ходит под service-role и **обходит
  RLS** — это фактически админ-доступ к прод-БД на чтение и запись. Поэтому
  «дать SSH» здесь = «дать админ-доступ к данным». Андрей выдаёт это **осознанно**
  доверенным людям. Деструктивные / массовые правки — через **ревью-миграции**
  (`BEGIN/COMMIT`, idempotency guards), а не ad-hoc в SQL-редакторе. Бэкапы в R2
  (ночной cron, ротация 30/28) — страховочная сеть.
- **Персональные учётки** — единственный способ получить аудит и чистый отзыв.
- **Ключи only.** Лёша и Никита генерят пару локально, отдают Андрею **только
  `.pub`**. Приватный ключ не покидает их машину.
- **Master-switch отзыва.** Так как 5432 закрыт, а Studio только за туннелем,
  удаление SSH-юзера разом отрубает и сервер, и Studio.

## Acceptance scenarios

1. **Given** добавленный юзер `lesha`, **When** `ssh lesha@<box>` его ключом,
   **Then** вход проходит, `docker ps` работает, root-логин по-прежнему отказан.
2. **Given** аккаунт Лёши в Dokploy с 2FA, **When** он заходит на
   `panel.theloopers.org` и жмёт Redeploy приложения, **Then** деплой
   стартует (логи/rollback видны в дашборде).
3. **Given** SSH-доступ Никиты, **When** `ssh -L 8001:localhost:8001 nikita@<box>`
   + `localhost:8001`, **Then** открывается Studio с прод-данными.
4. **Given** уход коллаборатора, **When** Андрей делает
   `sudo deluser --remove-home <user>` + удаляет его Dokploy-аккаунт,
   **Then** его SSH/Studio-доступ пропадает <5 мин, остальные и сам Андрей
   не затронуты; `ssh <user>@<box>` отказывает.

## Deliverables

- Этот `spec.md`.
- `infra/server-access.md` — онбординг-док + операторские команды для Андрея
  (adduser → sudo → authorized_keys с ИХ pub-ключом; отзыв).

## Связь

- Переносимый кусок (онбординг на коробку, не про это приложение) живёт в
  `infra/` — по правилу из `infra/README.md`.
- Парный мини-спек **029** (read-only Postgres MCP для Claude) — отдельный
  доступ, отдельная учётка, отдельный отзыв.
