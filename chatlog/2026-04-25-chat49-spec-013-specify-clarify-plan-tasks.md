# Chat 49 — spec-013 specify+clarify+plan+tasks, 2026-04-25

## Контекст (откуда пришли)
После chat 48 spec-012 закрыта (in prod, 135 vitest, 0 lint).
Пользователь зашёл с командой `/spec-driven-dev Spec013` —
encounter loot distribution, 5й автоген-визард на инфре spec-012.

## Что сделано

### Spec-013 (Specify → Clarify → Plan → Tasks полностью)
- `.specify/specs/013-encounter-loot/spec.md` — 918 строк.
  - 7 user stories (US1 apply, US2 reapply, US3 stash recipient
    + «Всё в общак» preset, US4 even-split coin, US5 player badge,
    US6 hand-edit + two-phase confirm, US7 cascade).
  - 26 FR + 6 SC + 12 edge cases.
  - 3 architectural pinned points: reuses spec-012 end-to-end /
    encounter mirror = source node / mirror — forward-compat seam.
  - **Mirror-нода вариант A** выбран после обсуждения трёх
    опций: encounters получают 1:1 mirror node типа `encounter`,
    минимальный slice (id, title, campaign_id), forward-compat
    для будущей spec-018 (encounter-as-canonical-node).
- `plan.md` — 1013 строк. Migration 039 + carve-out refactor
  spec-012 reconcile в `lib/autogen-reconcile.ts` + content-keyed
  reconcile (без line-id в transactions, чтобы не нарушать
  обещание spec-012 «новые wizard'ы без миграции схемы») + inline
  DM-only `<EncounterLootPanel>` + read-only player summary.
- `tasks.md` — 411 строк, 37 задач в 9 фазах.

### Clarifications (5 закрытых вопросов в spec.md)
- Q1: loot draft в отдельной таблице `encounter_loot_drafts`
  (не JSONB на encounters, не атрибуты mirror-ноды).
- Q2: округление `floor-cp + remainder в порядке инициативы
  (NULLS LAST → sort_order → created_at)`. 31gp/3 = PC1: 1034cp,
  PC2-3: 1033cp каждый.
- Q3: persisted day на драфте (loop_number + day_in_loop), DM
  обязан указать когда нет session-binding.
- Q4: inline panel на encounter-странице, dialog только для
  two-phase confirm с hand-touched/tombstoned.
- Q5: applied rows остаются при reopen (`completed → active`),
  apply-кнопка дисейблится до возврата в completed.

### Backlog reorganisation
Записаны будущие спеки (только entries в backlog, не открытые):
- **spec-017** — карта мира + локации (с обязательным
  `travel_time_days` на edges — критично для spec-021).
- **spec-018** — encounter rework. **Добавлены player-visibility
  правила**: HP врагов не видно никогда (только bloodied при
  ≤50% HP), statblock'и НПС скрыты, conditions с
  `visibility='public'|'dm_only'`, familiars-исключение
  (PC видит фамильяров с belongs_to_pc edge как свои).
- **spec-019** — DM sandbox / песочница для черновиков
  (visibility-флаг на нодах, draft → published flow).
- **spec-020** — правила и хомрулы кампании. Три конкретных:
  `familiars_share_pc_turn` / `crit_rule:'max_plus_extra'` /
  `crit_injury_threshold` с d100-таблицей. Generic-инфра для
  встроенных roll-таблиц.
- **spec-021** — DM session control (ползунок дня, движение
  pack'а). Поглощает IDEA-045.
- **spec-022** — pack/PC movement timeline. Поглощает остаток
  IDEA-054.
- **spec-023** — часы/минуты + downtime/projects (schema
  evolution, делается «по требованию feature», не «на всякий
  случай»).
- **spec-024+** — character-sheet/mobile epic.
- IDEA-045 и IDEA-054 помечены `PROMOTED → spec-NNN` с
  исторической записью.
- Spec-015 описание расширено: **каталог-таблица** с фильтрами
  по цене (GP) / весу (фунты) / категории / редкости / source
  (book/page/URL), typeahead для дедупа, SRD-импорт переехал из
  «опционально» в первичный сид.

## Миграции
Не применены. spec-013 implementation начнётся в следующем чате
(T001 → T037). Миграция 039 будет создана в T002.

## Коммиты
Один коммит конца сессии — «chat 49: spec-013 specify+clarify+
plan+tasks, backlog reorg 017-024+».

## Действия пользователю (после чата)
- [ ] прочитать spec.md, plan.md, tasks.md spec-013
- [ ] решить, начинать ли spec-013 implementation сейчас или
      приоритизировать одну из заявленных будущих спек
      (017 карта / 020 правила могут быть полезнее раньше
      013, если матучение хочет перестать вести лут на
      бумажках *в принципе*)
- [ ] T001 (verify no duplicate `(campaign_id, title)`
      encounters) можно пробежать одним SQL до начала
      имплементации, чтобы заранее знать про tiebreaker

## Что помнить следующему чату
- Implementation начинается с T001. Все 37 задач готовы.
- Spec-012 reconcile carve-out (T004) — рискованная задача,
  не комбинировать с другими в одном PR. 135 vitest spec-012
  тестов — гарантия неизменности поведения.
- Если performance апплая не уложится в 500 ms (FR-024) —
  fallback `apply_encounter_loot` Postgres RPC (параллель
  spec-012's `apply_loop_start_setup`). Решение откладывается
  до T014.
- Backlog 017-024+ — это бэклог-маркеры, не спеки в работе.
  Писать spec.md только когда пользователь явно даст команду.
