'use client'

/**
 * Spec-059. DM-facing editor for spell settings: три числа-механики —
 * переподготовка (зм × уровень нового заклинания, house-правило) и
 * копирование в книгу (зм × уровень + часов × уровень, RAW волшебника).
 * Debounced (400ms) save via updateSpellSettings — тот же паттерн, что и
 * CraftSettingsEditor.
 */

import { useEffect, useRef, useState } from 'react'

import { updateSpellSettings } from '@/app/c/[slug]/settings/actions'
import {
  DEFAULT_SPELL_SETTINGS,
  type SpellSettings,
} from '@/lib/spell-settings'

/**
 * Parse a numeric cell: '' → fallback (the shipped default), invalid or
 * negative → null (reject, keep prior value) — parseCell из CraftSettingsEditor.
 */
function parseCell(raw: string, fallback: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return fallback
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : null
}

type Props = {
  campaignSlug: string
  initial: SpellSettings
  canEdit: boolean
}

export default function SpellSettingsEditor({
  campaignSlug,
  initial,
  canEdit,
}: Props) {
  const [settings, setSettings] = useState<SpellSettings>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function schedulePersist(next: SpellSettings) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (fadeRef.current) clearTimeout(fadeRef.current)
    setStatus('saving')
    debounceRef.current = setTimeout(async () => {
      const r = await updateSpellSettings(campaignSlug, next)
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

  function apply(next: SpellSettings) {
    setSettings(next)
    schedulePersist(next)
  }

  function setField(key: keyof SpellSettings, raw: string) {
    const v = parseCell(raw, DEFAULT_SPELL_SETTINGS[key])
    if (v === null) return
    apply({ ...settings, [key]: v })
  }

  const cellCls =
    'w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right font-mono text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-200 bg-white p-3 space-y-3">
        {/* ── Переподготовка ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">
              Переподготовка: зм за уровень
            </span>
            <p className="text-xs text-gray-500">
              Цена = коэффициент × уровень нового заклинания (заговор ур.0 —
              бесплатно). House-правило.
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={settings.reprepGpPerLevel}
            disabled={!canEdit}
            onChange={(e) => setField('reprepGpPerLevel', e.target.value)}
            aria-label="Переподготовка — зм за уровень"
            className={cellCls}
          />
        </div>

        {/* ── Копирование: зм ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">
              Копирование в книгу: зм за уровень
            </span>
            <p className="text-xs text-gray-500">
              Цена = коэффициент × уровень заклинания (RAW волшебника).
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={settings.copyGpPerLevel}
            disabled={!canEdit}
            onChange={(e) => setField('copyGpPerLevel', e.target.value)}
            aria-label="Копирование в книгу — зм за уровень"
            className={cellCls}
          />
        </div>

        {/* ── Копирование: часы ───────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">
              Копирование в книгу: часов за уровень
            </span>
            <p className="text-xs text-gray-500">
              Часы = коэффициент × уровень (лог/нарратив, не гейт).
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={settings.copyHoursPerLevel}
            disabled={!canEdit}
            onChange={(e) => setField('copyHoursPerLevel', e.target.value)}
            aria-label="Копирование в книгу — часов за уровень"
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
