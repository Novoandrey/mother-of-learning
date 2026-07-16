'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSchemaItem } from '@/app/actions/craft'
import { schemaRarityForTarget } from '@/lib/craft'
import { RARITY_LABELS } from '@/lib/items-grouping'
import {
  listSchemaCandidatesTg,
  type SchemaCandidateTg,
} from '@/lib/queries/craft-tg'
import { FIELD, Sheet } from './primitives'

/**
 * Adds a permanent, linked craft schema from any catalog item. Unlike
 * disassembly, this only records knowledge: the source item is untouched.
 */
export function KnownSchemaSheet({
  supabase,
  campaignId,
  knownTargetIds,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  knownTargetIds: string[]
  onClose: () => void
  onDone: (itemName: string) => void
}) {
  const [items, setItems] = useState<SchemaCandidateTg[] | null>(null)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const knownIds = useMemo(() => new Set(knownTargetIds), [knownTargetIds])
  const normalizedQuery = query.trim().toLocaleLowerCase('ru')
  const shownItems = (items ?? []).filter((item) =>
    item.name.toLocaleLowerCase('ru').includes(normalizedQuery),
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const candidates = await listSchemaCandidatesTg(supabase, campaignId)
        if (alive) setItems(candidates)
      } catch {
        if (alive) {
          setItems([])
          setError('Не удалось загрузить каталог предметов.')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId])

  const addSchema = async (item: SchemaCandidateTg) => {
    if (knownIds.has(item.id) || busyId) return
    setError(null)
    setBusyId(item.id)
    const res = await createSchemaItem({
      campaignId,
      name: `Схема: ${item.name}`,
      targetItemNodeId: item.id,
      rarity: schemaRarityForTarget(item.rarity),
    })
    setBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(item.name)
    onClose()
  }

  return (
    <Sheet title="Добавить известную схему" onClose={onClose}>
      <p className="mb-3 text-xs text-neutral-500">
        Выбери предмет из каталога. Он останется на месте — будет добавлена только схема
        для крафта.
      </p>
      <input
        className={FIELD}
        placeholder="Найти предмет…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-3 space-y-1">
        {items === null && <p className="py-4 text-sm text-neutral-500">Загрузка…</p>}
        {items !== null && shownItems.length === 0 && (
          <p className="py-4 text-sm text-neutral-500">Подходящих предметов нет.</p>
        )}
        {shownItems.map((item) => {
          const alreadyKnown = knownIds.has(item.id)
          const isBusy = busyId === item.id
          const schemaRarity = schemaRarityForTarget(item.rarity)
          return (
            <button
              key={item.id}
              onClick={() => void addSchema(item)}
              disabled={alreadyKnown || busyId !== null}
              className="flex w-full items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800 disabled:cursor-default disabled:opacity-55"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{item.name}</span>
              <span className="shrink-0 text-right text-xs text-neutral-500">
                {isBusy
                  ? 'Добавляю…'
                  : alreadyKnown
                    ? 'уже известна'
                    : schemaRarity
                      ? `схема: ${RARITY_LABELS[schemaRarity] ?? schemaRarity}`
                      : 'кастомная схема'}
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </Sheet>
  )
}
