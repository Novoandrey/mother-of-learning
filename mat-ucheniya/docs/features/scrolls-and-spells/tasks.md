# tasks — spec-059 (свитки/заклинания)

Легенда: ⬜ todo · 🔨 в работе · ✅ done · 🧪 нужен тест/верификация

## Этап 1 — база заклинаний
- ⬜ T1.1 Мигр. 130: node_type `spell` per-campaign + default_fields + notify pgrst + verify
- ⬜ T1.2 TS-сидеры: NODE_TYPES += spell (dnd5e-srd.ts), DEFAULT_ITEM_CATEGORIES += scroll (item-value-lists.ts)
- ⬜ T1.3 `lib/party-level.ts`: + `maxSpellLevel(partyLevel)`
- ⬜ T1.4 Скрапер `scripts/scrape_dndsu_spells.py` (форк) + fixtures + `test_scrape_dndsu_spells.py`
- ⬜ T1.5 Smoke-run скрапера `--limit 5` против живого dnd.su + next.dnd.su
- ⬜ T1.6 Codegen `scripts/spells-dndsu-codegen.ts` (форк) → seed-миграции
- ⬜ T1.7 Прогон скрапера (полный или ур.0–5) → `dndsu_spells.json` → сид-миграции 131+
- ⬜ T1.8 Десктоп: `spells/[id]/page.tsx` + edition-toggle + `spells/page.tsx` список
- ⬜ T1.9 Десктоп-редиректы: `catalog/[id]` → /spells/[id], `catalog/page` type=spell → /spells
- ⬜ T1.10 /tg: `lib/queries/spells-tg.ts` (getSpellNodes/getSpellNode/searchSpellsTg, throw-on-error)
- ⬜ T1.11 /tg: `app/tg/_components/spell-app.tsx` (статблок + сегмент-тоггл 2014/2024) + shell.tsx роутер

## Этап 2 — свитки (Party-акт)
- ⬜ T2.1 `lib/scribe-settings.ts` (тип+DEFAULT из таблицы spec+parse+scribeRowFor) + `SpellLevelKey`
- ⬜ T2.2 `lib/scribe.ts` (pure: clean/total/missing hours)
- ⬜ T2.3 Мигр. 132: `scribe_runs` + RLS is_member + категория `scroll` per-campaign
- ⬜ T2.4 `lib/campaign.ts`: регистрация scribe_settings (+ spell_settings)
- ⬜ T2.5 `app/actions/scribe.ts::runScribe` + `createScrollItem`
- ⬜ T2.6 `lib/queries/scribe-tg.ts` (getScribeSettingsTg, listScribeRuns)
- ⬜ T2.7 /tg: ScribeScreen + ScribeRunSheet + EntryCard 🪶 + case party-scribe (party-tab)
- ⬜ T2.8 Настройки: `updateScribeSettings` + `scribe-settings-editor.tsx` + Section
- ⬜ T2.9 Лента: mode 'scribe' в 'craft' (ledger-format.ts) + формат-ветка
- ⬜ T2.10 🧪 тесты: scribe-settings.test.ts + ledger-scribe-format.test.ts

## Этап 3 — переподготовка (PC-глагол)
- ⬜ T3.1 `lib/spell-settings.ts` (reprepGpPerLevel/copyGpPerLevel/copyHoursPerLevel) + parse + регистрация в campaign.ts
- ⬜ T3.2 `app/actions/spell-verbs.ts::runReprep` (getMembership+isPcOwner, level-гейт, money-out PC/общак)
- ⬜ T3.3 /tg: ReprepSheet (клон SpendSheet) в action-hub + spell-пикер
- ⬜ T3.4 Лента: новый тип 'reprep' (union+formatter) + resolveNames авто (actorPcId)
- ⬜ T3.5 Настройки: spell-settings-editor + Section
- ⬜ T3.6 🧪 ledger-reprep-format.test.ts + spell-settings.test.ts

## Этап 4 — копирование (PC-глаголы)
- ⬜ T4.1 `runCopyScroll` (свиток→книга: списать свиток −1, cost из свитка) в spell-verbs.ts
- ⬜ T4.2 `runCopyBook` (книга→книга: source-PC + spell, ничего не расходуется)
- ⬜ T4.3 /tg: CopySheet(s) в action-hub (выбор свитка из инвентаря / source-PC + spell)
- ⬜ T4.4 Лента: тип 'copy' (mode scroll-to-book|book-to-book, scrollConsumed)
- ⬜ T4.5 🧪 ledger-copy-format.test.ts

## Финал
- ⬜ V1 typecheck + build чистые
- ⬜ V2 vitest зелёный
- ⬜ V3 миграции на прод (ssh, verify, reload PostgREST)
- ⬜ V4 ux-auditor по /tg-поверхностям
- ⬜ V5 self adversarial-review (workflow) → фиксы
- ⬜ V6 PR + пометка Andrey запустить /ultrareview
