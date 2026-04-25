# Chat 50 — spec-013 implementation T001-T034, 2026-04-25

## Контекст (откуда пришли)

В chat 49 закрыли Specify+Clarify+Plan+Tasks для spec-013 (encounter
loot distribution). На входе: 411-строчный tasks.md с 37 задачами в
9 фазах. Пользователь стартовал с «spec-013 T001 implement» и
сразу задал темп — «делаем несколько фаз за раз, останавливай только
если реально нужно». Один чат от T001 до T034 включительно.

## Что сделано

### Phase 1 — Pre-migration verification (T001)
- `mat-ucheniya/scripts/verify-encounter-titles.sql` — проверил, что
  в проде 0 дублей по `(campaign_id, title)` среди 10 encounter'ов.
  Т.е. CTE-backfill в T002 идёт без `row_number()` tiebreaker.

### Phase 2 — Migration (T002+T003)
- Миграция `039_encounter_mirror_and_loot_drafts.sql`:
  1. Сид `encounter` node_type per campaign (idempotent через `on
     conflict do update`).
  2. `alter table encounters add column if not exists node_id uuid`.
  3. CTE backfill mirror-нод по (campaign_id, title).
  4. Defensive verify: raise exception если хоть одна не получила
     mirror.
  5. NOT NULL + FK on delete restrict + unique idx_encounters_node_id.
  6. Три SECURITY DEFINER триггера: `create_encounter_mirror_node`
     (BEFORE INSERT), `sync_encounter_title_to_mirror` (AFTER UPDATE
     OF title), `delete_encounter_mirror_node` (AFTER DELETE).
  7. Таблица `encounter_loot_drafts` (encounter_id PK, lines jsonb,
     loop_number, day_in_loop check 1..30, updated_by, timestamps),
     `touch_encounter_loot_drafts_updated_at` trigger, RLS
     (member-read через is_member subquery — таблица не имеет
     campaign_id напрямую, только через encounters).
- Применена на проде, 4/4 smoke-чека ✅: orphans=0, mirror title
  matches encounter title, rename triggers sync, delete triggers
  cascade.

### Phase 3 — Carve-out reconcile (T004)
- Извлёк reconcile-логику из `applyLoopStartSetup` в новый модуль
  `lib/autogen-reconcile.ts`:
  - `computeAutogenDiff({sourceNodeId, wizardKeys, desiredRows,
    validActorIds})` → `{diff, tombstones, affected}`. Загружает
    existing rows + tombstones, считает diff, применяет orphan
    filter, гидрирует actor titles, считает affected.
  - `applyAutogenDiff({diff, context})` → ApplySummary. Шейпит RPC
    payload + вызывает `apply_loop_start_setup` (RPC body
    параметрически generic на source_node_id, несмотря на loop-
    flavoured название).
- `applyLoopStartSetup` сократился с ~230 до ~90 строк, делегирует
  обоим helpers. wizardKeys параметризован — spec-013 передаёт
  `['encounter_loot']`. SPEC_012_WIZARD_KEYS экспортирован.
- 135/135 vitest до и после — рефакторинг не задел behaviour.

### Phase 4 — Pure helpers (T005-T009)
- `lib/encounter-loot-types.ts` (T005): LootLineId, CoinLine,
  ItemLine, LootLine union, LootDraft, EncounterLootDesiredRow.
- `lib/coin-split.ts` (T006): `splitCoinsEvenly` + exposed
  `greedyDenominations`. Floor-cp + remainder + greedy denomination
  (pp→gp→sp→cp). 14 тестов (target 8).
- `lib/encounter-loot-resolver.ts` (T007): expand → merge by
  (kind, actor, item_name) → drop zero rows. 15 тестов (target 12).
- `lib/encounter-loot-validation.ts` (T008): hand-rolled validators
  (НЕ zod — следует codebase-конвенции, см.
  starter-setup-validation.ts). validateLootLine,
  validateLootDraftPatch, validateLootDraftReady. 35 тестов
  (target 10).
