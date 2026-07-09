'use client'

/**
 * Spec-056 (T9). DM-facing editor for craft settings: the gp/hour
 * investment rate per proficiency bonus, per-rarity craft costs + party
 * level gates, the custom-schema row, the shop markup and the weave
 * (вплетение) knobs. Debounced (400ms) save via updateCraftSettings —
 * same pattern as ItemPurchasePolicyEditor.
 */

import { useEffect, useRef, useState } from 'react'

import { updateCraftSettings } from '@/app/c/[slug]/settings/actions'
import {
  DEFAULT_CRAFT_SETTINGS,
  type CraftRarityRow,
  type CraftSettings,
  type PbKey,
} from '@/lib/craft-settings'
import { RARITY_KEYS, type RarityKey } from '@/lib/item-default-prices'

const RARITY_LABEL: Record<RarityKey, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
}

const PB_KEYS: readonly PbKey[] = ['2', '3', '4', '5', '6']

/**
 * Parse a numeric cell: '' → fallback (the shipped default), invalid or
 * negative → null (reject, keep prior value) — setCoefficient pattern.
 */
function parseCell(raw: string, fallback: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return fallback
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : null
}

type Props = {
  campaignSlug: string
  initial: CraftSettings
  canEdit: boolean
}

export default function CraftSettingsEditor({
  campaignSlug,
  initial,
  canEdit,
}: Props) {
  const [settings, setSettings] = useState<CraftSettings>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function schedulePersist(next: CraftSettings) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (fadeRef.current) clearTimeout(fadeRef.current)
    setStatus('saving')
    debounceRef.current = setTimeout(async () => {
      const r = await updateCraftSettings(campaignSlug, next)
      if (r.ok) {
        setStatus('saved')
        setErrorMsg(null)
        fadeRef.current = setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setErrorMsg(r.error)
      }
    }, 400)
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    },
    [],
  )

  function apply(next: CraftSettings) {
    setSettings(next)
    schedulePersist(next)
  }

  function setRate(pb: PbKey, raw: string) {
    const v = parseCell(raw, DEFAULT_CRAFT_SETTINGS.ratePerPbGpHour[pb])
    if (v === null) return
    apply({
      ...settings,
      ratePerPbGpHour: { ...settings.ratePerPbGpHour, [pb]: v },
    })
  }

  function setRarityCell(
    rarity: RarityKey,
    key: keyof CraftRarityRow,
    raw: string,
  ) {
    const v = parseCell(raw, DEFAULT_CRAFT_SETTINGS.rarity[rarity][key])
    if (v === null) return
    apply({
      ...settings,
      rarity: {
        ...settings.rarity,
        [rarity]: {
          ...settings.rarity[rarity],
          [key]: key === 'minPartyLevel' ? Math.trunc(v) : v,
        },
      },
    })
  }

  function setCustomCost(key: 'fullCostGp' | 'workCostGp', raw: string) {
    const v = parseCell(raw, DEFAULT_CRAFT_SETTINGS.custom[key])
    if (v === null) return
    apply({ ...settings, custom: { ...settings.custom, [key]: v } })
  }

  function setCustomMinLevel(raw: string) {
    // Optional gate: empty = null = «нет гейта» (custom schemas may skip it).
    const trimmed = raw.trim()
    if (trimmed === '') {
      apply({ ...settings, custom: { ...settings.custom, minPartyLevel: null } })
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0) return
    apply({
      ...settings,
      custom: { ...settings.custom, minPartyLevel: Math.trunc(n) },
    })
  }

  function setMarkup(raw: string) {
    const v = parseCell(raw, DEFAULT_CRAFT_SETTINGS.shopMarkup)
    if (v === null || v === 0) return
    apply({ ...settings, shopMarkup: v })
  }

  function setWeave(key: 'perLevelStepGp' | 'cellCap', raw: string) {
    const v = parseCell(raw, DEFAULT_CRAFT_SETTINGS.weave[key])
    if (v === null) return
    apply({
      ...settings,
      weave: {
        ...settings.weave,
        [key]: key === 'cellCap' ? Math.trunc(v) : v,
      },
    })
  }

  const cellCls =
    'w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right font-mono text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500'
  const headCls = 'border-b border-gray-200 text-left text-xs text-gray-500'

  return (
    <div className="space-y-4">
      {/* ── 1. Ставка вложения: зм/час по БМ ─────────────────────────── */}
      <div>
        <p className="mb-2 text-xs text-gray-500">
          Сколько зм стоимости изделия крафтер вкладывает за час работы, в
          зависимости от его бонуса мастерства (БМ следует из уровня партии
          на петле).
        </p>
        <div className="rounded border border-gray-200 bg-white p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className={headCls}>
                <th className="py-1.5 pr-2 font-medium">БМ</th>
                <th className="py-1.5 text-right font-medium">зм/час</th>
              </tr>
            </thead>
            <tbody>
              {PB_KEYS.map((pb) => (
                <tr key={pb} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-1.5 pr-2 text-gray-700">+{pb}</td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.5"
                      value={settings.ratePerPbGpHour[pb]}
                      disabled={!canEdit}
                      onChange={(e) => setRate(pb, e.target.value)}
                      aria-label={`БМ +${pb} — зм/час`}
                      className={cellCls}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 2–3. Цены и гейты по редкостям + кастомная строка ────────── */}
      <div>
        <p className="mb-2 text-xs text-gray-500">
          Полная цена — справочная (со схемой, без факультатива). Рабочая —
          применяется при крафте. Мин. уровень — гейт по уровню партии.
          «Кастомная» — для схем без редкости (вплетённые и др.); её мин.
          уровень можно оставить пустым (без гейта).
        </p>
        <div className="rounded border border-gray-200 bg-white p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className={headCls}>
                <th className="py-1.5 pr-2 font-medium">Редкость</th>
                <th className="py-1.5 pr-2 text-right font-medium">Полная, зм</th>
                <th className="py-1.5 pr-2 text-right font-medium">Рабочая, зм</th>
                <th className="py-1.5 text-right font-medium">Мин. уровень</th>
              </tr>
            </thead>
            <tbody>
              {RARITY_KEYS.map((r) => (
                <tr key={r} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2 text-gray-700">{RARITY_LABEL[r]}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={settings.rarity[r].fullCostGp}
                      disabled={!canEdit}
                      onChange={(e) => setRarityCell(r, 'fullCostGp', e.target.value)}
                      aria-label={`${RARITY_LABEL[r]} — полная цена`}
                      className={cellCls}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={settings.rarity[r].workCostGp}
                      disabled={!canEdit}
                      onChange={(e) => setRarityCell(r, 'workCostGp', e.target.value)}
                      aria-label={`${RARITY_LABEL[r]} — рабочая цена`}
                      className={cellCls}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={settings.rarity[r].minPartyLevel}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setRarityCell(r, 'minPartyLevel', e.target.value)
                      }
                      aria-label={`${RARITY_LABEL[r]} — минимальный уровень партии`}
                      className={cellCls}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-200">
                <td className="py-1.5 pr-2 text-gray-700">Кастомная</td>
                <td className="py-1.5 pr-2 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={settings.custom.fullCostGp}
                    disabled={!canEdit}
                    onChange={(e) => setCustomCost('fullCostGp', e.target.value)}
                    aria-label="Кастомная — полная цена"
                    className={cellCls}
                  />
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={settings.custom.workCostGp}
                    disabled={!canEdit}
                    onChange={(e) => setCustomCost('workCostGp', e.target.value)}
                    aria-label="Кастомная — рабочая цена"
                    className={cellCls}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    value={settings.custom.minPartyLevel ?? ''}
                    placeholder="—"
                    disabled={!canEdit}
                    onChange={(e) => setCustomMinLevel(e.target.value)}
                    aria-label="Кастомная — минимальный уровень партии (пусто = без гейта)"
                    className={cellCls}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 4. Наценка магазина ───────────────────────────────────────── */}
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">Наценка магазина</span>
            <p className="text-xs text-gray-500">
              Цена каталога = цена без наценки × коэффициент (крафт-цены — без
              наценки).
            </p>
          </div>
          <div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.05"
              value={settings.shopMarkup}
              disabled={!canEdit}
              onChange={(e) => setMarkup(e.target.value)}
              aria-label="Наценка магазина"
              className={cellCls}
            />
            <span className="ml-1 text-xs text-gray-400">×</span>
          </div>
        </div>
      </div>

      {/* ── 5. Вплетение ──────────────────────────────────────────────── */}
      <div className="rounded border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">
              Вплетение: шаг цены за уровень
            </span>
            <p className="text-xs text-gray-500">
              Надбавка к цене крафта = шаг × (макс. уровень заклинания + 1).
            </p>
          </div>
          <div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              value={settings.weave.perLevelStepGp}
              disabled={!canEdit}
              onChange={(e) => setWeave('perLevelStepGp', e.target.value)}
              aria-label="Вплетение — шаг цены за уровень, зм"
              className={cellCls}
            />
            <span className="ml-1 text-xs text-gray-400">зм</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">
              Вплетение: потолок ячеек
            </span>
            <p className="text-xs text-gray-500">
              Лимит суммарных уровней вплетённого списка и дневного пула
              использования.
            </p>
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={settings.weave.cellCap}
            disabled={!canEdit}
            onChange={(e) => setWeave('cellCap', e.target.value)}
            aria-label="Вплетение — потолок ячеек"
            className={cellCls}
          />
        </div>
      </div>

      <div className="text-xs">
        {status === 'saving' && <span className="text-gray-400">Сохранение…</span>}
        {status === 'saved' && <span className="text-green-700">✓ Сохранено</span>}
        {status === 'error' && (
          <span className="text-red-700">Ошибка: {errorMsg}</span>
        )}
      </div>
    </div>
  )
}
