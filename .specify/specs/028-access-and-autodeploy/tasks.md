# Tasks: Server ops — team access & auto-deploy (spec-028)

**Spec**: `./spec.md` · **Plan**: `./plan.md` · **Research**: `./research.md`
Legend: `[P]` parallelizable · 🖥️ LOCAL · 🐧 SERVER · 🌐 WEB · **(Claude)** = artifact
Claude writes, **(operator)** = Andrey runs (Claude never enters secrets/keys).

Two independent stories — US1 (P1) ships without US2 and vice-versa.

---

## User Story 1 — Collaborator access (P1)

> Артефакт уже есть: `infra/server-access.md` (FR-007). Ниже — исполнение по нему.

> **Итог (chat 88): Сергей отказался** — scope = Лёша + Никита.

- [x] **T001** [P1] 🖥️ (operator) Собрать ed25519 **pub**-ключи. ✓ Лёша + Никита
  (Сергей — n/a). _Грабли: у Никиты не было приватного ключа + правка комментария
  ломала тело ключа → перегенерили и переписали `authorized_keys` начисто._
- [x] **T002** [P1] 🐧 (operator) Персональные sudo-учётки `lesha`/`nikita`
  (`adduser --disabled-password` + группа `sudo` + их pub-ключи) ✓. Плюс задан
  пароль обоим (для `sudo`; вход по SSH — только ключ).
- [x] **T003** [P1] 🖥️ (operator) Проверка SSH ✓ (Никита зашёл после фикса ключа;
  root-логин отказан). Сервер чист: `AllowUsers`/`AllowGroups` пустые, путь к
  ключам дефолтный.
- [x] **T004** [P1] 🌐 (operator) Dokploy: инвайт Никите (admin) отправлен ссылкой —
  SMTP в self-hosted не настроен, письма не идут; приём за Никитой.
- [ ] **T005** [P1] 🖥️ (operator) Studio-смоук (туннель 8001) — не гоняли (опц.).
- [ ] **T006** [P1] 🐧 (operator) Отзыв-смоук — не гоняли (опц.; процедура в
  `server-access.md` §9).
- [x] **CHECKPOINT US1** (для Лёша+Никита): рабочий шелл + sudo ✓; Dokploy —
  инвайт отправлен (приём за ними). Сергей отказался. Studio/отзыв-смоук — опц., не
  гоняли. US1 закрыт в рамках принятого scope.

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

> Готовый бот **MrBranches** (PR-центричный `.yml`). Кодить почти нечего —
> коммит файла + 3 секрета. Едет вместе с переходом на branch+PR.

- [ ] **T014** [P3] 🌐 (operator) Закоммитить `.github/workflows/telegram-notifications.yml`
  (готовый MrBranches `.yml`, отдан в чате) — workflow-файл, **коммитит оператор**
  (PAT бота без `workflow`-scope; web UI / свой токен).
- [ ] **T015** [P3] 🌐 (operator) GitHub → Settings → Secrets → Actions: добавить
  `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_THREAD_ID` под **новый** чат/топик.
- [ ] **T016** [P3] [P] 🌐 (operator, бонус) Добавить `paths-ignore`
  (`**/*.md`, `.specify/**`, `chatlog/**`) в `deploy.yml` (обновлённый файл отдан в
  чате) — чтобы doc-мержи не передеплоивали прод.
- [x] **T017** [P3] 🖥️ (operator) Смоук: запушить ветку + открыть PR в `main` →
  в Telegram-топике приходят «ветка создана» + «PR открыт»; смерджить → «вмерджен»
  (US3 AC#1/#2). _depends T014, T015._
- [x] **CHECKPOINT US3**: уведомления о ветках/PR-ах идут в Telegram; сбой
  нотификатора не ломает гейт/деплой (FR-016). Едет на branch+PR-флоу.
  ✓ **Verified chat 88**: смоук через `test/bot-smoke-3` — «🌱 создал ветку» легло
  в нужный топик (после фикса секретов `TG_CHAT_ID=-1002576013907`,
  `TG_THREAD_ID=17119` + бот добавлен в группу). Branch-created step ✓, PR-шаги
  пропущены. Бот = **MrBranches**, файл `telegram-notifications.yml` на main.

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
| FR-014 уведомление о создании ветки | T014 (MrBranches `.yml`) |
| FR-015 уведомления о PR (открыт/мердж/закрыт) | T014 |
| FR-016 нотификатор best-effort, не блокирует | T014 (curl не валит шаг) |

Готово к Implement. Кодовых задач для Claude — две (**T007**, **T008**); остальное
исполняет оператор. По правилу: в Implement — по одной задаче, отмечая `[x]` и
останавливаясь.
