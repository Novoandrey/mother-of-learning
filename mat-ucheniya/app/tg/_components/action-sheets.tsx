'use client'

/**
 * Шиты глаголов таба ⚡ (spec-058 W2) — единый пайплайн «короткая форма →
 * превью-строка → сабмит → тост». Все шиты — общий Sheet (паттерн R2 из
 * primitives: не закрывается по бэкдропу, скроллится внутри, «← Назад» в
 * шапке). ActionHub держит их на навигационном стеке как экраны 'act-*' и
 * рендерит по useTgNav().top; закрытие = pop, успех = onDone(текст тоста).
 *
 * Серверный слой не трогаем: createTransaction / createPurchase /
 * createTransfer / createItemTransfer / put*IntoStash / sellPcItem как есть.
 */

import { useEffect, useState } from 'react'
import {
  getWalletTg,
  getStashTg,
  getCampaignBuyConfigTg,
  getPcItemHoldingsTg,
  searchBuyableItemsTg,
  type BuyableItemTg,
} from '@/lib/queries/ledger-tg'
import {
  createTransaction,
  createTransfer,
  createItemTransfer,
  createPurchase,
} from '@/app/actions/transactions'
import { putMoneyIntoStash, putItemIntoStash } from '@/app/actions/stash'
import { sellPcItem } from '@/app/actions/sell'
import {
  resolveBuyUnitPriceGp,
  normalizeRarity,
} from '@/lib/item-purchase-policy'
import { computeShortfall } from '@/lib/transaction-resolver'
import { formatGp } from './format'
import { FIELD, Sheet, SegToggle, SubmitButton, parseGp } from './primitives'
import type { TgAppContext } from './shell'

/**
 * День петли для быстрых действий (v1). Раньше `dayInLoop: 1` был зашит в ~11
 * местах ledger-app — теперь одна константа. Настоящий день петли в быстрых
 * действиях — материя спеки 057; до неё все глаголы пишут день 1 осознанно.
 */
export const QUICK_ACTION_DAY = 1

// ─────────────────────────── общий контракт шитов ───────────────────────────

