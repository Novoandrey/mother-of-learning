'use client'

/**
 * Таб 🏰 Партия (spec-058, корень 'party'). W1 — скелет: заголовок + мосты на
 * старые экраны. W4 заменяет содержимое: общак (кошелёк + предметы + положить/
 * забрать + ресурсы-продажа) + Вылазки + Крафт + Балансы всех (перенос
 * ExpeditionsScreen/CraftScreen/шитов как есть — они уже в целевом паттерне).
 * Пуш-экраны таба (не 'legacy-*') рендерит сам этот компонент по useTgNav().top.
 */

import { AppButton } from './primitives'
import { useTgNav, useTgRefresh, type TgTabProps } from './shell'

export function PartyTab({ app }: TgTabProps) {
  const nav = useTgNav()
  useTgRefresh() // W4: refreshKey → deps load-эффектов общака/вылазок/крафта

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">🏰 Партия</h1>
      <p className="mb-4 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
        Экран партии кампании {app.loopNumber > 0 ? `(петля ${app.loopNumber})` : ''} (в
        сборке — W4). Пока — старые экраны:
      </p>
      <div className="flex gap-2">
        <AppButton icon="💰" label="Общак" onClick={() => nav.push({ screen: 'legacy-stash' })} />
        <AppButton icon="🧭" label="Вылазки" onClick={() => nav.push({ screen: 'legacy-expeditions' })} />
        <AppButton icon="🛠" label="Крафт" onClick={() => nav.push({ screen: 'legacy-craft' })} />
        <AppButton icon="⚖️" label="Балансы" onClick={() => nav.push({ screen: 'legacy-balances' })} />
      </div>
    </div>
  )
}
