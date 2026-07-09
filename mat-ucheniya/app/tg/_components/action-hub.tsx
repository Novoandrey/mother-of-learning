'use client'

/**
 * Таб ⚡ Действие (spec-058 W2, корень 'action') — «одна зона»: игрок пишет в
 * чат «что произошло» и делает то же здесь. Сверху кошелёк активного PC, под
 * ним плитка глаголов (Потратил · Получил · Купил · Передал · Продал · Ещё) и
 * лента движений. «Ещё» раскрывается инлайн-аккордеоном прямо в зоне действий
 * (spec-058 round-2), без отдельного шита.
 *
 * Шиты глаголов (action-sheets.tsx) живут на навигационном стеке как экраны
 * 'act-*': пуш через useTgNav, рендер здесь по nav.top (контракт shell W1),
 * системный «назад» = pop закрывает шит. Успешный сабмит → тост (z-[60], как
 * в CraftScreen) + useTgRefresh().bump() — лента и кошелёк перезагружаются.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getFeedTg,
  getWalletTg,
  hasLoopCreditTg,
  hasStarterTakenTg,
  type TgFeedRow,
  type TgWallet,
} from '@/lib/queries/ledger-tg'
import { takeLoopCredit } from '@/app/actions/transactions'
import { LOOP_CREDIT_GP } from '@/lib/ledger-constants'
import { Centered, FeedList, WalletCard } from './primitives'
import { useTgNav, useTgRefresh, type TgAppContext, type TgTabProps } from './shell'
import {
  BuySheet,
  GainSheet,
  GiveSheet,
  SellSheet,
  SpendSheet,
  TakeSheet,
} from './action-sheets'

// ─────────────────────────── hub ───────────────────────────

const VERBS: { icon: string; label: string; screen: string }[] = [
  { icon: '💸', label: 'Потратил', screen: 'act-spend' },
  { icon: '💰', label: 'Получил', screen: 'act-gain' },
  { icon: '🛍', label: 'Купил', screen: 'act-buy' },
  { icon: '🤝', label: 'Передал', screen: 'act-give' },
  { icon: '💱', label: 'Продал', screen: 'act-sell' },
]

export function ActionHub({ app }: TgTabProps) {
  const nav = useTgNav()
  const { refreshKey, bump } = useTgRefresh()
  const { supabase, loopNumber, categories, activePc } = app

  const [data, setData] = useState<{ wallet: TgWallet; rows: TgFeedRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

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

  const { top, push, pop } = nav

  if (error) return <Centered>{error}</Centered>

  return (
    <div>
      {data ? (
        <WalletCard wallet={data.wallet} label={`Кошелёк — ${activePc.title}`} />
      ) : (
        <div className="h-[104px] animate-pulse rounded-2xl bg-neutral-900" />
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
        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={
            'flex min-h-[64px] items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-medium text-neutral-100 transition-colors ' +
            (moreOpen ? 'bg-neutral-800' : 'bg-neutral-900 hover:bg-neutral-800')
          }
        >
          <span className="text-2xl leading-none">⋯</span>
          <span>Ещё</span>
          <span className="text-xs text-neutral-500">{moreOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {moreOpen && (
        <MoreInline app={app} onGo={(s) => push({ screen: s })} onDone={done} />
      )}

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
      {top.screen === 'act-take' && (
        <TakeSheet app={app} prefill={top.params} onClose={pop} onDone={done} />
      )}
    </div>
  )
}

// ─────────────────────────── ⋯ Ещё (инлайн-аккордеон) ───────────────────────────
// Раскрывается прямо в зоне действий (spec-058 round-2, вместо шита act-more):
// редкие действия — «Взял из общака» (act-take), кредит петли в один тап
// (takeLoopCredit, статус раз-в-петлю через hasLoopCreditTg), стартовый набор
// (legacy-equip, статус «взят» через hasStarterTakenTg) и наборы (legacy-sets).
// onGo = push: экраны ложатся на стек таба, системный «назад» = pop возвращает
// в корень. Статусы грузятся только для владельца (own) и только когда аккордеон
// открыт (компонент монтируется по moreOpen).

function MoreInline({
  app,
  onGo,
  onDone,
}: {
  app: TgAppContext
  onGo: (screen: string) => void
  /** Успех действия «в один тап» (кредит): текст тоста, рефреш — ActionHub. */
  onDone: (toast: string) => void
}) {
  const { supabase, campaignId, loopNumber, activePc } = app
  const own = activePc.isOwn

  // Раз-в-петлю статусы: null = грузится (кнопка выключена).
  const [creditTaken, setCreditTaken] = useState<boolean | null>(null)
  const [starterTaken, setStarterTaken] = useState<boolean | null>(null)
  const [creditBusy, setCreditBusy] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)

  useEffect(() => {
    if (!own) return
    let alive = true
    ;(async () => {
      try {
        const [credit, starter] = await Promise.all([
          hasLoopCreditTg(supabase, campaignId, activePc.id, loopNumber),
          hasStarterTakenTg(supabase, campaignId, activePc.id, loopNumber),
        ])
        if (alive) {
          setCreditTaken(credit)
          setStarterTaken(starter)
        }
      } catch {
        if (alive) {
          setCreditTaken(false) // сервер всё равно гардит повтор
          setStarterTaken(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [own, supabase, campaignId, activePc.id, loopNumber])

  const takeCredit = async () => {
    if (creditBusy || creditTaken !== false) return
    setCreditBusy(true)
    setCreditError(null)
    const res = await takeLoopCredit(campaignId, activePc.id, loopNumber)
    setCreditBusy(false)
    if (!res.ok) {
      setCreditError(res.error)
      if (res.error.includes('уже взят')) setCreditTaken(true)
      return
    }
    setCreditTaken(true)
    onDone(`💳 Кредит взят: +${LOOP_CREDIT_GP} ЗМ`)
  }

  return (
    <div className="mt-2 space-y-2">
      <MoreRow
        icon="🏰"
        label="Взял из общака"
        hint="деньги или предмет из общака — себе"
        onClick={() => onGo('act-take')}
      />
      {own && (
        <MoreRow
          icon="💳"
          label={
            creditTaken ? 'Кредит за петлю взят' : `Взять кредит · ${LOOP_CREDIT_GP} ЗМ`
          }
          hint={creditTaken ? 'раз в петлю — уже взят' : 'раз в петлю, зачислится сразу'}
          disabled={creditBusy || creditTaken !== false}
          onClick={() => void takeCredit()}
        />
      )}
      {creditError && <p className="px-1 text-sm text-red-400">{creditError}</p>}
      {own && (
        <MoreRow
          icon="🎽"
          label={starterTaken ? 'Стартовый набор взят' : 'Стартовый набор'}
          hint={
            starterTaken
              ? 'снаряжение начала петли — уже собрано'
              : 'снаряжение начала петли'
          }
          disabled={starterTaken !== false}
          onClick={() => onGo('legacy-equip')}
        />
      )}
      <MoreRow
        icon="📦"
        label="Наборы"
        hint="общие наборы предметов — купить или собрать"
        onClick={() => onGo('legacy-sets')}
      />
      {!own && (
        <p className="px-1 text-sm text-neutral-500">
          Кредит и стартовый набор доступны только владельцу персонажа.
        </p>
      )}
    </div>
  )
}

function MoreRow({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  hint: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3 text-left transition-colors hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-800"
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-100">{label}</span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </button>
  )
}
