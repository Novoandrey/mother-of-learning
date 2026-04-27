'use client'

/**
 * Spec-016 — Кнопка «Применить ко всем предметам» в settings.
 *
 * Логика:
 *   1. Click → confirm() с текстом «Обновит цены...».
 *   2. Confirm → applyItemDefaultPrices(slug).
 *   3. Result → alert() с breakdown'ом (updated / skipped by flag /
 *      skipped by rarity / skipped by missing cell / unchanged).
 *   4. router.refresh() чтобы catalog grid подтянул новые цены.
 *
 * MVP UX — native confirm + alert. Если нужен будет красивый toast/
 * modal — wrap в существующий `<DMActionToast>` или подобный.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { applyItemDefaultPrices } from '@/app/c/[slug]/settings/actions'

type Props = {
  slug: string
}

export default function ApplyDefaultPricesButton({ slug }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lastBreakdown, setLastBreakdown] = useState<string | null>(null)

  function handleClick() {
    if (
      !confirm(
        'Применить таблицу стандартных цен ко всем предметам кампании?\n\n' +
          'Будут перезаписаны цены у item\'ов, у которых:\n' +
          '  • цена пуста ИЛИ совпадает со старым стандартом\n' +
          '    (флаг auto-managed при сохранении)\n' +
          '  • rarity ∈ common…legendary\n' +
          '  • в таблице есть значение для (bucket, rarity)\n\n' +
          'Items с DM-set ценой, artifact, без rarity, или без значения в таблице — не трогаются.',
      )
    ) {
      return
    }

    setError(null)
    setLastBreakdown(null)

    startTransition(async () => {
      const result = await applyItemDefaultPrices(slug)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const { plan } = result
      const lines = [
        `Обновлено: ${plan.updates.length}`,
        plan.unchanged > 0
          ? `Уже совпадало: ${plan.unchanged}`
          : null,
        plan.skippedByFlag > 0
          ? `Пропущено (галочка «не использовать стандарт»): ${plan.skippedByFlag}`
          : null,
        plan.skippedByRarity > 0
          ? `Пропущено (artifact / без rarity): ${plan.skippedByRarity}`
          : null,
        plan.skippedByMissingCell > 0
          ? `Пропущено (нет стандарта для редкости): ${plan.skippedByMissingCell}`
          : null,
      ].filter((l): l is string => l !== null)
      setLastBreakdown(lines.join('\n'))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Применяем…' : 'Применить ко всем предметам'}
      </button>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {lastBreakdown && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 whitespace-pre-line">
          {lastBreakdown}
        </div>
      )}
    </div>
  )
}