export type ActionSheetProps = {
  app: TgAppContext
  /** Префилл из чипа последних операций (nav params, unknown-safe). */
  prefill?: Record<string, unknown>
  /** Закрыть шит (ActionHub передаёт nav.pop). */
  onClose: () => void
  /** Успешный сабмит: текст для тоста; рефреш дергает ActionHub. */
  onDone: (toast: string) => void
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Превью-строка пайплайна: что именно произойдёт после сабмита. */
function PreviewLine({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-center text-sm text-neutral-200">
      {text}
    </div>
  )
}

// ─────────────────────────── 💸 Потратил / 💰 Получил ───────────────────────────
// Замена RecordSheet: глагол уже выбран табом, SegToggle расход/доход не нужен.

export function SpendSheet(props: ActionSheetProps) {
  return <MoneySheet {...props} mode="spend" />
}

export function GainSheet(props: ActionSheetProps) {
  return <MoneySheet {...props} mode="gain" />
}

function MoneySheet({
  app,
  prefill,
  onClose,
  onDone,
  mode,
}: ActionSheetProps & { mode: 'spend' | 'gain' }) {
  const spend = mode === 'spend'
  const [amount, setAmount] = useState(() => {
    const n = num(prefill?.amount)
    return n != null ? String(n) : ''
  })
  const [comment, setComment] = useState(() => str(prefill?.comment))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gp = parseGp(amount)
  const line =
    gp != null
      ? `${spend ? '−' : '+'}${formatGp(gp)}${comment.trim() ? ` · ${comment.trim()}` : ''}`
      : null

  const submit = async () => {
    if (gp == null) {
      setError('Введите сумму в зм')
      return
    }
    setBusy(true)
    setError(null)
    const res = await createTransaction({
      campaignId: app.campaignId,
      actorPcId: app.activePc.id,
      kind: 'money',
      amountGp: spend ? -gp : gp,
      categorySlug: spend ? 'expense' : 'income',
      comment: comment.trim(),
      loopNumber: app.loopNumber,
      dayInLoop: QUICK_ACTION_DAY,
      notify: true,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(`${spend ? '💸' : '💰'} ${line}`)
    onClose()
  }

  return (
    <Sheet title={spend ? '💸 Потратил' : '💰 Получил'} onClose={onClose}>
      <div className="space-y-3">
        <input
          className={FIELD}
          inputMode="decimal"
          placeholder="Сумма, зм"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <input
          className={FIELD}
          placeholder={spend ? 'На что (необязательно)' : 'Откуда (необязательно)'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {line && <PreviewLine text={line} />}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        {spend ? 'Списать' : 'Записать'}
      </SubmitButton>
    </Sheet>
  )
}

// ─────────────────────────── 🛍 Купил ───────────────────────────
// Перенос BuySheet из ledger-app (T017/spec-052) с сохранением функционала:
// поиск по каталогу → цена/итого → funding (за свои / свои+общак / из общака)
// + FundingPreview + keepGp. Добавлена превью-строка пайплайна; сабмит —
// createPurchase как есть. prefill.query — из чипа последних покупок.

const FUNDING_LABEL: Record<'pc' | 'pc_with_stash' | 'stash', string> = {
  pc: 'за свои',
  pc_with_stash: 'свои+общак',
  stash: 'из общака',
}

export function BuySheet({ app, prefill, onClose, onDone }: ActionSheetProps) {
  const { supabase, campaignId, loopNumber, activePc } = app
  const [config, setConfig] = useState<Awaited<
    ReturnType<typeof getCampaignBuyConfigTg>
  > | null>(null)
  const [query, setQuery] = useState(() => str(prefill?.query))
  const [results, setResults] = useState<BuyableItemTg[]>([])
  const [picked, setPicked] = useState<BuyableItemTg | null>(null)
  const [qty, setQty] = useState('1')
  const [funding, setFunding] = useState<'pc' | 'pc_with_stash' | 'stash'>('pc')
  const [keep, setKeep] = useState('')
  const [walletGp, setWalletGp] = useState<number | null>(null)
  const [stashGp, setStashGp] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const c = await getCampaignBuyConfigTg(supabase, campaignId)
        if (alive) setConfig(c)
      } catch {
        /* preview just won't render; createPurchase still validates server-side */
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId])

  // Balances for the «баланс → после» preview (spec-053). Best-effort.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [w, s] = await Promise.all([
          getWalletTg(supabase, activePc.id, loopNumber),
          getStashTg(supabase, campaignId, loopNumber),
        ])
        if (alive) {
          setWalletGp(w.aggregateGp)
          setStashGp(s.wallet.aggregateGp)
        }
      } catch {
        /* preview is optional */
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, activePc.id, loopNumber])

  useEffect(() => {
    const q = query.trim()
    if (!q) return // stale results are hidden by the render guard below
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchBuyableItemsTg(supabase, campaignId, q)
        if (alive) setResults(r)
      } catch {
        if (alive) setResults([])
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, supabase, campaignId])

  const n = Math.max(0, parseInt(qty, 10) || 0)
  const unitGp =
    picked && config
      ? resolveBuyUnitPriceGp({
          priceGp: picked.priceGp,
          categorySlug: picked.categorySlug,
          rarity: normalizeRarity(picked.rarity),
          defaults: config.defaults,
          policy: config.policy,
        })
      : null
  const totalGp = unitGp != null ? unitGp * Math.max(1, n) : null
  const line =
    picked && totalGp != null
      ? `−${formatGp(totalGp)} · ${picked.title}${n > 1 ? ` ×${n}` : ''} · ${FUNDING_LABEL[funding]}`
      : null

  const submit = async () => {
    setError(null)
    if (!picked) {
      setError('Выберите предмет')
      return
    }
    if (n < 1) {
      setError('Количество ≥ 1')
      return
    }
    if (unitGp == null) {
      setError('У предмета нет цены — покупка недоступна')
      return
    }
    setBusy(true)
    try {
      const res = await createPurchase({
        campaignId,
        buyerPcId: activePc.id,
        itemNodeId: picked.id,
        qty: n,
        fundingSource: funding,
        keepGp: funding === 'pc_with_stash' ? Math.max(0, parseGp(keep) ?? 0) : undefined,
        loopNumber,
        dayInLoop: QUICK_ACTION_DAY,
        notify: true,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDone(`🛍 ${picked.title}${n > 1 ? ` ×${n}` : ''} — куплено`)
      onClose()
    } catch {
      setError('Не удалось купить — попробуй ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="🛍 Купил" onClose={onClose}>
      <div className="space-y-3">
        {!picked ? (
          <>
            <input
              className={FIELD}
              placeholder="Поиск предмета…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query.trim() !== '' && results.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg bg-neutral-800">
                {results.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setPicked(it)
                      setError(null)
                    }}
                    className="block w-full border-b border-neutral-700 px-3 py-2 text-left text-sm text-neutral-100 last:border-0 hover:bg-neutral-700"
                  >
                    {it.title}
                  </button>
                ))}
              </div>
            )}
            {query.trim() !== '' && results.length === 0 && (
              <p className="text-sm text-neutral-500">Ничего не найдено.</p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2">
              <span className="text-sm text-neutral-100">{picked.title}</span>
              <button
                onClick={() => {
                  setPicked(null)
                  setError(null)
                }}
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                сменить
              </button>
            </div>

            {unitGp == null ? (
              <p className="text-sm text-amber-400">
                У этого предмета нет цены — купить нельзя.
              </p>
            ) : (
              <>
                <input
                  className={FIELD}
                  inputMode="numeric"
                  placeholder="Количество"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                <SegToggle
                  value={funding}
                  onChange={setFunding}
                  options={[
                    { value: 'pc', label: 'За свои' },
                    { value: 'pc_with_stash', label: 'Свои+общак' },
                    { value: 'stash', label: 'Из общака' },
                  ]}
                />
                <div className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Цена за шт.</span>
                    <span className="font-mono tabular-nums text-neutral-200">
                      {formatGp(unitGp)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-neutral-400">Итого</span>
                    <span className="font-mono tabular-nums text-neutral-100">
                      {totalGp != null ? formatGp(totalGp) : '—'}
                    </span>
                  </div>
                </div>
                <FundingPreview
                  funding={funding}
                  totalGp={totalGp}
                  walletGp={walletGp}
                  stashGp={stashGp}
                  keep={keep}
                  onKeep={setKeep}
                />
              </>
            )}
          </>
        )}
      </div>
      {line && <PreviewLine text={line} />}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {picked && unitGp != null && (
        <SubmitButton busy={busy} onClick={submit}>
          Купить
        </SubmitButton>
      )}
    </Sheet>
  )
}

