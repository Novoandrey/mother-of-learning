# Feature Specification: Starter Setup Overview (одностраничный редактор для всех PC)

**Feature Branch**: `019-starter-setup-overview`
**Created**: 2026-04-27
**Status**: Clarified (2026-04-27)
**Input**: User prompt — «маленькая спека со стартовыми предметами
и деньгами на одном экране для всех персонажей в разделе
"Бухгалтерия"». Чистый UI-слой над spec-012; миграций 0.

## Context

Spec-012 прокатилась полностью: per-PC стартовый сетап (флаг
кредита + стартовые монеты + стартовые предметы) живёт в таблице
`pc_starter_configs`, на каждого PC одна строка. Серверные actions
`updatePcStarterConfig` / `setPcTakesStartingLoan` уже работают,
запрос `getPcStarterConfigsForCampaign(campaignId)` уже отдаёт
весь набор сразу с PC title. Page `/accounting/starter-setup`
существует и редактирует **кампанейскую** часть (размер кредита +
сидинг общака монетами + предметами).

**Дыра**: per-PC редактирование сейчас доступно **только** на
странице конкретного PC (`/catalog/[pcId]` → `<PcStarterConfigBlock>`).
В кампании mat-ucheniya 29 PC-нод. Чтобы DM собрал стартовый
набор на новую петлю, ему надо открыть 29 страниц подряд, ввести
монеты, добавить предметы, сохранить. Это медленно, разрывает
концентрацию, не даёт сравнить «у кого сколько уже стоит». Игроки
этой страницы вообще не видят (в каталог PC они заходят редко;
их способ работы со стартом — баннер на /loops + `<PcStarterConfigBlock>`
в режиме `player`, где интерактивен только флаг кредита).

**Вторая дыра**: кнопка «Применить стартовый сетап» живёт на
`/loops` (spec-012 Phase 8) — далеко от страницы, где DM
настраивает то, что применяется. Получается классический
split-of-concerns не в ту сторону: «настрой здесь, применяй
там». DM открывает обе страницы в соседних табах, переключается
между ними. Логичный UX — то и другое в одном месте.

**Решение**: добавить на `/accounting/starter-setup` (или сделать
sibling-страницей, см. Clarifications) **табличный обзор всех PC**
кампании — одна строка на PC, столбцы для основных параметров,
inline-редактирование без перехода между страницами. На той же
странице — секция «Применение к петле» с кнопкой Apply. Это
снимает рутину массового редактирования и даёт DM'у обзор
«у кого что» + одно место для запуска применения.

**Не это**:
- Не меняем модель данных. Те же `pc_starter_configs`, те же
  actions.
- Не меняем механику применения. `applyLoopStartSetup` остаётся
  тем же (см. spec-012 § FR-021..FR-028).
- Не меняем `/catalog/[pcId]` → `<PcStarterConfigBlock>`. Игрок
  по-прежнему видит свои стартовые параметры на своей странице.
  Spec-019 — это **дополнительный** DM-only обзор, не замена.
- Не плодим новые источники истины. Если DM правит здесь и DM
  правит на странице PC — обе точки пишут в ту же строку
  `pc_starter_configs`, последняя запись побеждает.

## Goals

- **G-1**: DM видит стартовые параметры всех PC кампании на одном
  экране (флаг кредита, монеты, предметы) — без переходов.
- **G-2**: DM правит любую ячейку in-place, сохранение per-row
  (как минимум — см. Q3 ниже про per-cell vs save-all).
- **G-3**: Page реюзит уже существующие client-компоненты
  (`<StartingCoinPickerClient>`, `<StartingItemsEditorClient>`,
  `<LoanFlagToggleClient>`) — нулевая дубляция бизнес-логики.
- **G-4**: Page прячется от не-DM ролей. Player'ы редиректятся
  на `/accounting` (как делает текущая `/accounting/starter-setup`).
- **G-5**: Page не плодит миграций. Всё делается на существующих
  таблицах и actions.
- **G-6**: На той же странице DM **применяет** стартовый сетап к
  петле (кнопка «Применить» переезжает с `/loops`). Source of
  truth для apply — один, не два.

## Non-goals

- **NG-1**: Не вводим bulk-операции. «Поставить 100 gp всем»,
  «добавить 1 healing potion всем» — отдельная фича, если
  захочется (см. § Open questions / Q5). MVP — это просто
  таблица с inline-редактированием.
