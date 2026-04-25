'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Props = {
  approved: number
  rejected: number
  campaignSlug: string
}

/**
 * Spec-014 T032 — one-shot notice rendered on /accounting for the
 * player after the DM has acted on their batches.
 *
 * The page server-side resolves whether to show this (and which
 * counts) via `getRecentDMActionSummary` + `markDMActionsSeen`.
 * If the page mounts the component, it WILL show — local UI state
 * lets the player dismiss; remount on the next visit happens only
 * if there are NEWER actions because the cutoff already advanced.
 *
 * Auto-dismiss after 8s so the player isn't stuck with a permanent
 * banner if they ignore it. Manual close button too.
 */
export default function DMActionToast({
  approved,
  rejected,
  campaignSlug,
}: Props) {
  const [visible, setVisible] = useState(true)

  // Auto-dismiss after 8s.
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null
  if (approved === 0 && rejected === 0) return null

  const parts: string[] = []
  if (approved > 0) parts.push(`одобрил ${approved}`)
  if (rejected > 0) parts.push(`отклонил ${rejected}`)
  const summary = parts.join(' · ')

  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 shadow-sm">
      <span className="text-base">📨</span>
      <span className="flex-1">
        Мастер {summary} из ваших заявок.
      </span>
      <Link
        href={`/c/${campaignSlug}/accounting/queue`}
        className="rounded border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
      >
        Открыть очередь →
      </Link>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Скрыть"
        className="rounded p-1 text-blue-700 hover:bg-blue-100"
      >
        ✕
      </button>
    </div>
  )
}