// «Свои/Общак → после» для покупки (перенос из ledger-app как есть; старая
// копия уходит вместе с BuySheet в W5). keepGp — «оставить на руках».
function FundingPreview({
  funding,
  totalGp,
  walletGp,
  stashGp,
  keep,
  onKeep,
}: {
  funding: 'pc' | 'pc_with_stash' | 'stash'
  totalGp: number | null
  walletGp: number | null
  stashGp: number | null
  keep: string
  onKeep: (v: string) => void
}) {
  const keepGp = funding === 'pc_with_stash' ? Math.max(0, parseGp(keep) ?? 0) : 0
  const preview = (() => {
    if (totalGp == null || walletGp == null) return null
    if (funding === 'pc') {
      return { own: [walletGp, walletGp - totalGp] as const, stash: null, short: 0 }
    }
    if (funding === 'stash') {
      const s = stashGp ?? 0
      return { own: null, stash: [s, s - totalGp] as const, short: 0 }
    }
    const s = stashGp ?? 0
    const sf = computeShortfall(walletGp, totalGp, s, keepGp)
    const ownSpend = totalGp - sf.toBorrow
    return {
      own: [walletGp, walletGp - ownSpend] as const,
      stash: [s, s - sf.toBorrow] as const,
      short: sf.remainderNegative,
    }
  })()
  const arrow = (from: number, to: number) => (
    <span className="font-mono tabular-nums text-neutral-300">
      {formatGp(from)} →{' '}
      <span className={to < 0 ? 'text-red-400' : 'text-neutral-100'}>{formatGp(to)}</span>
    </span>
  )
  return (
    <>
      {funding === 'pc_with_stash' && (
        <input
          className={FIELD}
          inputMode="decimal"
          placeholder="Оставить на руках, зм (необязательно)"
          value={keep}
          onChange={(e) => onKeep(e.target.value)}
        />
      )}
      {preview && (
        <div className="rounded-lg bg-neutral-800 px-3 py-2 text-xs">
          {preview.own && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Свои</span>
              {arrow(preview.own[0], preview.own[1])}
            </div>
          )}
          {preview.stash && (
            <div className="mt-0.5 flex justify-between">
              <span className="text-neutral-400">Общак</span>
              {arrow(preview.stash[0], preview.stash[1])}
            </div>
          )}
          {preview.short > 0 && (
            <p className="mt-1 text-red-400">
              Не хватает {formatGp(preview.short)} даже с общаком
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ─────────────────────────── 🤝 Передал ───────────────────────────
// Замена мега-TransferSheet ПО НАМЕРЕНИЮ: одна форма, направление всегда
// PC→X. «Что» — деньги/предмет, «Кому» — игрок или общак. «Забрать ИЗ
// общака» — не глагол игрока «передал», он живёт в табе Партия (W4).

export function GiveSheet({ app, prefill, onClose, onDone }: ActionSheetProps) {
  const { supabase, campaignId, loopNumber, activePc, characters } = app
  const others = characters.filter((c) => c.id !== activePc.id)

  const [what, setWhat] = useState<'money' | 'item'>(
    prefill?.what === 'item' ? 'item' : 'money',
  )
  const [dest, setDest] = useState<'player' | 'stash'>(() =>
    others.length === 0 ? 'stash' : 'player',
  )
  const [recipient, setRecipient] = useState(others[0]?.id ?? '')
  const [amount, setAmount] = useState(() => {
    const n = num(prefill?.amount)
    return n != null ? String(n) : ''
  })
  const [qty, setQty] = useState(() => String(num(prefill?.qty) ?? 1))
  const [items, setItems] = useState<{ name: string; qty: number }[] | null>(null)
  const [picked, setPicked] = useState(() => str(prefill?.itemName))
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Источник предметов один — сумка активного PC (направление всегда «от меня»).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await getPcItemHoldingsTg(supabase, activePc.id, loopNumber)
        if (alive) {
          setItems(list)
          setPicked((p) => (p && list.some((i) => i.name === p) ? p : (list[0]?.name ?? '')))
        }
      } catch {
        if (alive) setItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, activePc.id, loopNumber])

  const gp = parseGp(amount)
  const n = Math.max(0, parseInt(qty, 10) || 0)
  const destLabel =
    dest === 'stash' ? 'в общак' : (others.find((c) => c.id === recipient)?.title ?? '')
  const line =
    what === 'money'
      ? gp != null && destLabel
        ? `−${formatGp(gp)} → ${destLabel}`
        : null
      : picked && n >= 1 && destLabel
        ? `${picked} ×${n} → ${destLabel}`
        : null

  const submit = async () => {
    setError(null)
    if (dest === 'player' && !recipient) {
      setError('Выберите получателя')
      return
    }

    if (what === 'item') {
      if (!picked) {
        setError('Выберите предмет')
        return
      }
      if (n < 1) {
        setError('Количество ≥ 1')
        return
      }
      const avail = items?.find((i) => i.name === picked)?.qty ?? 0
      if (n > avail) {
        setError(`У тебя только ${avail}`)
        return
      }
      setBusy(true)
      const res =
        dest === 'player'
          ? await createItemTransfer({
              campaignId,
              senderPcId: activePc.id,
              recipientPcId: recipient,
              itemName: picked,
              qty: n,
              categorySlug: 'transfer',
              comment: comment.trim(),
              loopNumber,
              dayInLoop: QUICK_ACTION_DAY,
              notify: true,
            })
          : await putItemIntoStash({
              campaignId,
              actorPcId: activePc.id,
              itemName: picked,
              qty: n,
              comment: comment.trim(),
              loopNumber,
              dayInLoop: QUICK_ACTION_DAY,
            })
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDone(`🤝 ${line}`)
      onClose()
      return
    }

    // money
    if (gp == null) {
      setError('Введите сумму в зм')
      return
    }
    setBusy(true)
    const res =
      dest === 'player'
        ? await createTransfer({
            campaignId,
            senderPcId: activePc.id,
            recipientPcId: recipient,
            amountGp: gp,
            categorySlug: 'transfer',
            comment: comment.trim(),
            loopNumber,
            dayInLoop: QUICK_ACTION_DAY,
            notify: true,
          })
        : await putMoneyIntoStash({
            campaignId,
            actorPcId: activePc.id,
            amountGp: gp,
            comment: comment.trim(),
            loopNumber,
            dayInLoop: QUICK_ACTION_DAY,
          })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(`🤝 ${line}`)
    onClose()
  }

  return (
    <Sheet title="🤝 Передал" onClose={onClose}>
      <div className="space-y-3">
        <SegToggle
          value={what}
          onChange={(w) => {
            setWhat(w)
            setError(null)
          }}
          options={[
            { value: 'money', label: 'Деньги' },
            { value: 'item', label: 'Предмет' },
          ]}
        />
        <SegToggle
          value={dest}
          onChange={setDest}
          options={[
            { value: 'player', label: 'Игроку' },
            { value: 'stash', label: 'В общак' },
          ]}
        />

        {dest === 'player' &&
          (others.length > 0 ? (
            <select
              className={FIELD}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-neutral-500">Нет других персонажей.</p>
          ))}

        {what === 'money' ? (
          <input
            className={FIELD}
            inputMode="decimal"
            placeholder="Сумма, зм"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        ) : (
          <>
            {items === null ? (
              <p className="text-sm text-neutral-500">Загрузка…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-neutral-500">У тебя нет предметов.</p>
            ) : (
              <select
                className={FIELD}
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              >
                {items.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name} (×{i.qty})
                  </option>
                ))}
              </select>
            )}
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="Количество"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </>
        )}

        <input
          className={FIELD}
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {line && <PreviewLine text={line} />}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        Передать
      </SubmitButton>
    </Sheet>
  )
}