- **NG-2**: Не вводим фильтры/сортировку столбцов. PC-ов
  максимум ~30, fits на экран; сортировка по title по умолчанию.
- **NG-3**: Не ломаем существующий `/accounting/starter-setup` UX
  для кампанейской части (loan amount + stash seed). Эти три
  карточки остаются — вопрос только, как их соотнести с новой
  PC-таблицей (см. Q1).
- **NG-4**: Не вводим audit-log «кто когда что менял». В spec-012
  уже есть `autogen_hand_touched` для tx-уровня; конфиг сам по
  себе не логируется и здесь продолжаем эту политику.
- **NG-5**: Не трогаем мобилку. Editor — desktop-first (DM
  работает за компом).

## User Scenarios

### US-1 — Массовое выставление монет в начале новой кампании
DM открывает `/accounting/starter-setup`, видит таблицу из 29 PC.
Все стоят на дефолтных нулях. DM по очереди выставляет каждому
персонажу его стартовые монеты по классу/бэкграунду (`Маркусу
50 gp`, `Лекс 20 gp + 30 sp`, и т.д.). Каждое сохранение —
короткий save-action на конкретную строку. Через 5 минут все 29
персонажей готовы; не было ни одного навигационного клика.

### US-2 — Точечная правка перед петлёй
Один из игроков пишет: «у моего на следующую петлю должна быть
кольчуга в стартпаке, забыли добавить». DM открывает
`/accounting/starter-setup`, находит строку по PC title, кликает
на ячейку «Стартовые предметы», добавляет «Кольчуга × 1»,
сохраняет. Никаких других переходов.

### US-3 — Игрок отказывается от кредита
Один игрок (Lex) сказал «мой бэкграунд — он сам себе банкир, не
берёт кредит». DM находит строку Lex'а в таблице, выключает
чекбокс `takesStartingLoan`. Сохраняется per-row через тот же
`<LoanFlagToggleClient>` в DM-режиме.

### US-4 — DM сверяет «у кого что» и сразу применяет
Перед началом новой петли DM открывает `/accounting/starter-setup`,
просматривает таблицу, видит что у двух персонажей пустые items,
правит. На той же странице сверху — секция «Применение к петле
N» с кнопкой Apply. Жмёт, видит modal hand-touched (если есть
ручные правки), подтверждает. Никаких переходов на /loops.

### US-5 — DM по старой памяти зашёл на /loops
DM привык применять сетап с `/loops`. Открывает /loops, видит
тонкую info-строку «Стартовый сетап настраивается и применяется
в Бухгалтерии» с link'ом. Кликает, попадает на правильную
страницу. Никакого «куда делась кнопка».

## Functional Requirements

### Page placement

- **FR-001**: Страница, на которой живёт обзор — DM-only. Player и
  не-член кампании редиректятся на `/accounting` (как уже делает
  текущая `/accounting/starter-setup`). См. Q1 — exact route и
  layout-relationship с существующей campaign-level страницей.

### Data shape

- **FR-002**: Page загружает на сервере `getPcStarterConfigsForCampaign(campaignId)`
  — он уже возвращает массив `{ pcId, takesStartingLoan,
  startingCoins, startingItems, updatedAt, pcTitle }`. Никаких
  новых запросов.
- **FR-003**: Сортировка строк — по `pcTitle` (alphabetical, RU-collation).
  PC без `pc_starter_configs` row фолбэчатся на defaults
  (`takesStartingLoan: true`, `startingCoins: {0,0,0,0}`,
  `startingItems: []`) — ровно как делает `getPcStarterConfig`
  на странице PC.

### Layout

