'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createItemAction, updateItemAction, deleteItemAction } from '@/app/actions/items'
import type { ItemDefaultPrices, RarityKey } from '@/lib/item-default-prices'
import type { ItemPayload, Rarity } from '@/lib/items-types'
import type { Category } from '@/lib/transactions'

const RARITY_OPTIONS: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'very-rare', label: 'Very Rare' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'artifact', label: 'Artifact' },
]

type Props = {
  campaignId: string
  campaignSlug: string
  /** When set, we're editing an existing item; else creating. */
  itemId?: string
  /** Linked-tx count chip (FR-030). Edit mode only. */
  linkedTxCount?: number
  initial: ItemPayload
  categories: Category[]
  slots: Category[]
  sources: Category[]
  availabilities: Category[]
  /**
   * Spec-015 follow-up (chat 70). DM-curated default prices per
   * rarity (split into magic / consumable buckets). When the user
   * picks a rarity AND the price field is empty, we prefill from
   * here. Empty / no match → no prefill, behaviour unchanged.
   */
  defaultPrices: ItemDefaultPrices
}

/**
 * Pick the matching default price bucket given the chosen category.
 * Catalog uses the slug `consumable` for расходники; everything else
 * (magic-item, wondrous, weapon, armor, …) maps to the magic bucket.
 * Returning null means "don't auto-fill for this combo".
 */
function lookupDefaultPrice(
  defaults: ItemDefaultPrices,
  categorySlug: string,
  rarity: Rarity | '',
): number | null {
  if (!rarity) return null
  // 'artifact' is in the Rarity union but not in the 5-key default
  // table — DM tunes only the common…legendary band, artifacts stay
  // free-text.
  if (!(rarity in defaults.magic)) return null
  const bucket: keyof ItemDefaultPrices =
    categorySlug === 'consumable' ? 'consumable' : 'magic'
  return defaults[bucket][rarity as RarityKey]
}

/**
 * Shared item create/edit form — used by `/items/new` and
 * `/items/[id]/edit`. Hand-rolled form state (codebase convention,
 * no React Hook Form). Submits via server action.
 */
