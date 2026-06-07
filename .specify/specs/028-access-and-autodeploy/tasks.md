# Tasks: Server ops — team access & auto-deploy (spec-028)

**Spec**: `./spec.md` · **Plan**: `./plan.md` · **Research**: `./research.md`
Legend: `[P]` parallelizable · 🖥️ LOCAL · 🐧 SERVER · 🌐 WEB · **(Claude)** = artifact
Claude writes, **(operator)** = Andrey runs (Claude never enters secrets/keys).

Two independent stories — US1 (P1) ships without US2 and vice-versa.

---

## User Story 1 — Collaborator access (P1)

> Артефакт уже есть: `infra/server-access.md` (FR-007). Ниже — исполнение по нему.

- [ ] **T001** [P1] 🖥️ (operator) Собрать ed25519 **pub**-ключи от Лёши, Никиты,
  Сергея (по строке `ssh-ed25519 …`). _Блокер для T002._
- [ ] **T002** [P1] 🐧 (operator) Завести персональные sudo-учётки `lesha`,
  `nikita`, `sergey` + положить их pub-ключи — по `infra/server-access.md` §8
  (full-ops для всех троих). _depends T001._
- [ ] **T003** [P1] [P] 🖥️ (operator) Проверка SSH: `ssh <user>@37.27.254.49`
  заходит ключом для каждого; `ssh root@…` отказан. _depends T002._
- [ ] **T004** [P1] [P] 🌐 (operator) Dokploy `panel.theloopers.org` → Settings →
  Users/Team: добавить `lesha`/`nikita`/`sergey`, включить **2FA** каждому.
  _depends T002._
- [ ] **T005** [P1] [P] 🖥️ (operator) Studio-смоук: `ssh -L 8001:localhost:8001
  <user>@…` + открыть `localhost:8001` — Studio открывается. _depends T002._
- [ ] **T006** [P1] 🐧 (operator) Отзыв-смоук: завести throwaway-юзера, затем
  `sudo deluser --remove-home <throwaway>` — подтвердить <5 мин и что остальные не
  затронуты (FR-003, SC-002). _depends T002._
- [ ] **CHECKPOINT US1**: все трое — рабочий шелл + Dokploy(2FA) + Studio; отзыв
  проверен. US1 демонстрируема и шипуема независимо.

---

## User Story 2 — Auto-deploy with gate (P2)

- [x] **T007** [P2] **(Claude)** Добавить скрипт `"typecheck": "tsc --noEmit"` в
  `mat-ucheniya/package.json`. _Блокер для T008 (workflow его зовёт)._
- [x] **T008** [P2] **(Claude)** Создать `.github/workflows/deploy.yml` (корень
  репо): `on: push: branches: [main]`; job **gate** (node 20,
  `working-directory: mat-ucheniya`, `npm ci` → `lint` → `typecheck` → `test`);
  job **deploy** (`needs: gate`) → `POST /api/application.deploy` к Dokploy с
  `x-api-key` + `applicationId` из секретов. _depends T007._
  ⚠️ Файл **написан и провалидирован**, но **коммитит оператор**: PAT бота без
  `workflow`-scope — добавить через GitHub web UI (Add file → Create new file) или
  своим токеном.
- [ ] **T009** [P2] [P] 🌐 (operator) Dokploy: profile → Generate API Key;
  скопировать `applicationId` из URL приложения. _нужно для T010._
- [ ] **T010** [P2] 🌐 (operator) GitHub → Settings → Secrets and variables →
  Actions: добавить `DOKPLOY_API_TOKEN`, `DOKPLOY_APP_ID`. _depends T009; Claude
  секреты не вводит._
- [ ] **T011** [P2] [P] 🌐 (operator) Dokploy: выключить встроенный «Auto Deploy»
  тоггл у приложения, если включён (деплоим из Actions, без двойного выката).
- [x] **T012** [P2] 🖥️ (operator) **Позитивный смоук**: тривиальный коммит в
  `main` → gate зелёный → Dokploy собирает+выкатывает → прод отражает за ~5 мин
  (US2 AC#1, SC-003). _depends T008, T010._
  - Если deploy-шаг ловит Cloudflare-challenge (research.md #3542) → **T012a** 🌐
    (operator) добавить Cloudflare WAF skip-rule на `/api/application.deploy`,
    перепроверить.
- [x] **T013** [P2] 🖥️ (operator) **Негативный смоук**: временный коммит с
  падающим тестом в `main` → gate красный → job `deploy` НЕ стартует, прод на
  последней исправной версии → откатить коммит (FR-009/FR-012, SC-006, US2 AC#2).
  _depends T012._
  ✓ **Verified chat 88** (Claude, run 27096111523): временный падающий тест в `main`
  → gate **failure** (lint ✓ / typecheck ✓ / test ✗), deploy **skipped**, прод не
  тронут. Тест откачен (`[skip ci]`). Cloudflare деплой не резал — T012a не понадобился.
- [x] **CHECKPOINT US2**: push→зелёное→прод ~5 мин; красный гейт блокирует деплой
  (прод не падает); rollback в дашборде. US2 демонстрируема независимо.

---

## User Story 3 — Telegram notifications (P3)

> 🌱 **Specify только** (chat 88). Tasks появятся после **US3 Plan** (HOW —
> `notes-plan-input.md` US3). Грубо: workflow на `create` + `push:main` → Telegram
> Bot API; секреты `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (оператор);
> workflow-файл коммитит оператор. Не планируем здесь — отдельным заходом.

---

## Coverage (FR → task) — lightweight Analyze

| FR | Покрыто |
|---|---|
| FR-001 персональные учётки | T002 |
| FR-002 Лёша/Никита/Сергей | T001–T005 |
| FR-003 отзыв <5 мин, не задевая других | T006 |
| FR-004 root/пароль off | T003 (verify; уже enforced) |
| FR-005 full-ops все трое (шелл/деплой/БД) | T002–T005 |
| FR-006 консоль БД = полный прод-доступ (док) | `server-access.md` §6 |
| FR-007 онбординг-док | уже написан |
| FR-008 push→авто-сборка+выкат | T008, T012 |
| FR-009 упавшая сборка не заменяет прод | T008 (`needs: gate`), T013 |
| FR-010 атрибуция к коммиту + rollback | T008 + Dokploy дашборд |
| FR-011 не-main не деплоит | T008 (`branches: [main]`) |
| FR-012 гейт lint+tsc+vitest, красное блокирует | T007, T008, T013 |
| FR-013 порт БД закрыт наружу | вне scope (already; spec-029 — туннель) |

Готово к Implement. Кодовых задач для Claude — две (**T007**, **T008**); остальное
исполняет оператор. По правилу: в Implement — по одной задаче, отмечая `[x]` и
останавливаясь.
