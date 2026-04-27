'use client'

import { useState, type ReactNode } from 'react'

type TabKey = 'campaign' | 'pcs'

type Props = {
  /** Server-rendered content for the «Кампания» tab — campaign-level
   *  cards (loan amount, stash seed coins, stash seed items). */
  campaignContent: ReactNode
  /** Server-rendered content for the «Персонажи» tab — stack of
   *  per-PC starter-config cards. */
  pcsContent: ReactNode
  /** Number shown in the «Персонажи» tab badge. */
  pcCount: number
  /**
   * Which tab to show first. Defaults to `campaign` — on the starter
   * setup page that's the historical default; DM привычно открывает
   * страницу и видит campaign-level настройки.
   */
  defaultTab?: TabKey
}

/**
 * Spec-019 T002 — two-tab container for `/accounting/starter-setup`.
 *
 * Both tab bodies are rendered by the server; this component only
 * toggles which is visible, so tab switching costs no roundtrip.
 *
 * Tab state is local — deliberately NOT URL-synced (matches
 * `<StashPageTabs>` from spec-011). Adding `?tab=pcs` is a future
 * polish if deep-linking to a tab becomes a real need.
 */
export default function StarterSetupTabs({
  campaignContent,
  pcsContent,
  pcCount,
  defaultTab = 'campaign',
}: Props) {
  const [tab, setTab] = useState<TabKey>(defaultTab)

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div
        role="tablist"
        aria-label="Стартовый сетап"
        className="flex gap-0 border-b border-gray-200 px-3"
      >
        <TabButton
          active={tab === 'campaign'}
          onClick={() => setTab('campaign')}
        >
          Кампания
        </TabButton>
        <TabButton active={tab === 'pcs'} onClick={() => setTab('pcs')}>
          Персонажи
          {pcCount > 0 && (
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                tab === 'pcs'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {pcCount}
            </span>
          )}
        </TabButton>
      </div>

      {/* Both panels always mounted (for instant tab switch); hide the
          inactive one with CSS instead of unmounting — preserves form
          state for the editors inside (e.g. half-typed coin amount). */}
      <div className="p-5">
        <div hidden={tab !== 'campaign'}>{campaignContent}</div>
        <div hidden={tab !== 'pcs'}>{pcsContent}</div>
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
