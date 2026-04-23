'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCampaignPCs, type CampaignPC } from '@/app/actions/characters'

type Props = {
  campaignId: string
  initialSelectedIds: string[]
  onChange: (selectedIds: string[]) => void
}

/**
 * Dropdown / bottom-sheet picker for campaign PCs ("пачка" session).
 *
 * Desktop (≥640px): absolute-positioned dropdown below the trigger button.
 * Mobile (<640px): fixed full-screen sheet with a backdrop. Same content.
 *
 * PC list is fetched lazily on first open via the `getCampaignPCs` server
 * action and cached in local state thereafter. Checkbox rows: selected
 * ones float to the top, rest follow. A filter input narrows both lists
 * by title or owner label.
 *
 * Selection state is kept locally; every toggle calls `onChange` with the
 * full selected id list so the hosting form can decide when to persist.
 */
export function ParticipantsPicker({
  campaignId,
  initialSelectedIds,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pcs, setPcs] = useState<CampaignPC[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Use Set for O(1) toggles; serialize to array for onChange.
  const initialSet = useMemo(
    () => new Set(initialSelectedIds),
    // Run only on first mount; caller is expected to remount the picker
    // when the source of truth changes (e.g. switching edited session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [selected, setSelected] = useState<Set<string>>(initialSet)

  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── Lazy PC load on first open ─────────────────────────────────────
  const loadPcs = useCallback(async () => {
    if (pcs !== null || loading) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await getCampaignPCs(campaignId)
      setPcs(data)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить список')
    } finally {
      setLoading(false)
    }
  }, [campaignId, pcs, loading])

  useEffect(() => {
    if (open && pcs === null && !loading) loadPcs()
  }, [open, pcs, loading, loadPcs])

  // ── Click-outside (desktop) — closes the dropdown ──────────────────
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const node = wrapperRef.current
      if (!node) return
      if (!node.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // ── Escape closes on desktop+mobile ────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // ── Toggle selection ───────────────────────────────────────────────
  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    onChange(Array.from(next))
  }

  function clearAll() {
    const next = new Set<string>()
    setSelected(next)
    onChange([])
  }

  // ── Derive filtered & split lists ──────────────────────────────────
  const list = pcs ?? []
  const q = filter.trim().toLowerCase()
  const filtered = q
    ? list.filter((p) => {
        if (p.title.toLowerCase().includes(q)) return true
        if (p.owner_display_name?.toLowerCase().includes(q)) return true
        return false
      })
    : list
  const selectedRows = filtered.filter((p) => selected.has(p.id))
  const unselectedRows = filtered.filter((p) => !selected.has(p.id))

  const selectedCount = selected.size
  const total = list.length

  const triggerLabel =
    selectedCount === 0
      ? 'Выбрать участников'
      : `Участников: ${selectedCount}`

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-gray-400 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedCount === 0 ? 'text-gray-500' : 'text-gray-800'}>
          {triggerLabel}
        </span>
        <span className="text-gray-400">▾</span>
      </button>

      {open && (
        <>
          {/* Mobile-only backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          {/* Panel: full-screen on mobile, dropdown on ≥sm */}
          <div
            className="
              fixed inset-0 z-50 flex flex-col bg-white
              sm:absolute sm:inset-auto sm:left-0 sm:right-0 sm:top-full sm:mt-1.5
              sm:max-h-80 sm:rounded-lg sm:border sm:border-gray-200 sm:shadow-lg
            "
            role="dialog"
            aria-label="Выбор участников"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 sm:py-1.5">
              <div className="text-sm font-medium text-gray-700">
                {selectedCount} / {total} выбрано
              </div>
              <div className="flex items-center gap-2">
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Очистить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-gray-500 hover:text-gray-800 sm:hidden"
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter */}
            <div className="px-3 py-2">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Поиск по имени или игроку…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-1 pb-2">
              {loading && (
                <div className="px-3 py-3 text-sm text-gray-500">
                  Загружаю персонажей…
                </div>
              )}
              {loadError && (
                <div className="px-3 py-3 text-sm text-red-600">{loadError}</div>
              )}
              {!loading && !loadError && list.length === 0 && (
                <div className="px-3 py-3 text-sm text-gray-500">
                  В кампании нет персонажей с владельцем.
                </div>
              )}
              {!loading && !loadError && list.length > 0 && filtered.length === 0 && (
                <div className="px-3 py-3 text-sm text-gray-500">
                  Ничего не найдено по «{filter}».
                </div>
              )}

              {selectedRows.length > 0 && (
                <div className="sticky top-0 z-10 bg-white">
                  <div className="px-2 pt-1 text-[11px] uppercase tracking-wide text-gray-400">
                    Выбрано
                  </div>
                  {selectedRows.map((pc) => (
                    <PickerRow
                      key={pc.id}
                      pc={pc}
                      checked
                      onToggle={() => toggle(pc.id)}
                    />
                  ))}
                  {unselectedRows.length > 0 && (
                    <div className="mt-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-gray-400">
                      Остальные
                    </div>
                  )}
                </div>
              )}

              {unselectedRows.map((pc) => (
                <PickerRow
                  key={pc.id}
                  pc={pc}
                  checked={false}
                  onToggle={() => toggle(pc.id)}
                />
              ))}
            </div>

            {/* Mobile-only done button */}
            <div className="border-t border-gray-100 px-3 py-2 sm:hidden">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Готово
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PickerRow({
  pc,
  checked,
  onToggle,
}: {
  pc: CampaignPC
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 accent-blue-600"
      />
      <span className="flex-1 text-sm text-gray-800">{pc.title}</span>
      {pc.owner_display_name && (
        <span className="text-xs text-gray-400">@{pc.owner_display_name}</span>
      )}
    </label>
  )
}