- `WizardKey` union + `KNOWN_WIZARD_KEYS` Set расширены
  `'encounter_loot'`, тест-флип в starter-setup-validation.test.ts
  (T009).
- 199/199 vitest (135 baseline + 64 новых).

### Phase 5 — Server actions (T010-T014)
- `lib/queries/encounter-loot-summary.ts` (T011): React-cached
  query, 2-step fetch (encounter → mirror node id, потом count
  autogen rows). Возвращает {rowCount, lastAppliedAt, mirrorNodeId}.
- `app/actions/encounter-loot.ts` (T010+T012+T013+T014):
  - `getEncounterLootDraft` member-read с lazy-create через
    upsert+ignoreDuplicates (race-safe для concurrent first-mounts).
  - `updateEncounterLootDraft` DM-only, validates через T008.
  - `setAllToStashShortcut` rewrites all lines к stash mode,
    возвращает count.
  - `applyEncounterLoot` — full reconcile path:
    1. Auth + status guard (must be 'completed')
    2. Load + validate draft через validateLootDraftReady
    3. Resolve participants (initiative DESC NULLS LAST →
       sort_order → created_at, filter character-typed)
    4. getStashNode, fail loud если stash-line + нет stash
    5. T007 resolver → encounter-loot rows
    6. Bridge function → spec-012 DesiredRow shape
       (wizardKey='encounter_loot', categorySlug='loot' (seeded в
       034), static comment 'Лут энкаунтера' чтобы encounter
       rename не триггерил per-row UPDATE'ы)
    7. computeAutogenDiff (T004)
    8. Two-phase confirm: affected.length > 0 && !confirmed →
       needsConfirmation
    9. applyAutogenDiff (T004)
    10. Manual cleanup encounter_loot tombstones (RPC хардкодит
        spec-012 keys)
    11. revalidatePath: encounter, /accounting, /accounting/stash
        (если any stash recipient), per-PC catalog.

### Phase 6 — UI (T015-T024)
- Решение: консолидировал T017+T018+T019+T020+T021+T022 в один
  client island `<EncounterLootEditor>` вместо 6 файлов. Один
  state-owner проще чем drilling через слои. Re-render cost
  irrelevant при ~10 строках. Документировано в header'е.
- `components/encounter-loot-summary-read-only.tsx` (T015):
  player-facing, 3 состояния, hides на active.
- `components/encounter-loot-panel.tsx` (T016+T020): server frame,
  parallel `Promise.all` (draft, summary, participants, stash),
  hides на active, mounts editor.
- `components/encounter-loot-editor.tsx` (T017+T018+T019+T020+T021+T022):
  client island. Day picker, coin/item rows как inline sub-components,
  recipient picker single-`<select>` encoding (`stash`/`split`/`pc:id`),
  live preview для split_evenly, debounced save 300ms,
  ApplyConfirmDialog wiring, «Всё в общак» button, reload-on-success.
- T023: `encounter_loot: 'Лут энкаунтера'` в оба `Record<WizardKey,
  string>` (autogen-badge-client + apply-confirm-dialog) — было
  блокером компиляции после T009.
- T024: mounted на encounter page по `canEdit` (panel для DM,
  summary для player).

### Phase 7 — Cross-cutting filters (T025-T027)
- `lib/sidebar-cache.ts` (T025): пост-fetch фильтр encounter
  mirror nodes + encounter node_type.
- `app/c/[slug]/catalog/page.tsx` (T026): два фильтра — nodeTypes
  для chip'ов и normalizedNodes для рядов.
- `components/create-edge-form.tsx` (T027): selects с
  `type:node_types(slug)` joined, фильтр encounter slug на
  client-side, limit 20→5 после фильтра.

### Phase 8 — Tests (T028+T029, partial)
- `scripts/check-rls-013.sql` (T028): SQL вместо .ts — следует
  spec-012 паттерну. 5 RLS-проверок: outsider, player read, player
  UPDATE, DM read, DM UPDATE (write-policy отсутствует, RLS блочит
  даже DM session — writes идут через admin client). BEGIN...
  ROLLBACK.
- `scripts/check-encounter-mirror-triggers.sql` (T029): 5
  trigger-проверок. INSERT, UPDATE title sync, UPDATE non-title
  no-sync, DELETE cascade, FK RESTRICT на прямом DELETE mirror.

### T030-T033 — Manual walkthrough (отложены)
- Оставлены `[ ]`. Это пользовательские acceptance scenarios,
  Claude автоматизировать не может — нужна реальная клик-сессия
  DM'ом в браузере. Описаны в NEXT.md как next priority.

### Phase 9 — Close-out (T034 ✅, T035-T037 в этом коммите)
- T034: lint 0/0, vitest 199/199, npm run build clean — всё
  верифицировано.
- T035: NEXT.md обновлён — spec-013 в "в проде", migration 039
  как latest applied, next priority = manual walkthrough.
- T036: этот файл.
- T037: финальный коммит впереди (после save этого chatlog'а).

## Миграции

- `039_encounter_mirror_and_loot_drafts.sql` — encounter mirror
  nodes (3 trigger'а) + encounter_loot_drafts table + RLS.

## Коммиты

- `f48152a` spec-013 T001-T004: migration 039 + autogen-reconcile carve-out
- `907df71` spec-013 T005-T009: pure helpers (types + coin-split + resolver + validation + wizard key)
- `a8c2838` spec-013 T010-T014: server actions + summary query
- `fbb2103` spec-013 Phase 6 + T023 + T025: UI panel + summary + sidebar filter
- `6f46d0c` spec-013 Phase 7: T026 catalog filter + T027 typeahead filter
- `<final>` spec-013 close-out: Phase 8 SQL scripts + NEXT.md + chatlog (this commit)

## Действия пользователю (после чата)

- [x] применить миграцию 039 (сделано в чате)
- [x] задеплоить (авто через main push)
- [ ] запустить `mat-ucheniya/scripts/check-rls-013.sql` в Supabase
      Dashboard, должно быть `✓ All PASS (5 tests)`
- [ ] запустить `mat-ucheniya/scripts/check-encounter-mirror-triggers.sql`
      в Supabase Dashboard, должно быть `✓ All PASS (5 tests)`
- [ ] T030-T033 manual acceptance walkthrough в проде:
      завершить тестовый encounter, открыть loot panel, погонять
      4 user-stories из spec.md (US1-US7).
- [ ] (опционально, после spec-013) сделать IDEA-055 — DM
      rename/delete кнопки на encounter page, ~30 минут.

## Что помнить следующему чату

- spec-013 полностью в проде с точки зрения кода. Ждут только
  ручные acceptance walkthroughs (T030-T033) и SQL smoke-скрипты
  для запуска в Dashboard.
- IDEA-055 (DM controls на encounter page) — естественный
  следующий шаг после spec-013, малая фича (~30 мин).
- Spec-015 (предметы как ноды) использует тот же autogen-инфра-
  стиль — `lib/autogen-reconcile.ts` уже generic, добавление
  нового wizard key — это минут 5 (extend WizardKey union, add
  to KNOWN_WIZARD_KEYS, register label).
- Hand-rolled validators — codebase-convention. zod не добавлять
  без согласования.
- Encounter mirror nodes отфильтрованы из 3 точек (sidebar,
  catalog, edge typeahead). Если появится 4-я точка — добавить
  туда же.
- spec-012 RPC `apply_loop_start_setup` хардкодит spec-012 keys
  в tombstone-cleanup. spec-013 чистит свои tombstones отдельным
  DELETE после RPC. Если появится spec-014/015 с autogen — либо
  каждая чистит свои tombstones, либо параметризовать RPC через
  миграцию.
