'use client'

/**
 * Таб ⚡ Действие (spec-058, корень 'action'). W1 — скелет: заголовок + мосты
 * на старые экраны. W2 заменяет содержимое на зону действий: чипы последних
 * операций + плитка глаголов (Потратил · Получил · Купил · Передал · Продал ·
 * Ещё) → единый пайплайн «форма → превью → сабмит» (action-sheets.tsx).
 * Пуш-экраны таба (не 'legacy-*') рендерит сам этот компонент по useTgNav().top.
 */

import { AppButton } from './primitives'
import { useTgNav, useTgRefresh, type TgTabProps } from './shell'

export function ActionHub({ app }: TgTabProps) {
  const nav = useTgNav()
  useTgRefresh() // W2: refreshKey → deps load-эффекта чипов последних операций

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">⚡ Действие</h1>
      <p className="mb-4 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
        Зона действий {app.activePc.title} (в сборке — W2). Пока — старые экраны:
      </p>
      <div className="flex gap-2">
        <AppButton icon="🛍" label="Деньги" onClick={() => nav.push({ screen: 'legacy-ledger' })} />
        <AppButton icon="🎒" label="Сумка" onClick={() => nav.push({ screen: 'legacy-inventory' })} />
      </div>
    </div>
  )
}
