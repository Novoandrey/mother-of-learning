# Implementation Plan: Starter Setup Overview

**Spec**: `.specify/specs/019-starter-setup-overview/spec.md`
**Created**: 2026-04-27
**Status**: Draft
**Estimated effort**: ~3–4 часа. **Миграций 0.** Один новый
read-query, три новых UI-компонента (один client, два server),
переписана одна page, заменён один баннер на info-line. Ноль
изменений в server actions / RPC / pure helpers spec-012.

---

## Architecture overview

Spec-019 — чистый UI-слой. Вся бизнес-логика уже шипанута в
spec-012:

- `getPcStarterConfigsForCampaign(campaignId)` отдаёт **все**
  per-PC configs одним запросом — основа для PC-overview.
- `updatePcStarterConfig` / `setPcTakesStartingLoan` — write
  surface; реюзим как есть.
- `applyLoopStartSetup` + `<ApplyStarterSetupButtonClient>` +
  `<ApplyConfirmDialog>` — apply pipeline; реюзим как есть.
- `<PcStarterConfigBlock>` (DM-mode) уже умеет ровно то, что
  нужно показать на каждой PC-карточке overview. Переиспользуем
  компонент целиком, не разбираем на части.
- `<StashPageTabs>` (spec-011) — паттерн локального tab state без
  URL-sync. Скопируем структуру для нашего двухтабового
  контейнера.

Что новое:

1. **Один read-query** в `lib/starter-setup.ts`:
   `getCampaignLoopSetupStatuses(campaignId)` — возвращает
   массив `{ loopId, loopNumber, hasAutogenRows }` для всех
   петель кампании. Под капотом — `getLoops` + одна batched
   IN-выборка по `transactions.autogen_source_node_id`.
2. **`<StarterSetupTabs>`** — client wrapper «Кампания /
   Персонажи», калька `<StashPageTabs>`. Default tab —
   `campaign` (не ломаем привычку DM'а).
3. **`<StarterSetupApplySection>`** — server component сверху
   страницы. Читает `getCampaignLoopSetupStatuses` + `getCurrentLoop`,
   рендерит current loop status + (если есть) список unapplied
   past loops. Внутри — `<ApplyStarterSetupButtonClient>` без
   изменений.
4. **`<PcStarterOverviewList>`** — server component, мапит
   `<PcStarterConfigBlock pcId={pc.id} mode="dm" />` × N с
   сортировкой по title.
5. **Переписан** `app/c/[slug]/accounting/starter-setup/page.tsx`
   — собирает все три компонента в новой раскладке (apply сверху,
   tabs ниже).
6. **Заменён** `<LoopStartSetupBanner>` на /loops на минимальную
   info-line с link'ом. Старый файл удаляем (или перепрофилируем
   в `<StarterSetupRedirectNote>` — см. § «File operations»).

Что **не** трогаем:

- `lib/starter-setup-resolver.ts` / `lib/starter-setup-diff.ts` /
  `lib/starter-setup-affected.ts` / `lib/starter-setup-validation.ts`
  — pure helpers, чистого UI feature не касаются.
- RPC `apply_loop_start_setup`, триггеры spec-012, RLS — N/A.
- `<PcStarterConfigBlock>`, `<StartingCoinPickerClient>`,
  `<StartingItemsEditorClient>`, `<LoanFlagToggleClient>` —
  реюзим без правок.

---

## Read layer — `lib/starter-setup.ts`

Один новый экспорт:

```ts
export type LoopSetupStatusEntry = {
  loopId: string
  loopNumber: number
  /** True iff there's at least one spec-012 autogen tx with
   *  autogen_source_node_id = loopId. */
  hasAutogenRows: boolean
}

/**
 * Per-loop setup status for an entire campaign — feeds the
 * spec-019 apply section. One IN-query covers all loops; expect
 * < 5 ms even on 50-loop campaigns.
 */
export async function getCampaignLoopSetupStatuses(
  campaignId: string,
): Promise<LoopSetupStatusEntry[]> {
  const loops = await getLoops(campaignId) // existing
  if (loops.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('autogen_source_node_id')
    .in('autogen_source_node_id', loops.map((l) => l.id))
    .in('autogen_wizard_key', SPEC_012_WIZARD_KEYS)

  if (error) {
    throw new Error(`getCampaignLoopSetupStatuses failed: ${error.message}`)
  }

  const appliedIds = new Set((data ?? []).map((r) => r.autogen_source_node_id as string))
  return loops.map((l) => ({
    loopId: l.id,
    loopNumber: l.number,
    hasAutogenRows: appliedIds.has(l.id),
  }))
}
```

