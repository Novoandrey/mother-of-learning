'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

import type { AffectedRow, WizardKey } from '@/lib/starter-setup'

const WIZARD_LABEL: Record<WizardKey, string> = {
  starting_money: 'Стартовые деньги',
  starting_loan: 'Стартовый кредит',
  stash_seed: 'Общак',
  starting_items: 'Стартовые предметы',
  encounter_loot: 'Лут энкаунтера',
}

const REASON_LABEL: Record<AffectedRow['reason'], string> = {
  hand_edited: 'изменено вручную',
  hand_deleted: 'удалено вручную',
}

/**
 * Spec-012 T027 — confirmation dialog listing rows that would be
 * overwritten by a reapply. DM sees actor / wizard / current / next
 * and decides whether to proceed. Cancel or Esc / backdrop click
 * dismiss without running anything.
 *
 * `pending` prop from the parent disables both buttons during the
 * confirmed apply call so the DM can't double-fire.
 */
export function ApplyConfirmDialog({
  affected,
  onCancel,
  onConfirm,
  pending,
}: {
  affected: AffectedRow[]
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
}) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!pending) onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    cancelBtnRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(17,24,39,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Подтверждение перезаписи стартового сетапа"
    >
      <div
        className="w-[640px] max-w-[95vw] overflow-hidden rounded-lg bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              Эти ряды будут перезаписаны
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Реаплай стартового сетапа затронет {affected.length}{' '}
              {affected.length === 1 ? 'запись' : 'записей'} с ручными
              правками или удалениями. Продолжить?
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Закрыть"
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Table */}
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Актор</th>
                <th className="px-3 py-2 text-left font-medium">Визард</th>
                <th className="px-3 py-2 text-left font-medium">Сейчас</th>
                <th className="px-5 py-2 text-left font-medium">Станет</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {affected.map((row, i) => (
                <tr
                  key={`${row.actorPcId}:${row.wizardKey}:${row.itemName ?? ''}:${i}`}
                >
                  <td className="px-5 py-2.5 align-top text-gray-900">
                    <div className="font-medium">{row.actorTitle}</div>
                    <div className="text-xs text-gray-500">
                      {REASON_LABEL[row.reason]}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-gray-700">
                    {WIZARD_LABEL[row.wizardKey]}
                    {row.itemName && (
                      <div className="text-xs text-gray-500">{row.itemName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top font-mono text-xs text-gray-600">
                    {row.currentDisplay ?? (
                      <span className="italic text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 align-top font-mono text-xs text-gray-900">
                    {row.configDisplay ?? (
                      <span className="italic text-red-600">будет удалено</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Применяем…' : 'Подтвердить и пересобрать'}
          </button>
        </div>
      </div>
    </div>
  )
}
