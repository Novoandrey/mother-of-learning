'use client'

/**
 * Таб 🏰 Партия (spec-058 W4): партийное в одном доме.
 *
 * Корень 'party': общак (кошелёк + Положить/Забрать + предметы + ресурсы с
 * продажей + лента под катом) → входы «Вылазки»/«Крафт» (карточки со сводкой,
 * пуш 'party-expeditions'/'party-craft' — рендерят СУЩЕСТВУЮЩИЕ
 * ExpeditionsScreen/CraftScreen из ledger-app, они уже в целевом паттерне
 * 055 R2/056) → «Балансы» (Общак + все PC; тап по PC = переключить активного
 * и уйти в таб Персонаж).
 *
 * Положить/Забрать общака — шиты глаголов из action-sheets: GiveSheet с
 * префиллом {dest:'stash'} и TakeSheet (общак → активный PC); успех = тост
 * (паттерн sell ниже) + reload(). Пуш-экраны таба рендерит сам этот
 * компонент по useTgNav().top (контракт W1).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getStashTg,
  getStashItemHoldingsTg,
  getStashResourceHoldingsTg,
  getAllBalancesTg,
  type StashResourceHoldingTg,
  type TgBalanceRow,
  type TgWallet,
  type TgFeedRow,
} from '@/lib/queries/ledger-tg'
import { listExpeditions } from '@/lib/queries/expeditions-tg'
import { listSchemas } from '@/lib/queries/craft-tg'
import { sellStashResource } from '@/app/actions/resources'
import { formatGp } from './format'
import { Centered, WalletCard, FeedList, IntInput } from './primitives'
import { CraftScreen, ExpeditionsScreen } from './ledger-app'
import { GiveSheet, TakeSheet } from './action-sheets'
import { useTgNav, useTgRefresh, type TgTabProps } from './shell'

export function PartyTab({ app }: TgTabProps) {
  const nav = useTgNav()
  const { refreshKey } = useTgRefresh()

  // Пуш-экраны таба — существующие экраны 055/056 как есть.
  switch (nav.top.screen) {
    case 'party-expeditions':
      return (
        <ExpeditionsScreen
          supabase={app.supabase}
          campaignId={app.campaignId}
          loopNumber={app.loopNumber}
          characters={app.characters}
          userId={app.userId}
          role={app.role}
          onBack={() => nav.pop()}
          refreshKey={refreshKey}
        />
      )
    case 'party-craft':
      return (
        <CraftScreen
          supabase={app.supabase}
          campaignId={app.campaignId}
          loopNumber={app.loopNumber}
          characters={app.characters}
          onBack={() => nav.pop()}
          refreshKey={refreshKey}
        />
      )
    default:
      return <PartyRoot app={app} />
  }
}

// ─────────────────────────── корень таба ───────────────────────────

type PartyData = {
  wallet: TgWallet
  recent: TgFeedRow[]
  items: { name: string; qty: number }[]
  resources: StashResourceHoldingTg[]
  balanceRows: TgBalanceRow[]
  stashGp: number
  expeditionCount: number
  schemaCount: number
}

function PartyRoot({ app }: TgTabProps) {
  const nav = useTgNav()
  const { refreshKey } = useTgRefresh()
  const { supabase, campaignId, loopNumber, characters, categories, activePc } = app

  const [data, setData] = useState<PartyData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'none' | 'to-stash' | 'from-stash'>('none')
  const [showFeed, setShowFeed] = useState(false)
  const [sellBusyId, setSellBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchAll = useCallback(async (): Promise<PartyData> => {
    const [stash, items, resources, balances, expeditions, schemas] = await Promise.all([
      getStashTg(supabase, campaignId, loopNumber),
      getStashItemHoldingsTg(supabase, campaignId, loopNumber),
      getStashResourceHoldingsTg(supabase, campaignId, loopNumber),
      getAllBalancesTg(
        supabase,
        campaignId,
        loopNumber,
        characters.map((c) => ({ id: c.id, title: c.title, isOwn: c.isOwn })),
      ),
      listExpeditions(supabase, campaignId),
      listSchemas(supabase, campaignId),
    ])
    return {
      wallet: stash.wallet,
      recent: stash.recent,
      items,
      resources,
      balanceRows: balances.rows,
      stashGp: balances.stashGp,
      expeditionCount: expeditions.length,
      schemaCount: schemas.length,
    }
  }, [supabase, campaignId, loopNumber, characters])

  const reload = useCallback(async () => {
    try {
      setData(await fetchAll())
    } catch {
      setError('Не удалось загрузить партию.')
    }
  }, [fetchAll])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const d = await fetchAll()
        if (alive) setData(d)
      } catch {
        if (alive) setError('Не удалось загрузить партию.')
      }
    })()
    return () => {
      alive = false
    }
  }, [fetchAll, refreshKey])

  // Продажа ресурса из общака по номиналу → тост «+N зм» + reload. Транзиентный
  // тост живёт в цепочке обработчика, не в эффекте
  // (react-hooks/set-state-in-effect не задет).
  const sell = async (r: StashResourceHoldingTg, qty: number) => {
    setError(null)
    setSellBusyId(r.itemNodeId)
    const res = await sellStashResource({
      campaignId,
      itemNodeId: r.itemNodeId,
      qty: Math.min(qty, r.qty),
      loopNumber,
      dayInLoop: 1,
    })
    setSellBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setToast(`+${res.soldGp} зм`)
    window.setTimeout(() => setToast(null), 2500)
    await reload()
  }

  // Успех шита Положить/Забрать: тост с текстом шита (тот же транзиентный
  // паттерн, что sell выше) + перезагрузка данных общака.
  const sheetDone = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
    void reload()
  }

  // Ресурсы показываются своей секцией с продажей — из «Предметов» их убираем,
  // чтобы одна позиция не светилась двумя строками.
  const resourceNames = new Set(data?.resources.map((r) => r.name) ?? [])
  const gear = data?.items.filter((i) => !resourceNames.has(i.name)) ?? []
  const orderedBalances = data
    ? [...data.balanceRows].sort(
        (a, b) => Number(b.isOwn) - Number(a.isOwn) || a.title.localeCompare(b.title, 'ru'),
      )
    : []
  const byId = new Map(characters.map((c) => [c.id, c]))

  return (
    <div className="pb-6">
      <h1 className="mb-3 text-lg font-semibold">🏰 Партия</h1>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {!error && !data && <Centered>Загрузка…</Centered>}
      {data && (
        <>
          {/* ── Общак ── */}
          <WalletCard wallet={data.wallet} label="Общак" />
          {activePc.isOwn && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setSheet('to-stash')}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Положить
              </button>
              <button
                onClick={() => setSheet('from-stash')}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Забрать
              </button>
            </div>
          )}
          {gear.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Предметы
              </h2>
              <ul className="space-y-1">
                {gear.map((i) => (
                  <li
                    key={i.name}
                    className="flex items-center justify-between gap-2 rounded-lg bg-neutral-900 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-neutral-100">{i.name}</span>
                    <span className="shrink-0 text-xs text-neutral-500">×{i.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.resources.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Ресурсы
              </h2>
              <div className="space-y-1">
                {data.resources.map((r) => (
                  <ResourceSellRow
                    key={`${r.itemNodeId}-${r.qty}`}
                    r={r}
                    busy={sellBusyId === r.itemNodeId}
                    onSell={(qty) => void sell(r, qty)}
                  />
                ))}
              </div>
            </div>
          )}
          {/* Лента общака — под катом (паттерн «История вылазок…»). */}
          <button
            onClick={() => setShowFeed((v) => !v)}
            className="mt-4 w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
          >
            {showFeed ? 'Скрыть движения' : 'Движения общака…'}
          </button>
          {showFeed && <FeedList rows={data.recent} categories={categories} />}

          {/* ── Вылазки и Крафт ── */}
          <div className="mt-5 space-y-2">
            <EntryCard
              icon="🧭"
              title="Вылазки"
              subtitle={ruCount(data.expeditionCount, 'шаблон', 'шаблона', 'шаблонов')}
              onClick={() => nav.push({ screen: 'party-expeditions' })}
            />
            <EntryCard
              icon="🛠"
              title="Крафт"
              subtitle={ruCount(data.schemaCount, 'схема', 'схемы', 'схем')}
              onClick={() => nav.push({ screen: 'party-craft' })}
            />
          </div>

          {/* ── Балансы ── */}
          <div className="mt-5">
            <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Балансы · п{loopNumber}
            </h2>
            <ul className="space-y-1">
              <li className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
                <span className="text-neutral-300">Общак</span>
                <span className="font-mono tabular-nums text-neutral-200">
                  {formatGp(data.stashGp)}
                </span>
              </li>
              {orderedBalances.map((row) => {
                const c = byId.get(row.id)
                return (
                  <li key={row.id}>
                    <button
                      onClick={() => {
                        if (!c) return
                        app.setActivePc(c)
                        nav.reset('character')
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-900"
                    >
                      <span className={row.isOwn ? 'font-medium' : 'text-neutral-300'}>
                        {row.title}
                      </span>
                      <span className="font-mono tabular-nums text-neutral-300">
                        {formatGp(row.aggregateGp)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
      {toast && (
        // bottom-20 — над таб-баром shell (fixed bottom, ~52px + safe area).
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
      {sheet === 'to-stash' && (
        <GiveSheet
          app={app}
          prefill={{ dest: 'stash' }}
          onClose={() => setSheet('none')}
          onDone={sheetDone}
        />
      )}
      {sheet === 'from-stash' && (
        <TakeSheet app={app} onClose={() => setSheet('none')} onDone={sheetDone} />
      )}
    </div>
  )
}

// ─────────────────────────── секционные примитивы ───────────────────────────

/** Карточка-вход в подэкран: иконка + название + сводка + шеврон. */
function EntryCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2.5 text-left transition-colors hover:bg-neutral-800"
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-100">{title}</span>
        <span className="block text-xs text-neutral-500">{subtitle}</span>
      </span>
      <span className="shrink-0 text-neutral-600">›</span>
    </button>
  )
}

/** «3 шаблона» — число + русская форма слова. */
function ruCount(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  const word =
    m10 === 1 && m100 !== 11
      ? one
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)
        ? few
        : many
  return `${n} ${word}`
}

/**
 * One sellable resource row in the общак: «{name} ×{qty} · {price} зм/шт» + a qty
 * field (default = the full remaining stock) + a «Продать» button. Keyed by
 * (id, qty) upstream so a sale that changes the stock remounts the row, resetting
 * the qty field back to the new full remainder. (Перенос из ledger-app StashScreen;
 * оригинал уйдёт вместе с ним в W5.)
 */
function ResourceSellRow({
  r,
  busy,
  onSell,
}: {
  r: StashResourceHoldingTg
  busy: boolean
  onSell: (qty: number) => void
}) {
  const [qty, setQty] = useState(r.qty)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-neutral-100">{r.name}</div>
        <div className="text-xs text-neutral-500">
          ×{r.qty} · {r.priceGp} зм/шт
        </div>
      </div>
      <IntInput
        className="w-14 rounded-md bg-neutral-800 px-2 py-1 text-right text-sm text-neutral-100"
        value={qty}
        onCommit={setQty}
      />
      <button
        onClick={() => onSell(qty)}
        disabled={busy}
        className="shrink-0 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
      >
        {busy ? '…' : 'Продать'}
      </button>
    </div>
  )
}