- **FR-004**: Каждый PC = один блок (строка таблицы или карточка —
  см. Q2). Блок содержит:
  - PC title (с link на `/catalog/[pcId]` для контекста).
  - Toggle «Берёт стартовый кредит» (interactive в DM-mode).
  - Editor «Стартовые монеты» (cp/sp/gp/pp, 4 input'а).
  - Editor «Стартовые предметы» (list of `{name, qty}` rows).
- **FR-005**: Editors реюзят существующие client-компоненты
  (`<StartingCoinPickerClient>` со scope `{kind: 'pc', pcId}`,
  `<StartingItemsEditorClient>` со scope `{kind: 'pc', pcId}`,
  `<LoanFlagToggleClient>` с `interactive=true`). Это требование
  обеспечивает однообразие UX между этой страницей и
  `<PcStarterConfigBlock>` на /catalog/[pcId].

### Save semantics

- **FR-006**: Сохранение — per-row, кнопкой Save рядом с каждым
  editor'ом. Это согласуется с тем, как сейчас работают
  `<StartingCoinPickerClient>` и `<StartingItemsEditorClient>` на
  странице PC. См. Q3 — alternative: page-level save-all.
- **FR-007**: На успешное сохранение — короткий confirmation
  («Сохранено», fade out через ~1.5s) на уровне строки. На ошибку
  — error message в той же строке, остальные строки не затронуты.

### Permissions

- **FR-008**: Page пишет через те же server actions
  (`updatePcStarterConfig`, `setPcTakesStartingLoan`), которые уже
  делают авторизацию (`requireDmOrOwner` для coins+items,
  `requireDmOrOwner OR pc-owner` для loan flag). На этой странице
  все правки от DM, поэтому условие проходит. Дополнительная
  page-level гейтация — обычный role-check как в текущей
  `/accounting/starter-setup`.

### Navigation

- **FR-009**: В sub-nav `/accounting` (`<AccountingSubNav>`) ссылка
  «Стартовый сетап» уже существует — она ведёт на ту же страницу,
  на которой будет жить обзор. Никаких новых пунктов меню. Если
  Q1 решит выделить overview на отдельный route — добавим там
  ссылку.

### Empty states

- **FR-010**: Если в кампании 0 PC — page показывает пустое
  состояние («В кампании пока нет персонажей. Создайте PC в
  каталоге, чтобы настроить им стартовый сетап»).

### Performance

- **FR-011**: Page загружается за один server roundtrip. PC-list +
  starter-configs объединяются в один JOIN на сервере (это уже
  делает `getPcStarterConfigsForCampaign`).
- **FR-012**: Страница force-dynamic (как и существующая
  `/accounting/starter-setup`) — данные читаются свежими каждый
  раз, без кеширования.

### Apply section

Применение стартового сетапа сейчас живёт на `/loops` (spec-012
Phase 8): per-loop баннер «Стартовый сетап не применён» + кнопка
«Применить» + modal с таблицей hand-touched рядов (если
повторное применение). Spec-019 переносит этот UX на страницу
самого сетапа — настройки и применение в одном месте.

- **FR-013**: На странице сетапа есть выделенная секция
  «Применение к петле» — DM-only, выше табов «Кампания /
  Персонажи». Видна всегда (не только когда есть unapplied loop).
- **FR-014**: Секция показывает **текущую (latest) петлю**
  кампании с её статусом применения:
  - **Не применено** → primary-кнопка «Применить к петле N»;
  - **Применено** → текст «✓ Применено в день D» (или ISO date),
    disabled-вариант кнопки + secondary-link «Применить заново»
    (открывает тот же modal hand-touched flow для reconcile).
- **FR-015**: Если в кампании есть несколько unapplied петель
  (редкий кейс — DM пропустил петлю), под основной строкой
  показывается компактный список «Не применено также в петлях:
  3, 4» с per-row apply-кнопками. Это тот же list, что сейчас
  в `<UnappliedLoopsBanner>` на `/loops`, просто перевезён сюда.
- **FR-016**: Apply-кнопка вызывает существующий action
  `applyLoopStartSetup(loopNumber, options)`. Никаких изменений в
  серверной логике (resolver/diff/affected/validation pipeline,
  RPC `apply_loop_start_setup`, `spec012.applying` guard). Вся
  правка — UI surface.
- **FR-017**: Modal hand-touched rows (живёт сейчас внутри
  `<ApplyStarterSetupButtonClient>` — confirm-flow при повторном
  применении) переиспользуется как есть. Compose-логика «есть
  hand-touched → confirm → apply» не меняется.
- **FR-018**: Баннер `<LoopStartSetupBanner>` на `/loops`
  **снимается**. На его место ставится короткая info-строка
  («Стартовый сетап настраивается в Бухгалтерии») с link'ом на
  `/accounting/starter-setup`. Это предотвращает разрыв в UX
  (DM, привыкший к старому месту, получит явное направление), но
  source of truth для apply становится один.

## Success Criteria

- **SC-1**: DM может редактировать стартовый сетап 29 персонажей
  без перехода на их personal pages. Конкретно: bench — поставить
  30 gp каждому из 29 PC занимает не больше 5 минут (напомним:
  через `/catalog/[pcId]` это сейчас ~30 переходов = ~10–15 минут).
- **SC-2**: Изменения, сделанные на overview, видны на странице
  PC и наоборот (один источник истины — `pc_starter_configs`).
- **SC-3**: Применение стартового сетапа (`applyLoopStartSetup`)
  работает идентично — никаких различий между «настроено через
  PC page» и «настроено через overview», между «применено с
  /loops» (старое место) и «применено с /accounting/starter-setup»
  (новое место).
- **SC-4**: Игрок (не-DM) не может попасть на overview. Прямой
  заход на URL → 404 или редирект на `/accounting`.
- **SC-5**: Lint, vitest, next build — чисто, миграций 0.
- **SC-6**: На `/loops` больше нет per-loop apply-кнопки. На её
  месте — info-line с ссылкой на `/accounting/starter-setup`.
  DM, кликая по старому пути, гарантированно попадает на новый.

## Clarifications

### Q1 — Where does the overview live? · **Resolved: B (tabs on the same page)**

Существующая `/accounting/starter-setup` остаётся entry-point'ом.
Внутри добавляем два таба: «Кампания» (текущие три карточки —
loan amount, stash seed coins, stash seed items) и «Персонажи»
(новый PC overview). Переключение CSS-only, оба таба смонтированы
сразу — паттерн уже использовался в spec-011 stash tabs.

Один URL, не плодит entry-points в навигации, sub-nav «Стартовый
сетап» по-прежнему один пункт. Таб по умолчанию — «Кампания»
(ничего не ломаем для текущих DM-привычек); глубокая ссылка на
конкретный таб через query param `?tab=pcs` (опционально, не
обязательно для MVP).

Альтернативы (отвергнуты): single-scroll page (длинный скролл
при 29 PC); sibling URL (плодит entry-points).

### Q2 — PC-block layout: cards or table? · **Resolved: B (stack of cards)**

Каждый PC — карточка, внутренний layout 1:1 повторяет
`<PcStarterConfigBlock>` в DM-режиме (loan flag + coin picker +
items editor). Это буквально 29 копий существующего блока,
обёрнутых page-frame'ом — нулевой риск UI-багов, ноль новой
логики.

При 29 PC × ~280px карточка = ~8000px скролл. Это OK для DM-tool
(не mobile-first, не критично-частая операция). Если в реале
density ощутится узким местом — табличный pass отдельной
итерацией (см. Roadmap P2).

Альтернатива (отвергнута): таблица с collapsible items —
требует custom collapsed/expanded state, новый UI-компонент,
риск багов.

### Q3 — Save semantics: per-editor or page-level? · **Resolved: A (per-editor)**

Coin picker и items editor каждый имеют свою Save-кнопку (как
на странице PC). Loan toggle сохраняется immediately
(`<LoanFlagToggleClient>` так уже работает). Чистый реюз
компонентов, нулевая новая state-логика, ошибки на одной
карточке не ломают остальные.

### Q4 — Loan flag visible to DM in overview? · **Resolved: yes, fully interactive**

DM видит все три контрола (loan + coins + items) в interactive-режиме.
Action `setPcTakesStartingLoan` уже разрешает DM'у переключать
флаг. Игрок свой флаг увидит на `/catalog/[pcId]` и при
несогласии переключит сам.

### Q5 — Bulk helpers? · **Resolved: NO in MVP**

Никаких «скопировать с PC X на всех», «заполнить 30 gp всем» в
MVP. Если по факту работы DM'а bulk станет узким местом — отдельный
focused improvement (spec-019.1 или backlog item). MVP — голая
таблица + per-PC editing.

### Q6 — Missing `pc_starter_configs` rows? · **Resolved: lazy fallback**

Page рендерит fallback-defaults (`takesStartingLoan: true`, coins=zeros,
items=empty) для PC без row. Первая правка через
`updatePcStarterConfig` action создаёт row (action делает upsert).
Никакого eager-bootstrap'а на page-load — ленивость нормальна,
defaults на read-side покрывают визуал.

Migration 037 уже сидела row'ы для всех существующих PC; новые
PC проходят через `ensurePcStarterConfig` hook. Этот fallback —
исключительно defensive против edge-case'ов (PC, созданные в обход
hook'а).

### Q7 — Что делать с баннером и кнопкой «Применить» на `/loops`? · **Resolved: снимаем баннер, оставляем info-line**

Сейчас на `/loops` DM-only `<UnappliedLoopsBanner>` показывает
unapplied loops + кнопки Apply, при клике открывается
`<HandTouchedConfirmDialog>` с reconcile-modal'ом.

После переноса apply на `/accounting/starter-setup` баннер
снимается полностью. На его место ставится тонкий info-блок
(одна строка, secondary-стиль): «Стартовый сетап настраивается
и применяется в [Бухгалтерии](link)». DM, который пришёл на
/loops по старой памяти, видит явное направление и кликает.

Альтернативы (отвергнуты):
- **Дублировать apply на оба URL**: два source of truth,
  путаница «где правильно», лишний код.
- **Оставить только баннер на /loops**: не достигает цели спеки
  («настройки + применение в одном месте»).
- **Полностью убрать упоминание с /loops**: DM, привыкший к
  старому месту, кликает по пустоте; UX-разрыв.

## Constitution check

- ✅ **I. Петля как ядро** — N/A. Конфиг применяется на петле,
  но overview сам по себе не петлевая сущность.
- ✅ **II. Атомарность** — каждое сохранение = один UPDATE
  на `pc_starter_configs`. Никаких составных мутаций.
- ✅ **III-b. Плоская навигация** — overview живёт под
  `/accounting/starter-setup` (та же entry-point что и
  campaign-level setup), не плодит новых top-level страниц.
- ✅ **IV. Данные-первичны** — состояние полностью в
  `pc_starter_configs`, page — линза.
- ✅ **V. Event sourcing** — N/A для config-таблицы (как и в
  spec-012). Применённые транзакции по-прежнему логируются
  через `autogen_*` columns.
- ✅ **VI. Читалка** — desktop-first (DM tool); mobile может
  reflow, но не цель.
- ✅ **VII. Каждый релиз играбелен** — page работает без
  нарушения существующего UX. Если её не открывать — всё как
  было.
- ✅ **VIII. Простота стека** — никакой новой инфры; чистый
  Next.js page + reused client components.
- ✅ **IX. Универсальность** — page работает для любой кампании
  (slug в URL), не хардкодит mat-ucheniya.
- ✅ **X. Конституция кампании** — N/A.

---

## Incremental Roadmap

Фича односессионная — Plan + Tasks + Implement = 1 чат при
скоупе MVP.

1. **MVP (P1)**: page (`/accounting/starter-setup` с табами или
   sibling URL — Q1 ответ), стопка 29 карточек, реюз editors,
   per-row save. US-1, US-2, US-3, US-4.
2. **Polish (P2, optional)**: density-pass — если карточная
   раскладка по факту слишком вертикальная, перевести в
   таблицу (Q2 → A). Нужно ли — увидим на mat-ucheniya реалии
   после MVP.
3. **Power (P3, optional)**: bulk helpers (Q5 → A). Не trivial,
   нужно clarify какие именно операции. Откладываем до запроса.

Если не понадобится — стоп после MVP.

---

## References

- `.specify/specs/012-loop-start-setup/spec.md` — fundament:
  таблицы, actions, reconcile-семантика, apply RPC.
- `mat-ucheniya/lib/starter-setup.ts` — `getPcStarterConfigsForCampaign`,
  `getPcStarterConfig`, types.
- `mat-ucheniya/app/actions/starter-setup.ts` — `updatePcStarterConfig`,
  `setPcTakesStartingLoan`, `applyLoopStartSetup`.
- `mat-ucheniya/components/pc-starter-config-block.tsx` —
  паттерн для PC-блока (DM/player/read-only режимы).
- `mat-ucheniya/components/starting-coin-picker-client.tsx`,
  `starting-items-editor-client.tsx`, `loan-flag-toggle-client.tsx`
  — reusable editors.
- `mat-ucheniya/app/c/[slug]/accounting/starter-setup/page.tsx`
  — текущая campaign-level страница, в которую/рядом с которой
  ляжет overview + apply-секция.
- `mat-ucheniya/components/loop-start-setup-banner.tsx` +
  `apply-starter-setup-button-client.tsx` — компоненты Phase 8
  spec-012, живущие сейчас на `/loops`. Кнопка переиспользуется
  на новой странице, баннер заменяется на info-line. Modal
  hand-touched (внутри button-client) реюзится без изменений.
- `.specify/memory/constitution.md` — v3.0.0.