`SPEC_012_WIZARD_KEYS` уже экспортируется из starter-setup.ts (используется в
существующем `getLoopSetupStatus`). Запрос полностью симметричен
существующему single-loop варианту, просто IN на массив.

**Что не делаем**: дату применения (`appliedAt`) пока не достаём.
В spec.md FR-014 предусматривает текст «✓ Применено в день D»,
но MVP может стартовать без даты — статус «применено / не
применено» уже даёт всё ради чего перенос делается. Дату — в
`SC-3 polish-pass`, если будет нужно (отдельная feature).

---

## UI components

### `<StarterSetupApplySection>` (server)

Файл: `mat-ucheniya/components/starter-setup-apply-section.tsx`.

```tsx
type Props = {
  campaignId: string
  campaignSlug: string
  isDM: boolean
}

export async function StarterSetupApplySection(props: Props) {
  if (!props.isDM) return null

  const [statuses, current] = await Promise.all([
    getCampaignLoopSetupStatuses(props.campaignId),
    getCurrentLoop(props.campaignId),
  ])

  // Edge case: no loops at all
  if (statuses.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">
          В кампании пока нет петель.{' '}
          <Link href={`/c/${props.campaignSlug}/loops`} className="underline">
            Создайте петлю
          </Link>
          , чтобы применить стартовый сетап.
        </p>
      </section>
    )
  }

  // Primary row: current loop (or latest if no `current`)
  const primary =
    statuses.find((s) => s.loopId === current?.id) ??
    statuses[statuses.length - 1]
  const otherUnapplied = statuses.filter(
    (s) => s.loopId !== primary.loopId && !s.hasAutogenRows,
  )

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <PrimaryApplyRow status={primary} />
      {otherUnapplied.length > 0 && <UnappliedBacklog rows={otherUnapplied} />}
    </section>
  )
}
```

Вспомогательные подкомпоненты в том же файле:

- `<PrimaryApplyRow>` — отображает «Петля N · ✓ Применено» или
  «Петля N · Не применено» + `<ApplyStarterSetupButtonClient>`.
  При applied — secondary-link «Применить заново» (тот же button-client,
  он уже умеет confirm-flow для re-apply).
- `<UnappliedBacklog>` — `<ul>` с per-row apply-кнопками для
  старых неприменённых петель. Compact-стиль, без заголовка.

**Без новых хуков, без useState** — server component, никакой
client state. `<ApplyStarterSetupButtonClient>` остаётся
единственным client island.

### `<StarterSetupTabs>` (client)

Файл: `mat-ucheniya/components/starter-setup-tabs.tsx`.

Калька `<StashPageTabs>`:

```tsx
type TabKey = 'campaign' | 'pcs'

type Props = {
  campaignContent: ReactNode
  pcsContent: ReactNode
  defaultTab?: TabKey
  /** Number shown in the «Персонажи» tab badge. */
  pcCount: number
}
```

- Local state, не URL-synced (consistent со stash tabs).
- Default tab = `campaign` (Q1 resolution).
- Both panels mounted, hidden via CSS — стандартный паттерн.
- Бэдж `pcCount` на табе «Персонажи» — глазная подсказка
  «сколько персонажей под рукой».

### `<PcStarterOverviewList>` (server)

Файл: `mat-ucheniya/components/pc-starter-overview-list.tsx`.

```tsx
export async function PcStarterOverviewList({ campaignId }: { campaignId: string }) {
  // Reuses existing query that returns configs joined with PC titles.
  const configs = await getPcStarterConfigsForCampaign(campaignId)

  if (configs.length === 0) {
    return <EmptyState />
  }

  // Sort by PC title alphabetically (RU collation)
  const sorted = [...configs].sort((a, b) => a.pcTitle.localeCompare(b.pcTitle, 'ru'))

  return (
    <div className="space-y-4">
      {sorted.map((cfg) => (
        <article key={cfg.pcId} className="rounded-lg border border-gray-200 bg-white p-4">
          <header className="mb-3 flex items-baseline justify-between">
            <h3 className="text-base font-semibold text-gray-900">{cfg.pcTitle}</h3>
            <Link
              href={`/c/.../catalog/${cfg.pcId}`}
              className="text-xs text-gray-500 hover:underline"
            >
              Открыть страницу персонажа →
            </Link>
          </header>
          <PcStarterConfigBlock pcId={cfg.pcId} mode="dm" />
        </article>
      ))}
    </div>
  )
}
```

