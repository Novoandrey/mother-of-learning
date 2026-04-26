'use client'

import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { GroupBy } from '@/lib/items-types'

export type InventoryTabLoop = {
  number: number
  title: string
  isCurrent: boolean
}

type Props = {
  loops: InventoryTabLoop[]
  loopNumber: number
  dayInLoop: number
  groupBy: GroupBy | null
}

export const INVENTORY_GROUP_OPTIONS: ReadonlyArray<{
  value: GroupBy | ''
  label: string
}> = [
  { value: '', label: 'Без группировки' },
  { value: 'category', label: 'По категории' },
  { value: 'rarity', label: 'По редкости' },
  { value: 'slot', label: 'По слоту' },
  { value: 'priceBand', label: 'По цене' },
  { value: 'source', label: 'По источнику' },
  { value: 'availability', label: 'По доступности' },
]

/**
 * Inventory-tab interactive controls — spec-015 (T027).
 *
 * URL-driven state for `loop`, `day`, `group`. The parent server
 * component reads these from the request and passes them in;
 * the controls write back via `router.replace` to keep the
 * back-stack uncluttered (sliders should not push history).
 *
 * Day input is a simple `<input type=number>` — same pattern as
 * `<TransactionForm>`'s day inline input. Defers to onBlur for the
 * URL update so each keystroke doesn't fire a navigation.
 */
export default function InventoryTabControls({
  loops,
  loopNumber,
  dayInLoop,
  groupBy,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [dayDraft, setDayDraft] = useState<string>(String(dayInLoop))

  const updateUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const onLoopChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(e.target.value)
    if (!Number.isFinite(next)) return
    // Switching loops resets day to 30 (end-of-loop view), so users
    // see the full loop's accumulated inventory on first glance.
    updateUrl({ loop: String(next), day: '30' })
    setDayDraft('30')
  }

  const commitDay = () => {
    const n = Number(dayDraft)
    const clamped = Number.isFinite(n) ? Math.max(1, Math.min(30, Math.trunc(n))) : 1
    setDayDraft(String(clamped))
    if (clamped !== dayInLoop) updateUrl({ day: String(clamped) })
  }

  const onGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    updateUrl({ group: v === '' ? null : v })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-gray-500">Петля</span>
        <select
          value={loopNumber}
          onChange={onLoopChange}
          className="rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        >
          {loops.map((l) => (
            <option key={l.number} value={l.number}>
              №{l.number}
              {l.title ? ` · ${l.title}` : ''}
              {l.isCurrent ? ' · текущая' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-gray-500">День</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="30"
          value={dayDraft}
          onChange={(e) => setDayDraft(e.target.value)}
          onBlur={commitDay}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-gray-500">Группировка</span>
        <select
          value={groupBy ?? ''}
          onChange={onGroupChange}
          className="rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        >
          {INVENTORY_GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <span
        className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
        aria-label="Текущий срез"
      >
        Срез: петля №{loopNumber} · день {dayInLoop}
      </span>
    </div>
  )
}
