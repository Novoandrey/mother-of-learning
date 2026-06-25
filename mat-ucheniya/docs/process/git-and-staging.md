# Git-флоу и staging

> Текущий деплой-флоу: PR-only `main`, CI-гейт, Dokploy на Hetzner. Staging —
> отдельная облачная БД и ветка `staging` для ручной проверки до мержа.
> Ломать staging можно; ломать прод нельзя. Детали деплоя и доступов — в `infra/`.

---

## Текущий флоу (spec-043)

`main` — священная ветка: принимает **только Pull Requests**, защищена GitHub ruleset. CI-гейт бежит и на PRы. Прямой push в `main` заблокирован.

Типичный цикл разработки:

1. **Ветка от `main`**: `claude/NNN-short-description` для кода с AI, `spec-NNN` или `fix-NNN` для других случаев.
2. **Хочешь потыкать руками** — смержи ветку в `staging`: она автодеплоится на https://staging.theloopers.org (своя БД, данные не боевые).
3. **Применяешь миграцию** к staging-БД вручную (если нужно), тестируешь.
4. **Открываешь PR** своей feature-ветки в `main`. CI зелёный → Andrey или кто-то с доступом мержит.
5. Merge → Dokploy строит образ на боксе → прод обновился. Telegram-бот MrBranches шлёт уведомление о ветках и PRах.

> Никогда не мержи ветку `staging` в `main`. `staging` = throwaway; feature-ветка = источник истины.

---

## Конвенция имён веток

| Тип | Шаблон | Пример |
|---|---|---|
| AI-работа по спеке | `claude/NNN-slug` | `claude/052-inventory-containers` |
| Спека / фича вручную | `spec-NNN` | `spec-052` |
| Быстрый фикс | `fix-NNN` или `fix-slug` | `fix-sidebar-cache` |
| Доки / мета | прямо в `main` | — (meta-файлы не требуют PR) |

Правило двух путей: **app-код** (`mat-ucheniya/**`, кроме `*.md`) — только через PR; **мета-файлы** (`.specify/`, `chatlog/`, `meta/`, `infra/`, `scripts/dev/`, любые `*.md`) — прямо в `main`, они не триггерят деплой.

Исключение: `.github/workflows/*.yml` — бот-PAT не имеет `workflow`-разрешения, такие файлы коммитит пользователь.

---

## Staging

**https://staging.theloopers.org** — копия прода для тестирования. Staging = ветка `staging` в Dokploy + **облачная** Supabase-БД (бывший managed project, сейчас на free-tier).

Ключевые свойства:
- Своя БД (snapshot прода, обновляется через `infra/staging-runbook.md`).
- Ломать можно — это и есть смысл staging.
- Нет бэкапов по дизайну.
- `staging-keepalive.yml` — cron каждые ~5 дней, чтобы free-tier проект не замер.

**Ресет staging-ветки** (любой разработчик, когда staging сломан или устарел):

```bash
git fetch && git checkout staging && git reset --hard origin/main \
  && git push --force-with-lease origin staging
```

**Обновление staging-БД** (refresh prod→staging, детали в `infra/staging-runbook.md`):

```bash
ssh <box> 'sudo bash /opt/mat-ucheniya/staging-refresh.sh'
```

---

## Прод-деплой и доступы

Прод — Hetzner CPX32 Helsinki (`37.27.254.49`), под Dokploy. На боксе:
- **Next.js-приложение** (standalone-контейнер).
- **Self-hosted Supabase** (db/auth/rest/kong/studio; Studio наружу не торчит — только через SSH-туннель).
- **Realtime** (`supabase/realtime:v2.76.5` через kong `/realtime/v1/`; WAL-слот стережёт `infra/wal-slot-monitor.sh`).
- Ночные бэкапы в Cloudflare R2 (ротация 30 daily / 28 weekly).

Postgres-порт **5432 закрыт** снаружи. Доступ к БД — SSH-туннель + Studio (`http://localhost:8001`). Studio = service-role, обходит RLS — только ревью-миграции через `BEGIN; … COMMIT;`, не правки руками.

Доступ к боксу (full-ops: shell + деплой + БД-консоль): **Andrey**, **Лёша**, **Никита**. Онбординг нового человека — `infra/server-access.md`.

Миграции: prod-флоу не изменился — вручную через Studio или psql после мержа.

---

## CI-пайплайны

| Файл | Когда бежит | Что делает |
|---|---|---|
| `ci-pr.yml` | каждый PR в `main` | lint + typecheck + vitest; красный блокирует мерж |
| `deploy-staging.yml` | push в `staging` | гейт → Dokploy деплоит staging-приложение |
| `staging-keepalive.yml` | cron ~5 дней | один REST-запрос → free-tier БД не засыпает |

> См. также: [`README.md`](README.md), [`versioning.md`](versioning.md).
> Runbook'и: `infra/staging-runbook.md`, `infra/server-access.md`, `infra/realtime-runbook.md`.
