import { getPcStarterConfig } from '@/lib/starter-setup'
import { LoanFlagToggleClient } from './loan-flag-toggle-client'
import { StartingCoinPickerClient } from './starting-coin-picker-client'
import { StartingItemsEditorClient } from './starting-items-editor-client'

export type PcStarterConfigBlockMode = 'dm' | 'player' | 'read-only'

/**
 * Spec-012 T029 — PC starter config surface on the catalog page.
 *
 * Three render modes selected by the parent (catalog page) based on
 * membership role + PC ownership:
 *   * `dm` — full editor: loan flag (interactive) + starting coins +
 *     starting items (both with Save).
 *   * `player` — the PC's owner: interactive loan flag only, starting
 *     coins + items shown as read-only summary. Mirrors the spec's
 *     "player controls narrative, DM controls economy" split.
 *   * `read-only` — the block is hidden entirely (returns null).
 *     Other players viewing someone else's PC shouldn't see it.
 *
 * Data loaded fresh on every render — no cache. There's exactly one
 * row per PC, so the query is cheap; the block is only rendered on
 * detail pages, not in lists.
 */
export async function PcStarterConfigBlock({
  pcId,
  mode,
}: {
  pcId: string
  mode: PcStarterConfigBlockMode
}) {
  if (mode === 'read-only') return null

  const cfg = await getPcStarterConfig(pcId)
  // Defensive defaults — migration 037 seeded a row for every existing
  // character; T024 covers new characters. A null here means something
  // went wrong upstream — render sensible blanks rather than crash.
  const loanFlag = cfg?.takesStartingLoan ?? true
  const coins = cfg?.startingCoins ?? { cp: 0, sp: 0, gp: 0, pp: 0 }
  const items = cfg?.startingItems ?? []

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Стартовый сетап
      </h2>

      <div className="space-y-5">
        {/* Loan flag — interactive in both DM and player modes */}
        <div>
          <LoanFlagToggleClient
            pcId={pcId}
            initialValue={loanFlag}
            interactive={true}
          />
          <p className="mt-1 text-xs text-gray-500">
            Если включено — при применении стартового сетапа персонаж
            получает кредит по умолчанию кампании.
          </p>
        </div>

        {/* Coins + items — full editors only in DM mode */}
        {mode === 'dm' ? (
          <>
            <div>
              <h3 className="mb-2 text-xs font-medium text-gray-600">
                Стартовые монеты
              </h3>
              <StartingCoinPickerClient
                scope={{ kind: 'pc', pcId }}
                initialCoins={coins}
              />
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium text-gray-600">
                Стартовые предметы
              </h3>
              <StartingItemsEditorClient
                scope={{ kind: 'pc', pcId }}
                initialItems={items}
              />
            </div>
          </>
        ) : (
          // Player mode — show the DM-set values as a read-only summary.
          <>
            <ReadOnlyCoins coins={coins} />
            <ReadOnlyItems items={items} />
          </>
        )}
      </div>
    </section>
  )
}

function ReadOnlyCoins({ coins }: { coins: { cp: number; sp: number; gp: number; pp: number } }) {
  const parts: string[] = []
  if (coins.pp) parts.push(`${coins.pp} pp`)
  if (coins.gp) parts.push(`${coins.gp} gp`)
  if (coins.sp) parts.push(`${coins.sp} sp`)
  if (coins.cp) parts.push(`${coins.cp} cp`)

  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-gray-600">
        Стартовые монеты
      </h3>
      <p className="text-sm text-gray-800">
        {parts.length === 0 ? (
          <span className="italic text-gray-400">нет</span>
        ) : (
          parts.join(' · ')
        )}
      </p>
    </div>
  )
}

function ReadOnlyItems({
  items,
}: {
  items: Array<{ name: string; qty: number }>
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-gray-600">
        Стартовые предметы
      </h3>
      {items.length === 0 ? (
        <p className="text-sm italic text-gray-400">нет</p>
      ) : (
        <ul className="text-sm text-gray-800 space-y-0.5">
          {items.map((i, idx) => (
            <li key={`${i.name}:${idx}`}>
              <span>{i.name}</span>
              {i.qty > 1 && (
                <span className="ml-1 text-gray-500">× {i.qty}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
