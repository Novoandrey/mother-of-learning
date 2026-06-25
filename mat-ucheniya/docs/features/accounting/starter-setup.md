# Стартовый сетап петли

> При старте новой петли DM одним нажатием применяет стандартный пакет:
> кредит, сид монет и предметов в общак, стартовые кошельки PC. Всё это —
> autogen-транзакции, которые система умеет пере-применять без конфликтов
> с ручными правками. Спеки 012 и 019.

---

## Что настраивается

Страница `/accounting/starter-setup/` доступна только DM/owner. Две вкладки:

**«Кампания»** — три карточки campaign-level:

- **Кредит** (`campaign_starter_configs.loan_amount_*`) — сумма в монетах,
  которую получает каждый PC при старте петли. Берут кредит только PC с
  `takes_starting_loan = true` (по умолчанию `true`; Лекс в mat-ucheniya
  держит `false`).
- **Монеты в общак** (`stash_seed_coins`) — однократная закладка монет в
  общак при старте.
- **Предметы в общак** (`stash_seed_items`) — список предметов (название +
  количество), которые попадают в общак при старте.

**«Персонажи»** — стек per-PC карточек
(`<PcStarterOverviewList>` → `<PcStarterConfigBlock>`). Для каждого PC:
флаг `takes_starting_loan`, стартовые монеты, стартовые предметы.

Конфиги хранятся в таблицах `campaign_starter_configs` и
`pc_starter_configs` (миграция `037_loop_start_setup.sql`). При создании
кампании/PC строки сидятся с нулями через `initializeCampaignFromTemplate`.

---

## Кнопка «Применить»

`<ApplyStarterSetupButtonClient>` (`components/apply-starter-setup-button-client.tsx`)
реализует двухфазовый флоу:

1. **Первый клик** — server action `applyLoopStartSetup(loopNodeId)` вычисляет
   diff между желаемым набором строк и тем, что уже есть в ledger.
   Если среди существующих autogen-строк есть «тронутые» (DM отредактировал
   или удалил вручную) — action возвращает `needsConfirmation: true` со
   списком затронутых строк.
2. **Диалог подтверждения** — DM видит, какие конкретно строки будут
   перезаписаны, и нажимает «Всё равно применить» или отменяет.
3. **Второй клик (confirmed=true)** — action проводит изменения через RPC
   `apply_loop_start_setup` и вызывает `router.refresh()`.

После успешного apply страница обновляется, баннер «Сетап не применён»
пропадает.

---

## Autogen-слой и «тронутые» строки

Каждая autogen-транзакция несёт три дополнительных поля (добавлены
миграцией 037):

| Поле | Смысл |
|---|---|
| `autogen_wizard_key` | Что породило строку: `starting_money`, `starting_loan`, `stash_seed`, `starting_items` |
| `autogen_source_node_id` | UUID loop-ноды — привязывает набор строк к конкретной петле |
| `autogen_hand_touched` | `true` если строка была отредактирована или создана вручную после apply |

**Триггер `trg_tx_autogen_hand_touched`** (BEFORE UPDATE) автоматически
ставит `autogen_hand_touched = true`, когда строку правят вне apply. Защита
обходится через session setting `spec012.applying = true`, которое
выставляет RPC перед batch-обновлением.

**Триггер `trg_tx_autogen_tombstone`** (AFTER DELETE) записывает строку в
`autogen_tombstones` при ручном удалении. Tombstone читается при следующем
apply — строка не будет пересоздана.

Логика «что считать тронутым» инкапсулирована в
`lib/starter-setup-affected.ts` (`identifyAffectedRows()`). Diff между
желаемым и существующим — `lib/starter-setup-diff.ts` (`diffRowSets()`).
Разрешение желаемого набора из конфигов — `lib/starter-setup-resolver.ts`
(`resolveDesiredRowSet()`).

Вся эта цепочка вынесена в `lib/autogen-reconcile.ts`
(`computeAutogenDiff` / `applyAutogenDiff`) — переиспользуемые примитивы,
которые уже применяет spec-013 (encounter loot) с тем же RPC.

---

## Баннер «Стартовый сетап не применён»

Показывается на странице петли, если loop-нода существует, но ни одной
autogen-транзакции с `autogen_source_node_id = loop.id` ещё нет. Исчезает
после первого успешного apply. Кнопка в баннере ведёт на `/starter-setup/`.

---

> См. также: [`README.md`](README.md) — общий обзор бухгалтерии;
> [`../stash-and-skladchina/README.md`](../stash-and-skladchina/README.md) — общак как получатель seed;
> [`technical.md`](technical.md) — `computeAutogenDiff` / `applyAutogenDiff` под капотом.
