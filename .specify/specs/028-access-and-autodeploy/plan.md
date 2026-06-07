# Implementation Plan: Server ops — team access & auto-deploy (spec-028)

**Spec**: `./spec.md` · **Status**: Plan + Tasks (chat 88) · **Phase**: HOW
Supporting: `./research.md` (Dokploy/Cloudflare specifics), `./notes-plan-input.md`.

## Recap

Two independent user stories. US1 (collaborator access) — почти целиком **ops**,
без кода приложения. US2 (auto-deploy с гейтом) — один кодовый артефакт (GitHub
Actions workflow) + операторская обвязка (секреты, Cloudflare-правило, токен
Dokploy). Решения Clarify (chat 88): все трое — full-ops; auto-deploy гейтится на
`lint + tsc + vitest`.

---

## US1 — Collaborator access (P1): approach

Полностью по уже написанному `infra/server-access.md`. Реализация = оператор
выполняет задокументированные шаги; Claude-кода нет (FR-007 закрыт существующим
доком).

- **Учётки**: персональные Unix-юзеры `lesha`, `nikita`, `sergey`, в группе `sudo`,
  вход только по ключу (наследие drop-in `00-hardening.conf`: root/пароль
  отключены). Каждому — свой `authorized_keys` ровно с его ed25519 **pub**-ключом.
- **Dokploy**: каждый — свой аккаунт + 2FA (panel → Settings → Users/Team).
- **Studio**: личный SSH-туннель (`-L 8001:localhost:8001`), Studio без отдельной
  авторизации за туннелем.
- **Отзыв**: `deluser --remove-home <user>` (рубит SSH→Studio) + удалить
  Dokploy-аккаунт. Master-switch — удаление SSH-юзера (5432 закрыт, Studio за
  туннелем).

Никаких credential-вводов со стороны Claude — все гранты делает оператор.

---

## US2 — Auto-deploy with gate (P2): approach

**Решение: GitHub Actions** (не встроенный GitHub-автодеплой Dokploy). Причина —
встроенный автодеплой деплоит **безусловно** по push, места под гейт нет; нам нужен
`lint+tsc+vitest` **до** выката. Actions запускает гейт, и только на зелёном дёргает
деплой Dokploy через **API**. Это заодно обходит репорты о флакfutивности встроенного
GitHub-вебхука. (Детали и кейвиаты — `research.md`.)

**Поток** (push в `main`):

1. **Job `gate`** (`runs-on: ubuntu-latest`, `working-directory: mat-ucheniya`):
   `actions/setup-node@v4` (node **20**, под Dockerfile) → `npm ci` →
   `npm run lint` → `npm run typecheck` (новый скрипт `tsc --noEmit`) →
   `npm run test` (`vitest run`). **Сборки в CI нет** — образ собирает Dokploy на
   боксе (Dockerfile, Build Path `/mat-ucheniya`, standalone, `NEXT_PUBLIC_*` как
   build-args уже настроены). В CI `node_modules` есть (`npm ci`), так что
   sandbox-ложняки `tsc` неактуальны.
2. **Job `deploy`** (`needs: gate` → стартует только на зелёном): дёргает деплой
   Dokploy через API:
   ```
   POST https://panel.theloopers.org/api/application.deploy
   x-api-key: <DOKPLOY_API_TOKEN>      # секрет GitHub
   { "applicationId": "<DOKPLOY_APP_ID>" }   # секрет/var GitHub
   ```
   (Можно plain `curl`, можно готовый `benbristow/dokploy-deploy-action`.) Dokploy
   собирает образ на боксе и выкатывает. **Rollback** — дашборд Dokploy (есть).
3. **Branch matching**: workflow только `on: push: branches: [main]` → FR-011.
4. **Гейт красный → job `deploy` не стартует** → прод остаётся на последней
   исправной версии (FR-009, FR-012, SC-006).

### Cloudflare-кейвиат (важно, см. research.md #3542)

`panel.theloopers.org` проксируется Cloudflare → curl из Actions к
`/api/application.deploy` может ловить bot-challenge («Just a moment…»). Митигация:
**Cloudflare WAF skip-rule** на путь `/api/application.deploy` (или по заголовку
вызова из Actions). Проверяется на первом смоуке (T013); если режет — правило
обязательно.

---

## File structure (new / changed)

| Path | Что | Кто пишет |
|---|---|---|
| `.github/workflows/deploy.yml` | **new** — gate + deploy (US2). В **корне репо** (Actions читает только корневой `.github/`); npm-шаги c `working-directory: mat-ucheniya` | Claude (Implement) |
| `mat-ucheniya/package.json` | +скрипт `"typecheck": "tsc --noEmit"` | Claude (Implement) |
| `infra/server-access.md` | онбординг US1 — **уже написан** | — |

## Secrets / config (всё делает оператор; Claude секреты не вводит)

- **GitHub repo secrets** (Settings → Secrets and variables → Actions):
  `DOKPLOY_API_TOKEN` (Dokploy profile → Generate API Key), `DOKPLOY_APP_ID`
  (из URL приложения в Dokploy).
- **Cloudflare**: WAF skip-rule для деплой-эндпоинта (если смоук покажет блок).
- **Dokploy**: выключить встроенный «Auto Deploy» тоггл у приложения, если включён
  (чтобы не было двойного деплоя — деплоим из Actions).

## Integration points

- Триггер деплоя — единственная точка касания Actions↔Dokploy (API). Сам билд и
  рантайм-конфиг не меняются (Dockerfile/standalone/`NEXT_PUBLIC_*` как есть).
- US1 и US2 независимы: можно выкатить доступ без автодеплоя и наоборот.

## Out of scope (как в spec)

Preview-per-PR, multi-env, нотификации, blue-green, гранулярные DB-роли, read-only
MCP (spec-029). Коммит-метадата в Dokploy при API-деплое — косметика (см.
research.md), не делаем.

## Verify-on-Plan items (закрыты ресёрчем / проверить на боксе)

- Dokploy#3787 (флак встроенного GitHub-вебхука) — **неактуально**: идём через
  Actions+API, встроенный автодеплой не используем.
- Cloudflare-блок API-вызова (#3542) — **проверить на T013**, при блоке — WAF-rule.
- Версия Dokploy на боксе — подтвердить, что `application.deploy` API работает
  (см. #3086 — был регресс в одной версии для image-приложений; у нас Dockerfile/git).
