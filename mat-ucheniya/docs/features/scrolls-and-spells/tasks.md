# tasks — spec-059 (свитки/заклинания)

Легенда: ⬜ todo · 🔨 в работе (агент) · ✅ done · 🧪 нужен тест

## Этап 1 — база заклинаний
- ✅ T1.1 Мигр. 130: node_type `spell` (апгрейд легаси) + категория `scroll` — на проде
- ✅ T1.2 TS-сидеры: NODE_TYPES += spell, DEFAULT_ITEM_CATEGORIES += scroll
- ✅ T1.3 `maxSpellLevel(partyLevel)` в party-level.ts
- 🔨 T1.4 Скрапер `scripts/scrape_dndsu_spells.py` (агент a19dc38)
- 🔨 T1.5 Smoke-run скрапера (агент)
- 🔨 T1.6 Codegen `scripts/spells-dndsu-codegen.ts` (агент)
- 🔨 T1.7 Прогон → `dndsu_spells.json` → сид-миграции 140+ (агент)
- ⬜ T1.8 Десктоп: `spells/[id]/page.tsx` + edition-toggle + список (отложено — display)
- ⬜ T1.9 Десктоп-редиректы catalog → /spells (отложено)
- ⬜ T1.10 /tg: `lib/queries/spells-tg.ts` вики-рендер (отложено — display; поиск уже есть в scribe-tg)
- ⬜ T1.11 /tg: `spell-app.tsx` статблок + тоггл 2014/2024 (отложено — display)

## Этап 2 — свитки (Party-акт)
- ✅ T2.1 `lib/scribe-settings.ts` (таблица+parse+scribeRowFor+SpellLevelKey)
- ✅ T2.2 `lib/scribe.ts` (pure часы: порог Σ≥норма)
- ✅ T2.3 Мигр. 132: `scribe_runs` + RLS — на проде
- ✅ T2.4 `lib/campaign.ts`: регистрация scribe_settings + spell_settings
- ✅ T2.5 `app/actions/scribe.ts::runScribe` + `createScrollItem`
- ✅ T2.6 `lib/queries/scribe-tg.ts` (settings/searchSpellsTg/scrollHoldings/runs)
- 🔨 T2.7 /tg: `scribe-screen.tsx` (агент a2bd685) → интеграция в party-tab (я)
- ⬜ T2.8 Настройки: `updateScribeSettings` + editor + Section
- ✅ T2.9 Лента: mode 'scribe' в 'craft'
- ✅🧪 T2.10 scribe-settings.test.ts ✅ · ledger-scribe-format.test ⬜

## Этап 3 — переподготовка (PC-глагол)
- ✅ T3.1 `lib/spell-settings.ts` + parse + регистрация
- ✅ T3.2 `runReprep` (getMembership+isPcOwner, level-гейт, PC/общак)
- 🔨 T3.3 /tg: `ReprepSheet` в spell-sheets.tsx (агент a2359ee) → регистрация в action-hub (я)
- ✅ T3.4 Лента: тип 'reprep' (авто-резолв actorPcId)
- ⬜ T3.5 Настройки: spell-settings-editor + Section
- ✅🧪 T3.6 spell-settings.test.ts ✅ · ledger-reprep-format.test ⬜

## Этап 4 — копирование (PC-глаголы)
- ✅ T4.1 `runCopySpell` scroll-to-book (расход свитка) в spell-verbs.ts
- ✅ T4.2 `runCopySpell` book-to-book (нарратив)
- 🔨 T4.3 /tg: `CopySheet` в spell-sheets.tsx (агент a2359ee) → регистрация (я)
- ✅ T4.4 Лента: тип 'copy' (copyMode, scrollConsumed)
- ⬜ T4.5 🧪 ledger-copy-format.test.ts

## Финал
- ✅ V1 typecheck чистый (build — проверить в интеграции) · 🧪 V2 vitest: 23 новых ✅
- ✅ V3 миграции 130+132 на проде (140+ сид спеллов — после скрапера)
- ⬜ V4 ux-auditor · ⬜ V5 self adversarial-review · ⬜ V6 PR + пометка /ultrareview

**Состояние:** серверная механика (4 глагола + лента + настройки + read + pure-тесты)
ГОТОВА и typecheck-чистая. В работе: 3 фоновых агента (скрапер данных + 2 /tg-UI).
Дальше: интеграция UI (party-tab/action-hub/shell) + редакторы настроек + вики-рендер
спелла + ledger-format тесты + верификация + self-review.
