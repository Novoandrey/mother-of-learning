# Chat 77 — spec-019 starter-setup overview implement, 2026-04-27

## Контекст (откуда пришли)

Пользователь после chat 76 (spec-018 dnd.su scraper в проде) хотел
маленькую фичу до карты мира: «стартовые предметы и деньги на одном
экране для всех персонажей в Бухгалтерии». Spec-019 был
зарезервирован под карту мира; перенумеровали — карта едет на
spec-020, новая фича стала spec-019.

В середине Clarify пользователь расширил скоуп: «и кнопку Применить
тоже сюда же перенести». Это потянуло за собой перенос баннера с
`/loops`.

В середине Implement пользователь попросил добавить вторую похожую
страницу — для текущих holdings (баланс + инвентарь + история per-PC
под катом). Это уехало в spec-020 (карта мира → spec-021).

## Что сделано

### spec-019 — Specify → Clarify → Plan → Tasks → Implement (всё за один чат)

- **Specify**: spec.md (424 строки). Goals/Non-goals/User scenarios,
  18 FR, 6 SC, 7 Q&A в Clarifications.
- **Clarify**: все вопросы залочены defaults: tabs (а не sibling URL),
  cards (а не table), per-editor save, loan flag interactive, no bulk,
  lazy fallback rows, /loops banner replaced by info-line.
- **Plan**: plan.md (491 строка). Чисто UI-слой, миграций 0.
- **Tasks**: 10 тасков, 4 параллельных в Batch 1.
- **Implement** (T001-T007):
  - `lib/starter-setup.ts` — добавлен `getCampaignLoopSetupStatuses` +
    тип `LoopSetupStatusEntry`. Lazy import `getLoops` чтобы избежать
    потенциального цикла.
  - `components/starter-setup-tabs.tsx` (новый, 97 строк) —
    калька `<StashPageTabs>`, default tab = `campaign`.
  - `components/pc-starter-overview-list.tsx` (новый, 75 строк) —
    стопка `<PcStarterConfigBlock mode="dm">` × N, RU-collation
    sort, empty state, link на `/catalog/[pcId]`.
  - `components/starter-setup-apply-section.tsx` (новый, 140 строк) —
    primary apply row + optional `<UnappliedBacklog>`. Реюзит
    `<ApplyStarterSetupButtonClient>` без правок. Self-gates на
    `isDM` prop.
  - `app/c/[slug]/accounting/starter-setup/page.tsx` (переписан) —
    apply section сверху, tabs снизу. Извлечён internal helper
    `<CampaignSetupCards>` с тремя карточками campaign-level
    (loan + stash coins + stash items).
  - `app/c/[slug]/loops/page.tsx` (модифицирован) — убран
    `<LoopStartSetupBanner>`, добавлена DM-only inline info-line
    «Стартовый сетап настраивается и применяется в Бухгалтерии»
    с link'ом.
  - `components/loop-start-setup-banner.tsx` — удалён (no remaining
    consumers, проверено grep'ом).
- **Lint+build**: не запустил локально, FS-issues с node_modules
  в Claude env (rm -rf не справляется). Юзер проверил на Vercel —
  всё компилится и работает.

### spec-019 в action

DM в mat-ucheniya теперь открывает одну страницу
`/accounting/starter-setup`, видит:
- Сверху: статус применения current loop + кнопка Apply.
- Внизу таб «Кампания» (default): три старые карточки.
- Таб «Персонажи»: 29 карточек с loan flag + coins + items
  редакторами.

## Миграции

Никаких. Spec-019 — чистый UI-слой над существующей spec-012
инфраструктурой.

## Коммиты

- `aba8a5b` `spec-019: starter-setup overview + apply on the same page (untested)` — основной commit (10 файлов, +1548/-118).

## Действия пользователю (после чата)

- [x] задеплоить (авто через main → Vercel)
- [x] проверить smoke walkthrough (юзер подтвердил «всё ок»)
- [ ] T044 spec-012 manual walkthrough — давний хвост, не блокер
- [ ] T038/T039 spec-014 manual walkthroughs — давний хвост, не
      блокер

## Что помнить следующему чату

- **spec-019 в проде, version 0.7.1**.
- **spec-020 «PC Holdings Overview»** — следующая, юзер
  подтвердил в этом чате. Тоже DM-tool на `/accounting`,
  тоже cards-stack по PC, но показывает **текущее** состояние
  (баланс + инвентарь + collapsed транзакции). Реюз
  `<WalletBlock>`, `<InventoryGrid>`, мб `<LedgerList>`.
  0 миграций ожидается.
- **Карта мира уехала на spec-021** (была spec-020). Перенумерация
  делается в backlog'е.
- **Spec-019 хвостов нет**. Density-pass на табличный layout
  отложен в P2 / spec-019.1 если 29 cards окажется узким местом.
- **spec-012 хвост**: T044 manual walkthrough — старый,
  не блокер.
- В spec-019 dynamic import `getLoops` внутри
  `getCampaignLoopSetupStatuses` сделан ради избежания цикла.
  Цикла нет (`lib/loops.ts` не импортит starter-setup), можно
  потом заменить на статический. Не критично.
