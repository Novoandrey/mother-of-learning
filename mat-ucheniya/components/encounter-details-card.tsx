'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  encounterId: string
  details: Record<string, string>
  disabled?: boolean
}

const DEFAULT_FIELDS = [
  { key: 'location', label: 'Локация', placeholder: 'Название локации...' },
  { key: 'description', label: 'Описание', placeholder: 'Описание сцены...' },
  { key: 'map', label: 'Карта', placeholder: 'Название карты или ссылка на YouTube...' },
  { key: 'soundtracks', label: 'Саундтреки', placeholder: 'Ссылки на плейлисты, YouTube...' },
]

export function EncounterDetailsCard({ encounterId, details: initial, disabled }: Props) {
  const [details, setDetails] = useState<Record<string, string>>(initial || {})
  const [expanded, setExpanded] = useState(hasAnyContent(initial))
  const [editingField, setEditingField] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<{ key: string; label: string }[]>(() => {
    // Discover custom fields from saved details
    const defaultKeys = new Set(DEFAULT_FIELDS.map((f) => f.key))
    return Object.keys(initial || {})
      .filter((k) => !defaultKeys.has(k) && initial[k])
      .map((k) => ({ key: k, label: k }))
  })
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')

  function hasAnyContent(d: Record<string, string> | null) {
    if (!d) return false
    return Object.values(d).some((v) => v && v.trim())
  }

  const allFields = [...DEFAULT_FIELDS, ...customFields.map((f) => ({
    key: f.key,
    label: f.label,
    placeholder: `${f.label}...`,
  }))]

  const save = useCallback(async (updated: Record<string, string>) => {
    const supabase = createClient()
    await supabase
      .from('encounters')
      .update({ details: updated })
      .eq('id', encounterId)
  }, [encounterId])

  function handleBlur(key: string, value: string) {
    setEditingField(null)
    const updated = { ...details, [key]: value }
    setDetails(updated)
    save(updated)
  }

  function addCustomField() {
    const name = newFieldName.trim()
    if (!name) return
    const key = name.toLowerCase().replace(/\s+/g, '_')
    if (allFields.some((f) => f.key === key)) return
    setCustomFields((prev) => [...prev, { key, label: name }])
    setNewFieldName('')
    setAddingField(false)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">Детали энкаунтера</span>
        <span className={`text-xs text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {allFields.map((field) => {
            const val = details[field.key] || ''
            const isEditing = editingField === field.key

            return (
              <div key={field.key}>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">{field.label}</label>
                {isEditing && !disabled ? (
                  <textarea
                    autoFocus
                    defaultValue={val}
                    onBlur={(e) => handleBlur(field.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingField(null)
                    }}
                    rows={field.key === 'description' ? 3 : 1}
                    className="w-full rounded border border-blue-400 px-2 py-1.5 text-sm focus:outline-none"
                    placeholder={field.placeholder}
                  />
                ) : (
                  <div
                    onClick={() => !disabled && setEditingField(field.key)}
                    className={`min-h-[32px] rounded border px-2 py-1.5 text-sm transition-colors ${
                      val
                        ? 'border-transparent text-gray-800 hover:border-gray-200'
                        : 'border-dashed border-gray-200 text-gray-300 hover:border-gray-300'
                    } ${disabled ? '' : 'cursor-pointer'}`}
                  >
                    {val || field.placeholder}
                  </div>
                )}
              </div>
            )
          })}

          {/* Add custom field */}
          {!disabled && (
            <div>
              {addingField ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCustomField()
                      if (e.key === 'Escape') { setAddingField(false); setNewFieldName('') }
                    }}
                    placeholder="Название поля..."
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  />
                  <button onClick={addCustomField} className="text-xs text-blue-600 hover:text-blue-800">Добавить</button>
                  <button onClick={() => { setAddingField(false); setNewFieldName('') }} className="text-xs text-gray-400">Отмена</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingField(true)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  + Добавить поле
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