// ─────────────────────────── 💱 Продал ───────────────────────────
// Новый глагол (развилка №4): предмет из сумки активного PC → сумма зм.
// Дефолт суммы — каталожная price_gp × qty (пустое поле = дефолт, число в
// плейсхолдере и в превью); правится вручную, 0 допустим («отдал даром»).
// Сабмит — sellPcItem (app/actions/sell.ts): −qty предмета + доход одной
// связкой transfer_group_id.

/** «Сумма продажи»: ≥ 0 (в отличие от parseGp, ноль разрешён). */
function parseSellGp(raw: string): number | null {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function SellSheet({ app, prefill, onClose, onDone }: ActionSheetProps) {
  const { supabase, campaignId, loopNumber, activePc } = app
  const [items, setItems] = useState<{ name: string; qty: number }[] | null>(null)
  const [picked, setPicked] = useState(() => str(prefill?.itemName))
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [catalog, setCatalog] = useState<{ id: string; priceGp: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Сумка активного PC — тот же источник, что InventoryScreen/TransferSheet
  // (getPcItemHoldingsTg: net-количества за петлю, только > 0).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await getPcItemHoldingsTg(supabase, activePc.id, loopNumber)
        if (alive) {
          setItems(list)
          setPicked((p) => (p && list.some((i) => i.name === p) ? p : (list[0]?.name ?? '')))
        }
      } catch {
        if (alive) setItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, activePc.id, loopNumber])

  // Каталожная привязка выбранного имени: точное совпадение title даёт
  // node id (для sellPcItem.itemNodeId) + номинал price_gp для дефолта.
  // Холдинги ключуются по имени — free-text предметы просто не матчатся.
  useEffect(() => {
    if (!picked) return
    let alive = true
    ;(async () => {
      try {
        const results = await searchBuyableItemsTg(supabase, campaignId, picked)
        const exact = results.find((r) => r.title === picked)
        if (alive) setCatalog(exact ? { id: exact.id, priceGp: exact.priceGp } : null)
      } catch {
        if (alive) setCatalog(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [picked, supabase, campaignId])

  const n = Math.max(0, parseInt(qty, 10) || 0)
  const defaultGp =
    catalog?.priceGp != null && n >= 1 ? catalog.priceGp * n : null
  const manualGp = price.trim() === '' ? null : parseSellGp(price)
  const soldGp = manualGp ?? defaultGp
  const line =
    picked && n >= 1 && soldGp != null
      ? `−${picked} ×${n} · +${formatGp(Math.round(soldGp))}`
      : null

  const submit = async () => {
    setError(null)
    if (!picked) {
      setError('Выберите предмет')
      return
    }
    if (n < 1) {
      setError('Количество ≥ 1')
      return
    }
    const avail = items?.find((i) => i.name === picked)?.qty ?? 0
    if (n > avail) {
      setError(`В сумке только ${avail}`)
      return
    }
    if (soldGp == null) {
      setError('Укажите сумму продажи в зм')
      return
    }
    setBusy(true)
    const res = await sellPcItem({
      campaignId,
      pcId: activePc.id,
      itemNodeId: catalog?.id ?? null,
      itemName: picked,
      qty: n,
      soldGp,
      loopNumber,
      dayInLoop: QUICK_ACTION_DAY,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(`💱 ${picked} ×${n} · +${formatGp(res.soldGp)}`)
    onClose()
  }

  return (
    <Sheet title="💱 Продал" onClose={onClose}>
      <div className="space-y-3">
        {items === null ? (
          <p className="text-sm text-neutral-500">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-500">В сумке пусто — продавать нечего.</p>
        ) : (
          <>
            <select
              className={FIELD}
              value={picked}
              onChange={(e) => {
                setPicked(e.target.value)
                setError(null)
              }}
            >
              {items.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name} (×{i.qty})
                </option>
              ))}
            </select>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="Количество"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder={
                defaultGp != null
                  ? `Сумма, зм — по каталогу ${defaultGp}`
                  : 'Сумма, зм'
              }
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </>
        )}
      </div>
      {line && <PreviewLine text={line} />}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {items !== null && items.length > 0 && (
        <SubmitButton busy={busy} onClick={submit}>
          Продать
        </SubmitButton>
      )}
    </Sheet>
  )
}

// ─────────────────────────── ⋯ Ещё ───────────────────────────
// Редкие действия — мосты на существующие экраны (legacy-* до W5): кредит и
// стартовый набор живут на StarterEquipScreen, наборы — SetsScreen. onGo —
// nav.replace: шит-прослойка не остаётся в стеке, «назад» ведёт в корень таба.

export function MoreSheet({
  app,
  onGo,
  onClose,
}: {
  app: TgAppContext
  onGo: (screen: string) => void
  onClose: () => void
}) {
  const own = app.activePc.isOwn
  return (
    <Sheet title="⋯ Ещё" onClose={onClose}>
      <div className="space-y-2">
        {own && (
          <MoreButton
            icon="💳"
            label="Взять кредит"
            hint="кредит петли — на экране Снаряжение"
            onClick={() => onGo('legacy-equip')}
          />
        )}
        {own && (
          <MoreButton
            icon="🎽"
            label="Стартовый набор"
            hint="снаряжение начала петли"
            onClick={() => onGo('legacy-equip')}
          />
        )}
        <MoreButton
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
    </Sheet>
  )
}

function MoreButton({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-xl bg-neutral-800 px-4 py-3 text-left transition-colors hover:bg-neutral-700"
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-100">{label}</span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </button>
  )
}
