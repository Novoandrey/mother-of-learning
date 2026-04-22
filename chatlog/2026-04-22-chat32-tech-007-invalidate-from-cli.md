# Chat 32 — TECH-007 invalidate-from-CLI, 2026-04-22

## Контекст (откуда пришли)
Chat 31 закрыл BUG-016 + TECH-006 (аудит инвалидаций сайдбара),
зафиксил два миссинга в server-side мутациях. Открытым остался
TECH-007 — частный случай: CLI-скрипты (`seed-srd`, `dedupe-srd`,
`import-electives`) не могут звать `revalidateTag` потому что
работают вне Next runtime. Backlog оценил задачу как P3 с
триггером «всплывёт ещё раз».

## Что сделано

### Defensive infra: HTTP endpoint + CLI helper
- **`app/api/admin/invalidate-sidebar/route.ts`** — POST endpoint.
  Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` через
  constant-time сравнение. Принимает `?campaign=<slug-или-uuid>`,
  резолвит slug в id через admin client, дёргает
  `invalidateSidebar(campaignId)`. Reuse уже существующего secret
  чтобы не плодить параллельную auth-схему.
- **`scripts/lib/invalidate-sidebar-remote.ts`** — fetch-хелпер
  для CLI. Читает `APP_URL` (default `http://localhost:3000`)
  и `SUPABASE_SERVICE_ROLE_KEY`. **Non-fatal**: при ошибке
  логирует warning, скрипт всё равно завершается успешно —
  сайдбар самовосстановится через 60с TTL.

### Проводка в три CLI-скрипта
- `scripts/seed-srd.ts` — вызов после `seedCampaignSrd`.
- `scripts/dedupe-srd.ts` — вызов после удаления дублей.
- `scripts/import-electives.ts` — вызов после загрузки CSV.

### Документация
- **`AGENTS.md`** — обновлено правило для CLI: было «can't
  invalidate, print a notice», стало описание как звать
  `invalidateSidebarRemote(campaignSlug)` + про `APP_URL` env.

## Решения
- **Auth через service-role key, а не отдельный admin token**: у CLI
  он уже есть, добавлять второй secret = больше surface area без
  выгоды. Constant-time compare на всякий случай.
- **Non-fatal при ошибке fetch**: bulk-операция уже прошла, ронять
  её из-за неработающего invalidation бессмысленно. 60с TTL и так
  гарантирует self-heal.
- **`APP_URL` default localhost**: dev workflow по умолчанию
  работает; для прода надо явно выставить env.

## Проверка
- `npx tsc --noEmit` — чисто.
- `npx eslint` на изменённых файлах — pre-existing warning в
  `import-electives.ts` про неиспользованный type, не связан.
- Build не запускал — изменения только в новых файлах + минорные
  правки скриптов.

## Замечание про процесс (важное)
Изначально полез кодить TECH-007 не сверившись с backlog —
там стояло «триггер: либо появится regular workflow, либо просто
всплывёт ещё раз». BUG-016 уже закрыт, у пользователя сайдбар
показывает корректные числа → триггера не было. Пользователь
подсказал. После этого выбор сделали явный (defensive infra B)
и доделали уже сознательно.

Урок: NEXT.md / backlog — source of truth, читать критически
до начала работы, не после.

## Что осталось
Ничего. Полный цикл defensive infra на месте, при появлении
реального workflow «массовый seed → сразу проверяю» всё уже
работает. Если в проде понадобится — выставить `APP_URL=https://mother-of-learning.vercel.app`
в env CLI.

## Следующее
Из NEXT.md остаются:
- IDEA-037 [P2] — факультативы → бонусы к статам PC
- IDEA-041 [P2] — система фидбека внутри приложения
- Spec-007 этап 4 stage 4 — трекер трат на ход
- Encounter race conditions [P3]
- Мобилка игрока (Spec-007 этап 5)
