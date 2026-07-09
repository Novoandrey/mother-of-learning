'use client'

/**
 * Таб 🎒 Персонаж (spec-058, корень 'character'). W1 — скелет: заголовок +
 * мосты на старые экраны. W3 заменяет содержимое: кошелёк + «Надето» (слоты,
 * tap-to-equip) + «Сумка» + лента своих движений; тап по предмету →
 * ItemActionSheet (Надеть/Снять · Передать · В общак · Продал).
 * Пуш-экраны таба (не 'legacy-*') рендерит сам этот компонент по useTgNav().top.
 */

import { AppButton } from './primitives'
import { useTgNav, useTgRefresh, type TgTabProps } from './shell'

export function CharacterTab({ app }: TgTabProps) {
  const nav = useTgNav()
  useTgRefresh() // W3: refreshKey → deps load-эффектов кошелька/сумки/ленты

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">🎒 Персонаж</h1>
      <p className="mb-4 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
        Экран {app.activePc.title} (в сборке — W3). Пока — старые экраны:
      </p>
      <div className="flex gap-2">
        <AppButton icon="🛍" label="Деньги" onClick={() => nav.push({ screen: 'legacy-ledger' })} />
        <AppButton icon="🎒" label="Сумка" onClick={() => nav.push({ screen: 'legacy-inventory' })} />
        {app.activePc.isOwn && (
          <AppButton icon="🎽" label="Снаряжение" onClick={() => nav.push({ screen: 'legacy-equip' })} />
        )}
      </div>
    </div>
  )
}
