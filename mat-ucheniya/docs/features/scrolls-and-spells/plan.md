# План реализации spec-059 (из карт канона)

> Собран из ориентационного картирования 7 подсистем (крафт-сервер, settings-
> парсер, /tg-UI, ноды+вики, скрапер, лента, миграции). Каждый пункт зеркалит
> конкретный прецедент. Числа = дефолты парсеров (AGENTS.md), не константы.

## Зафиксированные решения (закрывают Open из spec.md)

| Вопрос | Решение | Почему |
|---|---|---|
| Хранение спелла | `nodes.content`=2014 body, `fields.content_2024`=2024 (nullable), `fields.{level,school,casting_time,range,components,duration,concentration,ritual,classes,source,slug}` | Влезает в ноду; без side-table (карта node-wiki) |
| Связь свиток→спелл | `scroll.fields.spell_node_id` (uuid, **БЕЗ FK**) + отдельный резолв | Второй FK на nodes ломает эмбеды (мигр.128, грабля #1) |
| Лента: свитки | `mode:'scribe'` в типе `craft` | Идентичная форма (participants+hours+общак+recipient); resolveNames уже готов |
| Лента: переподготовка/копирование | НОВЫЕ типы `reprep`, `copy` (несут `actorPcId`) | Одиночный актор, не лезут в craft.participants; resolveNames авто-резолвит через actorPcId |
| Уровень-гейт | `maxSpellLevel = min(9, ceil(party_level/2))` в `lib/party-level.ts` | Правило D&D, НЕ настройка (как pbForLevel) |
| Деньги reprep/copy | кошелёк PC (дефолт), SegToggle wallet\|общак | spec §3/§4 |
| Заговор reprep | 0 зм | spec §3 |

## Этап 1 — база заклинаний

- **Мигр. 130** `130_spell_node_type.sql`: node_type `spell` per-campaign (cross-join, icon 📜, sort ~70), fields-схема в default_fields. `notify pgrst`.
- **TS-сидеры** (новые кампании): `lib/seeds/dnd5e-srd.ts` NODE_TYPES += spell; `lib/seeds/item-value-lists.ts` DEFAULT_ITEM_CATEGORIES += scroll.
- **Скрапер** `scripts/scrape_dndsu_spells.py` (форк scrape_dndsu.py): fetch/cache/md слой ВЕРБАТИМ (sha1(url) кэш уже two-domain-safe), два индекса (dnd.su + next.dnd.su), drop `/homebrew/`, `url_to_slug_and_id` `/items/`→`/spells/`, НОВЫЙ `parse_spell` (level/school/…), merge двух прогонов по slug → SpellRecord{content, content_2024}. Fixtures `dndsu-spells-cache-fixtures/` + `test_scrape_dndsu_spells.py`. Smoke `--limit 5` против живого сайта.
- **Codegen** `scripts/spells-dndsu-codegen.ts` (форк items-dndsu-codegen.ts): `dndsu_spells.json` → `--emit-migrations` → `NNN_dndsu_<источник>_spells.sql` (looks up slug='spell', insert nodes(title,fields,content), guard `where not exists fields->>'slug'`). nextMigrationNumber → 131+.
- **Десктоп**: `app/c/[slug]/spells/[id]/page.tsx` (по items/[id], Stat/Chip + client edition-toggle 2014/2024) + `app/c/[slug]/spells/page.tsx` (список) + редиректы в `catalog/[id]/page.tsx` и `catalog/page.tsx` (limit-200 обход).
- **/tg**: `lib/queries/spells-tg.ts` (getSpellNodes/getSpellNode/searchSpellsTg, `{data,error}` throw) + `app/tg/_components/spell-app.tsx` (по wiki-app, header-статблок + сегмент-тоггл редакции) + роутер-кейсы в `shell.tsx`.

## Этап 2 — свитки (Party-акт)

- `lib/scribe-settings.ts` (по craft-settings.ts): тип `ScribeSettings{ table: Record<SpellLevelKey,{hours,costGp}>, hoursPerDay:8, hoursPerWeek:40 }`, DEFAULT из таблицы spec, `parseScribeSettings`, хелперы `scribeRowFor(s,level)`. Новый `SpellLevelKey`/`SPELL_LEVEL_KEYS`.
- `lib/scribe.ts` (по craft.ts pure): `cleanScribeParticipants`, `totalScribeHours`, `missingScribeHours(requiredHours,totalHours)`.
- **Мигр. 132** `scribe_runs` (по craft_runs: spell_node_id, output_scroll_node_id, level, participants jsonb, invested_gp, recipient_node_id…) + RLS is_member + категория `scroll`.
- `app/actions/scribe.ts::runScribe` (клон runCraft): getMembership → party_level → level ≤ maxSpellLevel → Σhours ≥ table.hours → покрытие общака (costGp фикс) → batch (expense общак + scroll-item recipient, один transfer_group_id) → scribe_runs → feed mode 'scribe'. `createScrollItem` (клон createSchemaItem, категория scroll, «Свиток: X (N ур.)»).
- **/tg**: `ScribeScreen`+`ScribeRunSheet` (клон CraftScreen/CraftRunSheet) в party-tab (EntryCard 🪶 Свитки, case 'party-scribe'); спелл-пикер = `searchSpellsTg` (level ≤ maxSpellLevel). `lib/queries/scribe-tg.ts` (getScribeSettingsTg, listScribeRuns).
- **Настройки**: `updateScribeSettings` (клон updateCraftSettings) + `components/scribe-settings-editor.tsx` + Section в items/settings/page.
- **Регистрация**: `lib/campaign.ts` (scribe_settings в CampaignSettings/DEFAULT/parse).
- **Лента**: mode 'scribe' в ledger-format.ts (craft-case ветка).

## Этап 3 — переподготовка (PC-глагол)

- `lib/spell-settings.ts` (по craft-settings.ts): `SpellSettings{ reprepGpPerLevel:50, copyGpPerLevel:50, copyHoursPerLevel:2 }` + parse.
- `app/actions/spell-verbs.ts::runReprep`: getMembership + isPcOwner(pcId) → level ≤ maxSpellLevel → cost=reprepGpPerLevel×level (0 для заговора) → money-out с кошелька PC (или общак по флагу) → feed type 'reprep'. Мгновенно, без runs-лога (v1 доверие).
- **/tg**: `ReprepSheet` (клон SpendSheet) в action-hub (VERBS или MoreRow); спелл-пикер searchSpellsTg; money SegToggle wallet|общак; preview `🔄 X → Y (N ур.) · −150 зм`.
- **Лента**: новый тип `reprep`.

## Этап 4 — копирование (PC-глаголы)

- `runCopyScroll` (свиток→книга): isPcOwner → списать свиток (−1 item, канон disassemble) + cost=copyGpPerLevel×level (spell+level ИЗ свитка) → feed type 'copy' mode 'scroll-to-book' scrollConsumed. `runCopyBook` (книга→книга): source-PC + spell-пикер, ничего не расходуется, только деньги + нарратив, feed mode 'book-to-book'.
- **/tg**: `CopySheet` (клон, с выбором scroll из инвентаря / source-PC + spell) в action-hub.
- **Лента**: тип `copy` (actorPcId, spell, source, mode, scrollConsumed).
- Числа copy — `spell_settings` (те же 50×ур + 2ч×ур нарратив).

## Верификация

typecheck + build + vitest (parser-тесты + ledger-format-тесты по прецедентам) + **ux-auditor** (после /tg-правок) + миграции на прод (ssh, verify-блок, reload PostgREST). /tg браузером не превьюится.

## Порядок

1 (база) → 2/3/4 (независимы, поверх базы). Общие hub-файлы (campaign.ts, shell.tsx, ledger-format.ts, party-tab.tsx, action-hub.tsx) правит интегратор, изолированные артефакты (скрапер, десктоп-страницы, редакторы настроек, pure-хелперы, тесты) — параллельные агенты.
