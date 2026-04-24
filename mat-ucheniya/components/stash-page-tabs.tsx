'use client'

import { useState, type ReactNode } from 'react'

type TabKey = 'items' | 'ledger'

type Props = {
  /** Number shown in the "Предметы" tab badge. */
  itemCount: number
  /** Content for the "Предметы" tab — typically `<InventoryGrid>`. */
  itemsContent: ReactNode
  /** Content for the "Лента транзакций" tab — typically a pinned `<LedgerList>`. */
  ledgerContent: ReactNode
  /**
   * Which tab to show first. Defaults to `items` — on the stash page
   * that's the primary value (the loot sitting in it), while the
   * ledger tab is secondary history.
   */
  defaultTab?: TabKey
}

/**
 * Two-tab container for the stash page — "Предметы" / "Лента
 * транзакций". Both tab bodies are rendered by the server; this
 * component only toggles which is visible, so the user doesn't pay
 * a roundtrip on tab switch.
 *
 * Rationale: the shipped stash page had a mini-recent-list duplicating
 * the ledger UI poorly. Moving it into a tab that literally is
 * `<LedgerList fixedActorNodeId={stash}>` gives filters + pagination +
 * the redesigned row for free.
 *
 * Tab state is local — deliberately not URL-synced. Switching tabs
 * shouldn't touch the `?pc=…&loop=…` params the ledger owns.
 */
export default function StashPageTabs({
  itemCount,
  itemsContent,
  ledgerContent,
  defaultTab = 'items',
}: Props) {
  const [tab, setTab] = useState<TabKey>(defaultTab)

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div
        role="tablist"
        aria-label="Содержимое общака"
        className="flex gap-0 border-b border-gray-200 px-3"
      >
        <TabButton active={tab === 'items'} onClick={() => setTab('items')}>
          Предметы
          {itemCount > 0 && (
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                tab === 'items' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {itemCount}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>
          Лента транзакций
        </TabButton>
      </div>

      {/* Both panels always mounted (for instant tab switch); hide the
          inactive one with CSS instead of unmounting — preserves the
          ledger's filter / pagination / scroll state. */}
      <div className="p-5">
        <div hidden={tab !== 'items'}>{itemsContent}</div>
        <div hidden={tab !== 'ledger'}>{ledgerContent}</div>
      </div>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      role="tab"
      type="button"
      onClick={onClick}
      aria-selected={active}
      className={`-mb-px inline-flex items-center border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}