Один важный момент: `<PcStarterConfigBlock>` сейчас **сам** вызывает
`getPcStarterConfig(pcId)` внутри — то есть на overview мы получим
N+1 query (один на PC). Надо ли оптимизировать?

**Решение MVP — НЕ оптимизировать**:

- Каждый запрос — single-row PK lookup, < 1 ms.
- 29 PC × 1 ms = ~30 ms роздум — незаметно для DM.
- Альтернатива (передавать prefetched config через prop) требует
  изменения сигнатуры `<PcStarterConfigBlock>` — нарушает
  G-3 (нулевая дубляция). Если потом окажется bottleneck —
  refactor отдельным PR.

Если вдруг N окажется большим (50+ PC) — добавить в
`<PcStarterConfigBlock>` опциональный prop
`prefetchedConfig?: PcStarterConfig` и в overview делать один
batch fetch + pass-through. Backward-compat: prop optional.

### Page structure

`app/c/[slug]/accounting/starter-setup/page.tsx` переписывается
вокруг новой раскладки:

```tsx
export default async function CampaignStarterSetupPage({ params }) {
  const { slug } = await params

  await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')
  if (membership.role !== 'dm' && membership.role !== 'owner') {
    redirect(`/c/${slug}/accounting`)
  }

  const [cfg, pcCount] = await Promise.all([
    getCampaignStarterConfig(campaign.id),
    countPCs(campaign.id), // existing or trivial
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Breadcrumb slug={slug} />
      <Header />

      {/* NEW: apply section above the tabs */}
      <StarterSetupApplySection
        campaignId={campaign.id}
        campaignSlug={slug}
        isDM
      />

      {/* NEW: tabs replacing the flat 3-card layout */}
      <StarterSetupTabs
        defaultTab="campaign"
        pcCount={pcCount}
        campaignContent={
          <CampaignSetupCards cfg={cfg} campaignId={campaign.id} />
        }
        pcsContent={<PcStarterOverviewList campaignId={campaign.id} />}
      />
    </div>
  )
}
```

`<CampaignSetupCards>` — извлечённый кусок текущей page (три
карточки). Локальный component в том же файле — не делаем
public surface.

### `/loops` page — заменить banner на info-line

`app/c/[slug]/loops/page.tsx`:

