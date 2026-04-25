'use client'

import { Sparkles } from 'lucide-react'

import type { WizardKey } from '@/lib/starter-setup'

const WIZARD_LABEL: Record<WizardKey, string> = {
  starting_money: 'Стартовые деньги',
  starting_loan: 'Стартовый кредит',
  stash_seed: 'Общак',
  starting_items: 'Стартовые предметы',
}

/**
 * Spec-012 T036 — tiny inline badge marking a ledger row as autogen-
 * produced. Visual: a ⚙-like sparkles icon; hover / long-press surfaces
 * the wizard label + source title via the native `title` attribute —
 * no extra tooltip library, no layout impact.
 *
 * Deliberately tiny (11×11 icon + 1px ring) so the row height is
 * unchanged when the badge is added next to the day chip.
 */
export function AutogenBadgeClient({
  wizardKey,
  sourceTitle,
}: {
  wizardKey: WizardKey
  sourceTitle: string
}) {
  // Empty `sourceTitle` happens for appended pages (the server map only
  // covers the first page). Keep the tooltip clean — drop the separator
  // and the empty tail rather than rendering "Стартовые деньги · ".
  const tip = sourceTitle
    ? `${WIZARD_LABEL[wizardKey]} · ${sourceTitle}`
    : WIZARD_LABEL[wizardKey]
  return (
    <span
      title={tip}
      aria-label={tip}
      role="img"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-blue-600"
    >
      <Sparkles size={11} strokeWidth={1.5} />
    </span>
  )
}
