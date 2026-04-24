'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'

import {
  updateCampaignStarterConfig,
  updatePcStarterConfig,
} from '@/app/actions/starter-setup'
import type { StarterItem } from '@/lib/starter-setup'
import { validateStarterItems } from '@/lib/starter-setup-validation'

type Scope =
  | { kind: 'pc'; pcId: string }
  | { kind: 'campaign_stash'; campaignId: string }

type DraftItem = StarterItem & { key: number }

let idSeq = 0
function nextKey(): number {
  idSeq += 1
  return idSeq
}

/**
 * Spec-012 T032 — editable items list. Reused for per-PC starting
 * items and the campaign-level stash seed items. Draft state is a
 * keyed list so row identity survives through renames. Validation
 * via `validateStarterItems` before the action fires.
 */
export function StartingItemsEditorClient({
  scope,
  initialItems,
}: {
  scope: Scope
  initialItems: StarterItem[]
}) {
  const [items, setItems] = useState<DraftItem[]>(() =>
    initialItems.map((i) => ({ ...i, key: nextKey() })),
  )
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty = !itemsEqual(items, initialItems)

  function addRow() {
    setItems((prev) => [...prev, { name: '', qty: 1, key: nextKey() }])
    setSavedAt(null)
  }
  function removeRow(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key))
    setSavedAt(null)
  }
  function setName(key: number, name: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, name } : i)))
    setSavedAt(null)
  }
  function setQty(key: number, raw: string) {
    const n = raw === '' ? 1 : Number(raw)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty: n } : i)))
    setSavedAt(null)
  }

  async function save() {
    setError(null)
    const plain = items.map(({ name, qty }) => ({ name: name.trim(), qty }))
    const check = validateStarterItems(plain)
    if (!check.ok) {
      setError(check.error)
      return
    }

    let result
    if (scope.kind === 'pc') {
      result = await updatePcStarterConfig(scope.pcId, {
        startingItems: check.value,
      })
    } else {
      result = await updateCampaignStarterConfig(scope.campaignId, {
        stashSeedItems: check.value,
      })
    }

    if (!result.ok) {
      setError(result.error)
      return
    }
    // Normalize internal state to the validated/trimmed list so "Saved"
    // stays correct even if user had trailing whitespace.
    setItems(check.value.map((i) => ({ ...i, key: nextKey() })))
    setSavedAt(Date.now())
  }

  return (
    <div>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs italic text-gray-500">Список пуст</p>
        )}
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Название"
              value={item.name}
              onChange={(e) => setName(item.key, e.target.value)}
              disabled={pending}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-60"
            />
            <input
              type="number"
              min={1}
              step={1}
              value={item.qty}
              onChange={(e) => setQty(item.key, e.target.value)}
              disabled={pending}
              className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => removeRow(item.key)}
              disabled={pending}
              aria-label="Удалить"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={pending}
        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
      >
        <Plus size={12} strokeWidth={2} />
        Добавить предмет
      </button>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => startTransition(() => void save())}
          disabled={pending || !dirty}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {savedAt && !dirty && (
          <span className="text-xs text-gray-500">Сохранено</span>
        )}
        {error && (
          <span className="text-xs text-red-600" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

function itemsEqual(draft: DraftItem[], saved: StarterItem[]): boolean {
  if (draft.length !== saved.length) return false
  for (let i = 0; i < draft.length; i++) {
    if (draft[i].name.trim() !== saved[i].name || draft[i].qty !== saved[i].qty)
      return false
  }
  return true
}
