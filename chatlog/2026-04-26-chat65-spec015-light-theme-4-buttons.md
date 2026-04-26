# chat 64–65: spec-015 light theme + 4-button UX редизайн

**Дата:** 2026-04-26
**Спек:** `.specify/specs/015-item-catalog/`
**Прошлый чат:** chat 63 (Phases 1–6 закрыты, прод задеплоен `afe8046`).

## Контекст

После деплоя пользователь прислал 4 скриншота с проблемами:

1. Каталог `/items` рендерится, но текст серый-на-сером — **dark theme
   на фоне светлого приложения** (я случайно использовал `text-zinc-*` /
   `bg-zinc-*` вместо стандартных `text-gray-*` / `bg-white`).
2. Permalink Образца имеет ту же проблему.
3. Форма создания предмета — чёрные input'ы поверх белого фона.
4. **Нет вкладки «Предметы»** в navbar — приходится вбивать URL.
5. В бухгалтерии и на странице игрока **нет item-кнопок** —
   единственный путь записать предмет был через «Положить/Взять из
   Общака», что не покрывает «PC получил лут / купил у NPC / продал».

Запрос пользователя:
> «можешь провести UX ревизию и предложить наилучший вариант с
> наименьшим трением и самой удобной последующей реализацией для мобилки»

Существующая модель: `+ Транзакция` → форма с табами `Доход / Расход
/ Перевод`. Item-таб существовал но в non-stash mode выкидывал ошибку.

## UX ревизия (chat 65)

Решение: **4 явных кнопки-действия** на странице вместо одного CTA с
табами в форме:
- `+ Доход` (emerald)
- `− Расход` (rose)
- `+ Предмет` (blue)
- `− Предмет` (gray)

«Перевод» — уходит из top-level кнопок; вместо отдельной кнопки `↔
Перевод` встраивается как opt-in **recipient picker** внутри `−
Расход` / `− Предмет`. Семантически это нативнее — «отдал кому-то
деньги» = `−` от себя в адрес кого-то.

Stash-кнопки (`Положить/Взять из Общака`) **остаются** отдельным
рядом — пользователь явно попросил оставить, и это специальные
шорткаты для частого use case.

**Mobile-first:** 4 кнопки → 2×2 grid. Каждая полностью тапается
большим пальцем без жестов.

## Что сделано

### Light theme conversion (chat 64, commit `1104f4a`)
Bulk sed replacement в spec-015 UI:
- `text-zinc-100/200/300/...` → `text-gray-900/800/700/...`
- `bg-zinc-900/40` → `bg-gray-50`
- `bg-zinc-950` → `bg-white`
- `bg-amber-600` (orange CTA) → `bg-blue-600` (primary blue)
- `border-zinc-700/800` → `border-gray-200`
- Rarity tone chips: `border-X-700 text-X-300` → `border-X-500 bg-X-50 text-X-800`

Файлы: `app/c/[slug]/items/page.tsx`, `app/c/[slug]/items/[id]/page.tsx`,
`components/item-{catalog-grid,filter-bar,form-page}.tsx`.

### Nav tab «Предметы» (chat 64, commit `1104f4a`)
Одна строчка в `components/nav-tabs.tsx` `TABS` массиве, между
«Бухгалтерия» и «Участники», icon 🎒. Видимо для всех member'ов.

### TransactionActions компонент (chat 65, commit `00d69c5`)
`components/transaction-actions.tsx` (~130 LOC):
- 4 кнопки с tone+hover классами (emerald/rose/blue/gray-50 backgrounds).
- `moneyOnly` prop сворачивает в 2 кнопки (для stash хедера и
  stash-as-actor в accounting).
- Mountит `<TransactionFormSheet>` с правильным `initialKind` когда
  кнопка нажата.
- Layout: `grid-cols-2 sm:flex` — на мобилке 2×2, на desktop в ряд.

### TransactionForm extension (chat 65, commit `00d69c5`)
- `TransactionActionKind = 'income' | 'expense' | 'transfer' | 'item-in'
  | 'item-out'` exported.
- `actionKindToFormKind` helper мапит в существующий `FormKind`.
- `ACTION_HEADINGS` map для статичных заголовков.
- `Props.initialKind` widened to `TransactionActionKind`.
- `hideTabBar` flag — true когда `initialKind === 'item-in'|'item-out'`
  AND not editing. Tab-bar заменяется на статичный
  `<div>{ACTION_HEADINGS[initialKind]}</div>`.