export default function ItemFormPage({
  campaignId,
  campaignSlug,
  itemId,
  linkedTxCount,
  initial,
  categories,
  slots,
  sources,
  availabilities,
  defaultPrices,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [title, setTitle] = useState(initial.title)
  const [categorySlug, setCategorySlug] = useState(initial.categorySlug)
  const [rarity, setRarity] = useState<Rarity | ''>(initial.rarity ?? '')
  const [priceGp, setPriceGp] = useState<string>(
    initial.priceGp !== null ? String(initial.priceGp) : '',
  )
  const [weightLb, setWeightLb] = useState<string>(
    initial.weightLb !== null ? String(initial.weightLb) : '',
  )
  const [slotSlug, setSlotSlug] = useState(initial.slotSlug ?? '')
  const [sourceSlug, setSourceSlug] = useState(initial.sourceSlug ?? '')
  const [availabilitySlug, setAvailabilitySlug] = useState(
    initial.availabilitySlug ?? '',
  )
  const [srdSlug, setSrdSlug] = useState(initial.srdSlug ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [sourceDetail, setSourceDetail] = useState(initial.sourceDetail ?? '')
  /**
   * 5e «Требует настройки». Set explicitly via checkbox; attunement
   * for SRD items is also pre-marked at seed level.
   */
  const [requiresAttunement, setRequiresAttunement] = useState(
    initial.requiresAttunement ?? false,
  )

  /**
   * Apply rarity change and prefill price from defaults if empty.
   * `use_default_price` is now auto-managed (computed server-side
   * at create/update by comparing price vs baseline), so the prefill
   * is always active — no opt-out gate.
   */
  function handleRarityChange(next: Rarity | '') {
    setRarity(next)
    if (priceGp.trim() === '') {
      const def = lookupDefaultPrice(defaultPrices, categorySlug, next)
      if (def !== null) setPriceGp(String(def))
    }
  }

  /**
   * Same defaulting on category change — switching to/from
   * `consumable` flips the bucket. Always active (auto-flag).
   */
  function handleCategoryChange(next: string) {
    setCategorySlug(next)
    if (priceGp.trim() === '') {
      const def = lookupDefaultPrice(defaultPrices, next, rarity)
      if (def !== null) setPriceGp(String(def))
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const payload: ItemPayload = {
      title: title.trim(),
      categorySlug,
      rarity: rarity || null,
      priceGp: priceGp.trim() === '' ? null : Number(priceGp),
      weightLb: weightLb.trim() === '' ? null : Number(weightLb),
      slotSlug: slotSlug || null,
      sourceSlug: sourceSlug || null,
      availabilitySlug: availabilitySlug || null,
      srdSlug: srdSlug.trim() === '' ? null : srdSlug.trim(),
      description: description.trim() === '' ? null : description,
      sourceDetail: sourceDetail.trim() === '' ? null : sourceDetail.trim(),
      requiresAttunement,
    }

    startTransition(async () => {
      if (itemId) {
        const res = await updateItemAction(campaignId, itemId, payload)
        if (!res.ok) {
          setError(res.error)
          return
        }
        router.push(`/c/${campaignSlug}/items/${itemId}`)
      } else {
        const res = await createItemAction(campaignId, payload)
        if (!res.ok) {
          setError(res.error)
          return
        }
        router.push(`/c/${campaignSlug}/items/${res.itemId}`)
      }
    })
  }

  const onDelete = () => {
    if (!itemId) return
    setError(null)
    startTransition(async () => {
      const res = await deleteItemAction(campaignId, itemId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/c/${campaignSlug}/items`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">
          {itemId ? 'Редактирование предмета' : 'Новый предмет'}
        </h1>
        {itemId && typeof linkedTxCount === 'number' && linkedTxCount > 0 && (
          <p className="mt-1 text-sm text-gray-500">
            На этот образец ссылается{' '}
            <strong className="text-gray-800">{linkedTxCount}</strong>{' '}
            {linkedTxCount === 1 ? 'транзакция' : 'транзакций'} — изменения
            отразятся в каталоге и ленте.
          </p>
        )}
      </header>

      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
          />
        </Field>

        <Field label="Категория" required>
          <select
            value={categorySlug}
            onChange={(e) => handleCategoryChange(e.target.value)}
            required
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">— выбрать —</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Редкость">
          <select
            value={rarity}
            onChange={(e) => handleRarityChange(e.target.value as Rarity | '')}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">— нет / без редкости —</option>
            {RARITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Слот">
          <select
            value={slotSlug}
            onChange={(e) => setSlotSlug(e.target.value)}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">— не занимает —</option>
            {slots.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={requiresAttunement}
              onChange={(e) => setRequiresAttunement(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            <span>Требует настройки</span>
            <span
              className="cursor-help text-gray-400"
              title="5e «Требует настройки» (attunement). Магические предметы, требующие настройки на одного владельца."
            >
              ⓘ
            </span>
          </label>
        </Field>

        <Field label="Цена, gp">
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceGp}
            onChange={(e) => setPriceGp(e.target.value)}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          />
        </Field>

        <Field label="Вес, lb">
          <input
            type="number"
            min="0"
            step="0.01"
            value={weightLb}
            onChange={(e) => setWeightLb(e.target.value)}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          />
        </Field>

        <Field label="Источник">
          <select
            value={sourceSlug}
            onChange={(e) => setSourceSlug(e.target.value)}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">— нет —</option>
            {sources.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Доступность">
          <select
            value={availabilitySlug}
            onChange={(e) => setAvailabilitySlug(e.target.value)}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">— нет —</option>
            {availabilities.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="SRD slug">
          <input
            type="text"
            value={srdSlug}
            onChange={(e) => setSrdSlug(e.target.value)}
            placeholder="longsword"
            maxLength={80}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          />
        </Field>

        <Field label="Детали источника">
          <input
            type="text"
            value={sourceDetail}
            onChange={(e) => setSourceDetail(e.target.value)}
            placeholder='Tasha, p. 142'
            maxLength={200}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
          />
        </Field>
      </div>

      <Field label="Описание">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          maxLength={4000}
          className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
        />
      </Field>

      <footer className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? 'Сохраняю…' : itemId ? 'Сохранить' : 'Создать'}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          disabled={pending}
          className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400"
        >
          Отмена
        </button>

        {itemId && (
          <div className="ml-auto flex items-center gap-2">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                className="text-xs text-rose-700 hover:text-rose-700"
              >
                Удалить предмет
              </button>
            ) : (
              <>
                <span className="text-xs text-gray-500">Удалить?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
                >
                  Нет
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  className="rounded bg-rose-600 px-2 py-1 text-xs text-gray-900 hover:bg-rose-600 disabled:opacity-60"
                >
                  Да, удалить
                </button>
              </>
            )}
          </div>
        )}
      </footer>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">
        {label}
        {required && <span className="ml-1 text-rose-700">*</span>}
      </span>
      {children}
    </label>
  )
}

export const EMPTY_PAYLOAD: ItemPayload = {
  title: '',
  categorySlug: '',
  rarity: null,
  priceGp: null,
  weightLb: null,
  slotSlug: null,
  sourceSlug: null,
  availabilitySlug: null,
  srdSlug: null,
  description: null,
  sourceDetail: null,
  requiresAttunement: false,
}
