'use client'

/**
 * Таб 🎒 Персонаж (spec-058 W3): всё о моём PC на одном скролле —
 * шапка (портрет+имя) → кошелёк (WalletCard) → «Надето» (компактные
 * слоты-строки, НЕ кукла на пол-экрана — мобильный паттерн) → «Сумка» →
 * лента своих движений. Тап по предмету → ItemActionSheet с глаголами:
 * Надеть/Снять · Передать · В общак · Продал.
 *
 * Решения W3 (сшито в W5, коммит a62b0d6):
 * - «Передать» / «В общак» — единый пайплайн действий: GiveSheet из
 *   action-sheets с префиллом {what:'item', itemName, dest}.
 * - «Продал» — осознанный дубль sell-формы с W2 (W5 дедупит): qty + сумма
 *   (дефолт = каталожная цена × qty через resolveBuyUnitPriceGp, как в
 *   превью покупки) → sellPcItem.
 * - Чужой PC — read-only: кошелёк + Надето + Сумка, без ленты и экшенов.
 * - Пуш-экраны таба зарезервированы под имена 'char-*'; v1 живёт целиком
 *   в шитах — своих пуш-экранов нет.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getWalletTg,
  getFeedTg,
  getPcInventoryTg,
  searchBuyableItemsTg,
  getCampaignBuyConfigTg,
  type TgWallet,
  type TgFeedRow,
  type PcInventoryRowTg,
} from '@/lib/queries/ledger-tg'
import { resolveBuyUnitPriceGp, normalizeRarity } from '@/lib/item-purchase-policy'
import { setEquipped } from '@/app/actions/equipped'
import { sellPcItem } from '@/app/actions/sell'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatGp } from './format'
import {
  Centered,
  Avatar,
  WalletCard,
  FeedList,
  FIELD,
  Sheet,
  IntInput,
  SubmitButton,
} from './primitives'
import { useTgRefresh, type TgTabProps } from './shell'
// Единый пайплайн действий (spec-058): GiveSheet — стык W5 для глаголов
// предмета; QUICK_ACTION_DAY — общая конвенция дня (см. action-sheets).
import { GiveSheet, QUICK_ACTION_DAY } from './action-sheets'

// 5e: максимум 3 предмета с настройкой — мягкий кап (предупреждение, не блок).
const ATTUNE_CAP = 3

type CharData = {
  wallet: TgWallet
  inventory: PcInventoryRowTg[]
  feed: TgFeedRow[]
  nextCursor: string | null
}

type CharSheet =
  | { mode: 'verbs'; row: PcInventoryRowTg }
  | { mode: 'sell'; row: PcInventoryRowTg }
  | { mode: 'give'; row: PcInventoryRowTg; dest: 'player' | 'stash' }

export function CharacterTab({ app }: TgTabProps) {
  const { refreshKey, bump } = useTgRefresh()
  const { supabase, campaignId, loopNumber } = app
  const pc = app.activePc

  const [data, setData] = useState<CharData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<CharSheet | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<CharData> => {
    const [wallet, inventory, feed] = await Promise.all([
      getWalletTg(supabase, pc.id, loopNumber),
      getPcInventoryTg(supabase, campaignId, pc.id, loopNumber),
      getFeedTg(supabase, pc.id, loopNumber, { limit: 25 }),
    ])
    return { wallet, inventory, feed: feed.rows, nextCursor: feed.nextCursor }
  }, [supabase, campaignId, loopNumber, pc.id])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const d = await load()
        if (alive) setData(d)
      } catch {
        if (alive) setError('Не удалось загрузить персонажа.')
      }
    })()
    return () => {
      alive = false
    }
  }, [load, refreshKey])

  const reload = useCallback(async () => {
    try {
      setData(await load())
    } catch {
      // Экран уже показывает прошлые данные; realtime/refreshKey добьёт.
    }
  }, [load])

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const more = await getFeedTg(supabase, pc.id, loopNumber, {
        before: data.nextCursor,
        limit: 25,
      })
      setData((d) =>
        d ? { ...d, feed: [...d.feed, ...more.rows], nextCursor: more.nextCursor } : d,
      )
    } catch {
      setMoreError('Не удалось подгрузить — нажми ещё раз.')
    } finally {
      setLoadingMore(false)
    }
  }, [data, loadingMore, supabase, pc.id, loopNumber])

  // Тост живёт в цепочке обработчика (не в эффекте) — паттерн ledger-app.
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  // ── глаголы предмета ──

  const toggleEquip = async (row: PcInventoryRowTg): Promise<string | null> => {
    const res = await setEquipped({
      campaignId,
      pcId: pc.id,
      itemName: row.name,
      loopNumber,
      equipped: !row.equipped,
    })
    if (!res.ok) return res.error
    setSheet(null)
    showToast(row.equipped ? `Снято: ${row.name}` : `Надето: ${row.name}`)
    bump() // мутация без transaction-строки — realtime не пнёт, толкаем сами
    return null
  }

  // «Передать» и «В общак» — единый пайплайн действий (spec-058 W5):
  // GiveSheet из action-sheets с префиллом предмета и направления.
  const openGive = (row: PcInventoryRowTg, dest: 'player' | 'stash') => {
    setSheet({ mode: 'give', row, dest })
  }

  const submitSell = async (args: {
    row: PcInventoryRowTg
    qty: number
    soldGp: number
    itemNodeId: string | null
  }): Promise<string | null> => {
    const res = await sellPcItem({
      campaignId,
      pcId: pc.id,
      itemNodeId: args.itemNodeId,
      itemName: args.row.name,
      qty: args.qty,
      soldGp: args.soldGp,
      loopNumber,
      dayInLoop: QUICK_ACTION_DAY,
    })
    if (!res.ok) return res.error
    setSheet(null)
    showToast(
      res.soldGp > 0
        ? `Продано: ${args.row.name} ×${args.qty} · +${res.soldGp} зм`
        : `Отдано: ${args.row.name} ×${args.qty}`,
    )
    void reload() // продажа создаёт tx → realtime тоже пнёт, но не полагаемся
    return null
  }

  // ── render ──

  const equipped = (data?.inventory ?? []).filter((r) => r.equipped)
  const carried = (data?.inventory ?? []).filter((r) => !r.equipped)
  const attunedCount = equipped.filter((r) => r.requiresAttunement).length
  return (
    <div className="pb-6">
      {/* Шапка PC: портрет + имя. */}
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={pc.title} keyStr={pc.primaryPortraitKey} size={64} />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{pc.title}</div>
        </div>
      </div>

      {error && <Centered>{error}</Centered>}
      {!error && !data && <Centered>Загрузка…</Centered>}
      {data && (
        <div className="space-y-4">
          <WalletCard wallet={data.wallet} />

          {attunedCount > ATTUNE_CAP && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Настроено {attunedCount} из {ATTUNE_CAP} — превышен лимит (5e:
              максимум 3 предмета с настройкой). Это просто предупреждение.
            </div>
          )}

          <CharSection title="Надето">
            {equipped.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-neutral-500">Ничего не надето.</div>
            ) : (
              equipped.map((r) => (
                <ItemRow
                  key={r.name}
                  row={r}
                  icon="🎽"
                  onTap={() => setSheet({ mode: 'verbs', row: r })}
                />
              ))
            )}
          </CharSection>

          <CharSection title="Сумка">
            {data.inventory.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-neutral-500">
                Пусто. Предметы появятся после покупок и переводов.
              </div>
            ) : carried.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-neutral-500">— всё надето —</div>
            ) : (
              carried.map((r) => (
                <ItemRow
                  key={r.name}
                  row={r}
                  icon="🎒"
                  onTap={() => setSheet({ mode: 'verbs', row: r })}
                />
              ))
            )}
          </CharSection>

          <div>
              <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Движения
              </h2>
              <FeedList rows={data.feed} categories={app.categories} />
              {data.nextCursor && (
                <button
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="mt-3 w-full rounded-lg bg-neutral-900 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loadingMore ? 'Загрузка…' : 'Показать ещё'}
                </button>
              )}
              {moreError && (
                <p className="mt-2 text-center text-xs text-red-400">{moreError}</p>
              )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {sheet?.mode === 'verbs' && (
        <ItemActionSheet
          row={sheet.row}
          onToggleEquip={() => toggleEquip(sheet.row)}
          onTransfer={() => openGive(sheet.row, 'player')}
          onToStash={() => openGive(sheet.row, 'stash')}
          onSell={() => setSheet({ mode: 'sell', row: sheet.row })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.mode === 'give' && (
        <GiveSheet
          app={app}
          prefill={{ what: 'item', itemName: sheet.row.name, dest: sheet.dest }}
          onClose={() => setSheet(null)}
          onDone={(t) => {
            setSheet(null)
            showToast(t)
            void reload()
          }}
        />
      )}
      {sheet?.mode === 'sell' && (
        <SellItemSheet
          supabase={supabase}
          campaignId={campaignId}
          row={sheet.row}
          onSubmit={(args) => submitSell({ row: sheet.row, ...args })}
          onClose={() => setSheet({ mode: 'verbs', row: sheet.row })}
        />
      )}
    </div>
  )
}

// ─────────────────────────── секции и строки ───────────────────────────

function CharSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="overflow-hidden rounded-lg bg-neutral-900">{children}</div>
    </div>
  )
}

