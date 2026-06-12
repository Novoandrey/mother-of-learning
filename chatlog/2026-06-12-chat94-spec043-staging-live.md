# Chat 94 — spec-043: staging live (облачная БД + PR-only main), 2026-06-12

## Контекст (откуда пришли)
Андрей запросил спеку staging-окружения (облачный Supabase free, прод не
трогаем). За одну сессию: Specify → Clarify (Q0–Q7) → Plan → Tasks →
Implement; вторая половина — операторский батч Андрея в реальном времени.

## Что сделано
- **spec-043 → Done — staging live.** Staging-БД = бывший managed-проект
  (даунгрейд до Free, переиспользован; 027/T025 и decommission-checklist
  переписаны, чтобы проект не удалили 14.06). Второе Dokploy-приложение
  `staging.theloopers.org` с ветки `staging`; деплой через
  `deploy-staging.yml`; гейт на каждом PR (`ci-pr.yml`); keep-alive раз в
  5 дней (`staging-keepalive.yml`).
- **PR-only `main`**: ruleset (require PR, approvals 0, bypass = Repository
  admin → мета-коммиты Claude идут напрямую). Код — через PR; мета/доки —
  напрямую (Q7b).
- `infra/staging-refresh.sh` (prod→staging снапшот: public целиком +
  auth.users/identities data-only; guard направления — DSN только из
  root-файла на боксе) + `infra/staging-runbook.md`.
- Канон-доки: `AGENTS.md` §Shipping; `claude-project-instructions.md` —
  универсальный (плейсхолдеры `<GITHUB_USERNAME>`/`<GITHUB_PAT>`, «Setup for
  a teammate», Shipping-правила).
- R4: бот-PAT не умел PR (403) → Андрей добавил Pull requests RW → повторная
  проба 422 ✅. SC-001 smoke ✅. SC-002 ✅: нода «ниртак» удалена на staging,
  на проде `count(public.nodes)` = 1602 до и после; логин прод-паролем
  работает (auth-копия жива, R5 ок).

## Грабли
- Ветка `staging` была создана **до** коммита воркфлоу → push-триггер молчал
  (GitHub читает workflow с пушнутой ветки). Лечение — первый боевой reset
  `staging` на `main`.
- PowerShell 5.1: `&&` и глоб `*.yml` в `git mv` не работают — команды
  построчно и пофайлово.
- Параллельный пуш закрытия chat 93 (пивот spec-022 → эпик RPG-движка)
  словил mid-session — rebase чистый.

## Миграции
- (нет)

## Коммиты
- `4a9afd3` Specify · `4cb5fba` Clarify Q0–Q6 · `62ecbe5` Q7 + страховка T025
  · `3bf3a20` Plan · `e4aa68a` Tasks + Phase A · `b415ca7` workflows (Андрей)
  · close-out — этот коммит.

## Действия пользователю (после чата)
- [ ] T017 (tail): Лёша или Никита прогоняет полный цикл (ветка → staging →
  PR в main) только по докам.
- [ ] T018 (tail): переклеить обновлённые инструкции в свой Claude-проект;
  отправить `meta/claude-project-instructions.md` Никите и Лёше (свой
  username + fine-grained PAT: Contents RW + Pull requests RW).
- [ ] 027/T025 остаток: погасить Vercel (окно до 2026-06-21).

## Что помнить следующему чату
- Shipping теперь: код → ветка `claude/<slug>` → PR в `main` (бот умеет
  POST /pulls); мета/доки → напрямую в `main`. `staging` одноразовый,
  reset кем угодно.
- Смок-файл `mat-ucheniya/.staging-smoke` живёт только на ветке `staging`,
  умрёт при ближайшем reset.
- Эпик «RPG-движок» (пивот chat 93): следующий шаг — выделить спеки эпика.
