'use client'

/**
 * Таб ⚡ Действие (spec-058 W2, корень 'action') — «одна зона»: игрок пишет в
 * чат «что произошло» и делает то же здесь. Сверху кошелёк активного PC, под
 * ним чипы последних операций (тап = шит с префиллом), плитка глаголов
 * (Потратил · Получил · Купил · Передал · Продал · Ещё) и лента движений.
 *
 * Шиты глаголов (action-sheets.tsx) живут на навигационном стеке как экраны
 * 'act-*': пуш через useTgNav, рендер здесь по nav.top (контракт shell W1),
 * системный «назад» = pop закрывает шит. Успешный сабмит → тост (z-[60], как
 * в CraftScreen) + useTgRefresh().bump() — лента и кошелёк перезагружаются.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getFeedTg,
  getWalletTg,
  type TgFeedRow,
  type TgWallet,
} from '@/lib/queries/ledger-tg'
import { Centered, FeedList, WalletCard } from './primitives'
import { useTgNav, useTgRefresh, type TgTabProps } from './shell'
import {
  BuySheet,
  GainSheet,
  GiveSheet,
  MoreSheet,
  SellSheet,
  SpendSheet,
} from './action-sheets'

// ─────────────────────────── чипы последних операций ───────────────────────────
// Из ленты активного PC выводим до 6 УНИКАЛЬНЫХ операций; тап открывает
// соответствующий глагол с префиллом. Маппинг строка→глагол опирается на
// форму строк, которую пишут server actions:
//   запись   — kind 'money' без transfer_group_id (createTransaction);
//   перевод  — kind 'transfer', исходящая нога < 0 (createTransfer/стэш-деньги);
//   покупка  — kind 'item', category 'purchase', +qty (createPurchase);
//   продажа  — kind 'item', −qty, comment «Продажа: …» (sellPcItem);
//   передача — kind 'item', −qty в transfer_group_id (createItemTransfer/стэш).

type ActionChip = {
  key: string
  label: string
  screen: 'act-spend' | 'act-gain' | 'act-buy' | 'act-give' | 'act-sell'
  params: Record<string, unknown>
}

const shortNote = (s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s)

function chipFor(r: TgFeedRow): ActionChip | null {
  const note = r.comment?.trim() ?? ''
  if (r.kind === 'money' && !r.transferGroupId) {
    if (r.signedGp < 0 && r.categorySlug === 'expense') {
      const gp = Math.abs(r.signedGp)
      return {
        key: `spend:${gp}:${note}`,
        label: `−${gp}${note ? ` · ${shortNote(note)}` : ''}`,
        screen: 'act-spend',
        params: { amount: gp, comment: note },
      }
    }
    if (r.signedGp > 0 && r.categorySlug === 'income') {
      return {
        key: `gain:${r.signedGp}:${note}`,
        label: `+${r.signedGp}${note ? ` · ${shortNote(note)}` : ''}`,
        screen: 'act-gain',
        params: { amount: r.signedGp, comment: note },
      }
    }
    return null
  }
  if (r.kind === 'transfer' && r.signedGp < 0) {
    const gp = Math.abs(r.signedGp)
    return {
      key: `give-money:${gp}`,
      label: `перевод ${gp} зм`,
      screen: 'act-give',
      params: { what: 'money', amount: gp },
    }
  }
  if (r.kind === 'item' && r.itemName) {
    if (r.categorySlug === 'purchase' && r.itemQty > 0) {
      return {
        key: `buy:${r.itemName}`,
        label: `${r.itemName} ×${r.itemQty}`,
        screen: 'act-buy',
        params: { query: r.itemName },
      }
    }
    if (r.itemQty < 0 && note.startsWith('Продажа:')) {
      return {
        key: `sell:${r.itemName}`,
        label: `продал ${r.itemName}`,
        screen: 'act-sell',
        params: { itemName: r.itemName },
      }
    }
    if (r.itemQty < 0 && r.transferGroupId) {
      return {
        key: `give-item:${r.itemName}`,
        label: `передал ${r.itemName}`,
        screen: 'act-give',
        params: { what: 'item', itemName: r.itemName, qty: Math.abs(r.itemQty) },
      }
    }
  }
  return null
}

function deriveChips(rows: TgFeedRow[]): ActionChip[] {
  const out: ActionChip[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.status === 'rejected') continue
    const chip = chipFor(r)
    if (!chip || seen.has(chip.key)) continue
    seen.add(chip.key)
    out.push(chip)
    if (out.length >= 6) break
  }
  return out
}

// ─────────────────────────── hub ───────────────────────────

const VERBS: { icon: string; label: string; screen: string }[] = [
  { icon: '💸', label: 'Потратил', screen: 'act-spend' },
  { icon: '💰', label: 'Получил', screen: 'act-gain' },
  { icon: '🛍', label: 'Купил', screen: 'act-buy' },
  { icon: '🤝', label: 'Передал', screen: 'act-give' },
  { icon: '💱', label: 'Продал', screen: 'act-sell' },
  { icon: '⋯', label: 'Ещё', screen: 'act-more' },
]

export function ActionHub({ app }: TgTabProps) {
  const nav = useTgNav()
  const { refreshKey, bump } = useTgRefresh()
  const { supabase, loopNumber, categories, activePc } = app

  const [data, setData] = useState<{ wallet: TgWallet; rows: TgFeedRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [wallet, feed] = await Promise.all([
          getWalletTg(supabase, activePc.id, loopNumber),
          getFeedTg(supabase, activePc.id, loopNumber, { limit: 25 }),
        ])
        if (alive) setData({ wallet, rows: feed.rows })
      } catch {
        if (alive) setError('Не удалось загрузить кошелёк.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, activePc.id, loopNumber, refreshKey])

  const chips = useMemo(() => deriveChips(data?.rows ?? []), [data])

  // Успех любого шита: локальный тост (таймер в цепочке обработчика, не в
  // эффекте — lint) + bump(): refreshKey в deps выше перезагрузит данные и
  // без Realtime.
  const done = useCallback(
    (msg: string) => {
      setToast(msg)
      window.setTimeout(() => setToast(null), 2500)
      bump()
    },
    [bump],
  )

  const { top, push, pop, replace } = nav

  if (error) return <Centered>{error}</Centered>

  return (
    <div>
      {data ? (
        <WalletCard wallet={data.wallet} label={`Кошелёк — ${activePc.title}`} />
      ) : (
        <div className="h-[104px] animate-pulse rounded-2xl bg-neutral-900" />
      )}

      {chips.length > 0 && (
        <div className="mt-3">
          <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Недавнее
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={() => push({ screen: c.screen, params: c.params })}
                className="max-w-full truncate rounded-full bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {VERBS.map((v) => (
          <button
            key={v.screen}
            onClick={() => push({ screen: v.screen })}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-3 text-base font-medium text-neutral-100 transition-colors hover:bg-neutral-800"
          >
            <span className="text-2xl leading-none">{v.icon}</span>
            <span>{v.label}</span>
          </button>
        ))}
      </div>

      {data && data.rows.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Движения
          </h2>
          <FeedList rows={data.rows} categories={categories} />
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* Экраны 'act-*' (контракт shell: неизвестный screen рендерит таб). */}
      {top.screen === 'act-spend' && (
        <SpendSheet app={app} prefill={top.params} onClose={pop} onDone={done} />
      )}
      {top.screen === 'act-gain' && (
        <GainSheet app={app} prefill={top.params} onClose={pop} onDone={done} />
      )}
      {top.screen === 'act-buy' && (
        <BuySheet app={app} prefill={top.params} onClose={pop} onDone={done} />
      )}
      {top.screen === 'act-give' && (
        <GiveSheet app={app} prefill={top.params} onClose={pop} onDone={done} />
      )}
      {top.screen === 'act-sell' && (
        <SellSheet app={app} prefill={top.params} onClose={pop} onDone={done} />
      )}
      {top.screen === 'act-more' && (
        <MoreSheet app={app} onGo={(s) => replace({ screen: s })} onClose={pop} />
      )}
    </div>
  )
}