function ItemRow({
  row,
  icon,
  onTap,
}: {
  row: PcInventoryRowTg
  icon: string
  onTap?: () => void
}) {
  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="shrink-0 text-base leading-none">
          {icon}
        </span>
        <span className="truncate text-sm text-neutral-100">{row.name}</span>
        {row.requiresAttunement && (
          <span title="Требует настройки" className="shrink-0 text-xs text-amber-400/80">
            ✦
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-sm tabular-nums text-neutral-400">×{row.qty}</span>
        {onTap && <span className="text-xs text-neutral-600">›</span>}
      </div>
    </>
  )
  if (!onTap) {
    return (
      <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 last:border-0">
        {inner}
      </div>
    )
  }
  return (
    <button
      onClick={onTap}
      className="flex min-h-[44px] w-full items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 text-left transition-colors last:border-0 hover:bg-neutral-800"
    >
      {inner}
    </button>
  )
}

// ─────────────────────────── ItemActionSheet ───────────────────────────

// Глаголы предмета (Sheet R2). Достижим только на своём PC — гейт на строках.
function ItemActionSheet({
  row,
  onToggleEquip,
  onTransfer,
  onToStash,
  onSell,
  onClose,
}: {
  row: PcInventoryRowTg
  onToggleEquip: () => Promise<string | null>
  onTransfer: () => void
  onToStash: () => void
  onSell: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const equip = async () => {
    setBusy(true)
    setError(null)
    const err = await onToggleEquip()
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Sheet title={`${row.name}${row.qty !== 1 ? ` ×${row.qty}` : ''}`} onClose={onClose}>
      <div className="space-y-2">
        <VerbButton
          icon="🎽"
          label={row.equipped ? 'Снять' : 'Надеть'}
          busy={busy}
          onClick={() => void equip()}
        />
        <VerbButton icon="🤝" label="Передать" onClick={onTransfer} />
        <VerbButton icon="🏰" label="В общак" onClick={onToStash} />
        <VerbButton icon="💱" label="Продал" onClick={onSell} />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </Sheet>
  )
}

function VerbButton({
  icon,
  label,
  hint,
  busy,
  onClick,
}: {
  icon: string
  label: string
  hint?: string
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex min-h-[48px] w-full items-center gap-3 rounded-lg bg-neutral-800 px-3 py-2.5 text-left transition-colors hover:bg-neutral-700 disabled:opacity-50"
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-neutral-100">{busy ? '…' : label}</span>
        {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
      </span>
    </button>
  )
}

// ─────────────────────────── «Продал» — мини-форма ───────────────────────────

// Осознанный дубль sell-формы W2 (W5 дедупит). Дефолт суммы = каталожная
// цена × qty: точное совпадение имени в каталоге + resolveBuyUnitPriceGp
// (та же математика, что в превью покупки). Сумма редактируется — модель
// доверия sellPcItem: цену называет игрок, ДМ видит в ленте.
function SellItemSheet({
  supabase,
  campaignId,
  row,
  onSubmit,
  onClose,
}: {
  supabase: SupabaseClient
  campaignId: string
  row: PcInventoryRowTg
  onSubmit: (args: { qty: number; soldGp: number; itemNodeId: string | null }) => Promise<string | null>
  onClose: () => void
}) {
  const [qty, setQty] = useState(1)
  // null = игрок ещё не трогал поле → показываем derived-дефолт (unit × qty).
  const [amountRaw, setAmountRaw] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<{ unitGp: number | null; itemNodeId: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cfg, matches] = await Promise.all([
          getCampaignBuyConfigTg(supabase, campaignId),
          searchBuyableItemsTg(supabase, campaignId, row.name, 12),
        ])
        const exact =
          matches.find(
            (m) => m.title.trim().toLowerCase() === row.name.trim().toLowerCase(),
          ) ?? null
        const unitGp = exact
          ? resolveBuyUnitPriceGp({
              priceGp: exact.priceGp,
              categorySlug: exact.categorySlug,
              rarity: normalizeRarity(exact.rarity),
              defaults: cfg.defaults,
              policy: cfg.policy,
            })
          : null
        if (alive) setCatalog({ unitGp, itemNodeId: exact?.id ?? null })
      } catch {
        if (alive) setCatalog({ unitGp: null, itemNodeId: null })
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, row.name])

  const unitGp = catalog?.unitGp ?? null
  const amount = amountRaw ?? (unitGp != null ? String(unitGp * qty) : '')

  const submit = async () => {
    setError(null)
    if (qty > row.qty) {
      setError(`У тебя только ${row.qty}`)
      return
    }
    const n = Number(amount.replace(',', '.'))
    if (amount.trim() === '' || !Number.isFinite(n) || n < 0) {
      setError('Введите сумму в зм (0 — отдал даром)')
      return
    }
    setBusy(true)
    const err = await onSubmit({ qty, soldGp: n, itemNodeId: catalog?.itemNodeId ?? null })
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Sheet title={`Продал — ${row.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-neutral-400">Сколько (есть ×{row.qty})</span>
          <IntInput value={qty} onCommit={setQty} className={FIELD + ' max-w-[6rem] text-center'} />
        </div>
        <input
          className={FIELD}
          inputMode="decimal"
          placeholder="Сумма всего, зм"
          value={amount}
          onChange={(e) => setAmountRaw(e.target.value)}
        />
        <p className="text-xs text-neutral-500">
          {catalog === null
            ? 'Ищу цену в каталоге…'
            : unitGp != null
              ? `Каталог: ${formatGp(unitGp)}/шт — сумму можно поправить`
              : 'В каталоге цены нет — впиши сумму (0 = отдал даром)'}
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={() => void submit()}>
        Продать ×{qty}
      </SubmitButton>
    </Sheet>
  )
}