- **Item submit branch перерисован** — больше не выкидывает ошибку.
  Computes signed `itemQty = direction === 'in' ? Math.abs(itemQty) :
  -Math.abs(itemQty)` из `initialKind`, calls `createTransaction` с
  `kind: 'item'` и signed qty.
- `validateItemQty` loosened с `< 1` reject до `=== 0` reject (DB
  CHECK из мига 036 уже это разрешает для item-transfer pair'ов).

### TransactionFormSheet (chat 65, commit `00d69c5`)
- `initialKind?: TransactionActionKind` (widened).
- Imports `TransactionActionKind` from `<TransactionForm>`.

### Wiring (chat 65, commit `00d69c5`)
- `<WalletBlockClient>`: `+ Транзакция` button → `<TransactionActions>`.
  `openCreate` callback removed. Existing `<TransactionFormSheet>`
  оставлен но gated на `{editing && (...)}` для edit flow.
- `<BalanceHeroClient>`: полностью переписан. Нет local sheet state —
  `<TransactionActions moneyOnly={true}>`. Stash hero не нуждается в
  edit flow (live в ledger вкладке ниже).
- `<LedgerActorBar>`: 3 hand-rolled кнопки (Доход/Расход/Перевод) +
  `TransactionFormSheet` mount → один `<TransactionActions>`. Drop
  `sheetOpen`, `initialKind` state, `openSheet`, `closeSheet`,
  `buttonsDisabled`, `TransactionFormSheet` import. Add
  `TransactionActions` import. `moneyOnly={selectedIsStash}`.

## Решения сделанные по ходу

- **Edit flow на `<WalletBlockClient>` оставлен** на legacy tabbed
  sheet — DM может править существующий row, и kind может потребовать
  смены. Tab-bar нужен в этом контексте. Create flow — через
  `<TransactionActions>`.
- **Stash actor → `moneyOnly`** в accounting bar — items в общаке
  flow через PC's stash-кнопки, не stash-as-own-actor.
- **Перевод (money) лишился top-level кнопки** — будет re-добавлен в
  следующий батч как opt-in recipient picker внутри `− Расход`.

## Verification

- ✅ tsc clean for spec-015 code (только pre-existing 2 ошибки в
  starter-setup tests).
- ✅ lint 0/0.
- ✅ vitest **356/356** passing.
- ❌ `next build` локально не прогонялся (sandbox slow). Vercel CI
  должен отловить если что-то регрессировало.

## Коммиты

- `1104f4a` — light theme + Предметы nav tab
- `00d69c5` — UX revision: 4-button TransactionActions

## Действия пользователю (после чата)

- [x] Pull `00d69c5`, проверить Vercel deploy.
- [ ] Smoke: на странице игрока, accounting, stash hero видны 4 (или
  2 для stash) кнопки. Mobile 2×2 grid удобен.
- [ ] `+ Предмет` открывает форму без таб-bar, со статичным
  заголовком, typeahead, qty. Submit пишет single item row на
  permalink Образца.
- [ ] `− Предмет` пишет с отрицательным qty.
- [ ] `+ Доход` / `− Расход` работают как раньше.
- [ ] Edit existing row (✏️ в ленте) — открывает legacy форму с
  таб-bar — это OK.

## Что помнить следующему чату

- Коммит `00d69c5` нужно протестировать на проде. Если есть
  регрессии — фикс перед дальнейшей работой.
- **Bundle (item + деньги)** — следующая фича. Опциональное поле
  «Заплатил, gp» / «Получил, gp» в item-форме. Сервер пишет 2 строки
  одним `batch_id`. Нецелые gp авто-разбиваются в копейки/серебро.
- **Recipient picker** — следующая фича. Опциональный `<select>` PC
  в `− Расход` / `− Предмет`. Когда указан → routes в `createTransfer`
  / `createItemTransfer`. Sheet нужны новые props (`availablePcs`)
  пробрасываемые from server pages.
- T009 (refactor `aggregateStashLegs`), T021 (history pagination) —
  всё ещё отложены.
- 2 pre-existing starter-setup tsc errors остаются.