- Убрать импорт + рендер `<LoopStartSetupBanner>`.
- В том же месте рендерить новый минимальный
  `<StarterSetupRedirectNote>` (DM-only, всегда видим, без
  status-check'ов):

```tsx
{isDM && (
  <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
    Стартовый сетап настраивается и применяется в{' '}
    <Link href={`/c/${slug}/accounting/starter-setup`} className="text-blue-600 hover:underline">
      Бухгалтерии
    </Link>
    .
  </p>
)}
```

Информационная нота — не «alert»-стиль, но и не невидимая.
Любой DM, ходивший на /loops apply-кнопкой, кликает, попадает.

---

## File operations

### New files (3)

- `mat-ucheniya/components/starter-setup-apply-section.tsx`
- `mat-ucheniya/components/starter-setup-tabs.tsx`
- `mat-ucheniya/components/pc-starter-overview-list.tsx`

### Modified files (3)

- `mat-ucheniya/lib/starter-setup.ts` — добавить
  `getCampaignLoopSetupStatuses` + `LoopSetupStatusEntry` type.
- `mat-ucheniya/app/c/[slug]/accounting/starter-setup/page.tsx`
  — переписать раскладку (apply section + tabs).
- `mat-ucheniya/app/c/[slug]/loops/page.tsx` — заменить
  `<LoopStartSetupBanner>` на inline note.

### Removed files (1)

- `mat-ucheniya/components/loop-start-setup-banner.tsx` — после
  снятия с /loops у компонента нет других consumer'ов
  (проверить grep'ом перед удалением). Удаляем целиком.

`<ApplyStarterSetupButtonClient>` и `<ApplyConfirmDialog>`
**остаются** — теперь импортируются из
`<StarterSetupApplySection>`.

---

## Test strategy

Spec-019 — чистый UI, серверная логика не меняется. Тесты
делятся на:

1. **Pure helper tests** — нет новых pure helpers. Skip.
2. **Read-query smoke** — мини-тест на `getCampaignLoopSetupStatuses`,
   что возвращает корректный shape для empty / partial / full
   кампаний. Можно опустить, если интеграционный smoke ниже
   достаточен.
3. **Manual smoke (DM walkthrough)**:
   - Логин DM → `/c/mat-ucheniya/accounting/starter-setup`.
   - Apply section: видна current loop, статус правильный.
   - Tabs: переключение «Кампания / Персонажи», состояние
     сохраняется (CSS-only).
   - В таб «Персонажи»: 29 карточек, сортировка по title.
   - Edit coins на одной карточке → save → перезагрузка → видны.
   - Edit на странице PC `/catalog/[pcId]` → возврат на overview
     → видны (один источник истины).
   - Toggle «берёт кредит» на одной карточке → save → перезагрузка
     → видны.
   - Apply current loop → modal hand-touched (если есть) →
     confirm → check ledger.
   - Re-apply → modal с правильными affected rows.
   - Открыть `/loops` под DM → видна info-line, нет старого
     баннера. Клик → попадает на overview.
   - Login player → попытка прямого URL `.../starter-setup` →
     redirect на `/accounting`.

Нет vitest для UI в проекте (codebase pattern — только pure
helpers). Не вводим новый паттерн.

---

## Tasks ordering (для `tasks.md`)

Drafting outline; финализирую в `/tasks` фазе.

1. **T001**: Read-query — `getCampaignLoopSetupStatuses` +
   `LoopSetupStatusEntry` type в `lib/starter-setup.ts`.
2. **T002**: `<StarterSetupTabs>` client component (калька
   stash tabs).
3. **T003**: `<PcStarterOverviewList>` server component +
   empty state.
4. **T004**: `<StarterSetupApplySection>` server component +
   sub-components (PrimaryApplyRow, UnappliedBacklog).
5. **T005**: Rewrite `app/c/[slug]/accounting/starter-setup/page.tsx`
   — apply section + tabs композиция.
6. **T006**: Replace banner on `/loops` — inline note.
7. **T007**: Delete `loop-start-setup-banner.tsx` (после grep'а).
8. **T008**: Smoke walkthrough (manual, DM-роль).
9. **T009**: Lint + next build clean.

~~9 tasks~~. Плюс T010 для NEXT.md/backlog/chatlog в конце сессии.

---

## Out of scope (re-asserted)

- ❌ Bulk operations (Q5 → NO).
- ❌ Density-pass на табличный вид (Q2 → cards in MVP).
- ❌ Mobile-optimized layout (DM-tool, desktop-first).
- ❌ Audit-log changes к pc_starter_configs (как в spec-012,
  не логируем).
- ❌ `appliedAt` дата на applied loops (бинарный статус
  достаточен в MVP).
- ❌ Prefetch optimization для N+1 query в overview (отложено
  до bottleneck'а).
- ❌ URL-sync для tab state (паттерн codebase'а — local state).

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| N+1 query в `<PcStarterConfigBlock>` (29 single-PK lookups) | Single-PK, < 1 ms каждый, ~30 ms total — приемлемо. Optimization путь обозначен (prop `prefetchedConfig?:`). |
| `<LoopStartSetupBanner>` мог иметь скрытых consumer'ов | T007 grep по проекту; удаляем только если ноль использований. |
| Apply из нового места → сторонние revalidatePath'ы могут не сработать | Action `applyLoopStartSetup` уже делает `revalidatePath` для всех нужных surfaces (`/loops`, `/accounting`) — независимо от entry-point'а. Verify в smoke. |
| DM не заметит, что баннер на /loops стал info-line, и потеряет навык | US-5 + SC-6 покрывают: текст явно говорит куда идти. |

---

## Constitution check (re-verified post-plan)

Все 10 принципов прошли в spec.md без изменений. Ничего нового
в plan не появилось, что бы их нарушало:

- ✅ Миграций 0 (II, IV).
- ✅ Реюз компонентов (VIII).
- ✅ Source of truth для apply единый — `/accounting/starter-setup`
  (II, IV).
- ✅ Никакой client state, кроме tabs (VI: читалка).
- ✅ Server-rendered data; force-dynamic (IV).

---

## References

- `.specify/specs/019-starter-setup-overview/spec.md` — самим
  spec'ом.
- `.specify/specs/012-loop-start-setup/spec.md` + plan.md —
  fundament для apply pipeline.
- `.specify/specs/011-common-stash/plan.md` — паттерн tabs
  (stash tabs).
- `mat-ucheniya/components/stash-page-tabs.tsx` — referenced
  template.
- `mat-ucheniya/components/loop-start-setup-banner.tsx` —
  замещаемый компонент.
- `mat-ucheniya/components/apply-starter-setup-button-client.tsx`
  + `apply-confirm-dialog.tsx` — реюзим без правок.
- `mat-ucheniya/components/pc-starter-config-block.tsx` —
  реюзим без правок.
- `mat-ucheniya/lib/starter-setup.ts` — добавляем один query.
