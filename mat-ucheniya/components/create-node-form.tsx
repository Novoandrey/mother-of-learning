'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'

type NodeType = {
  id: string
  slug: string
  label: string
  icon: string | null
  default_fields: Record<string, string>
}

type LoopOption = { id: string; number: number; title: string; status: string }

type ExistingNode = {
  id: string
  title: string
  fields: Record<string, unknown>
  content: string
  type_id: string
}

type Props = {
  campaignId: string
  campaignSlug: string
  editNode?: ExistingNode       // if editing existing node
  preselectedType?: string      // slug to pre-select type
}

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  description: 'Описание',
  status: 'Статус',
  player: 'Игрок',
  number: 'Номер петли',
  session_number: 'Номер сессии',
  loop_number: 'Петля',
  recap: 'Рекап',
  dm_notes: 'Заметки ДМа',
  played_at: 'Дата игры',
  game_date: 'Игровая дата',
  notes: 'Заметки',
  title: 'Подзаголовок',
  max_hp: 'Макс. HP',
  statblock_url: 'Ссылка на статблок',
  armor_class: 'Класс брони',
  challenge_rating: 'Показатель опасности',
}

// Fields that should use textarea
const TEXTAREA_FIELDS = ['description', 'recap', 'dm_notes', 'notes']

// Fields that should use number input
const NUMBER_FIELDS = ['number', 'session_number', 'max_hp', 'armor_class']

// Fields that should use URL input
const URL_FIELDS = ['statblock_url', 'link']

// Fields that should use date input
const DATE_FIELDS = ['played_at']

// Fields to hide from manual editing
const HIDDEN_FIELDS = ['tags']

// Status options for loops
const LOOP_STATUSES = [
  { value: 'past', label: 'Прошедшая' },
  { value: 'current', label: 'Текущая' },
  { value: 'future', label: 'Будущая' },
]

export function CreateNodeForm({ campaignId, campaignSlug, editNode, preselectedType }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const typeParam = preselectedType || searchParams.get('type')

  const [types, setTypes] = useState<NodeType[]>([])
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [title, setTitle] = useState(editNode?.title ?? '')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [content, setContent] = useState(editNode?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loops, setLoops] = useState<LoopOption[]>([])
  const [containsEdgeTypeId, setContainsEdgeTypeId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isEdit = !!editNode

  // Load node types
  useEffect(() => {
    supabase
      .from('node_types')
      .select('id, slug, label, icon, default_fields')
      .eq('campaign_id', campaignId)
      .order('sort_order')
      .then(({ data }) => {
        if (!data) return
        const allTypes = data as NodeType[]
        setTypes(allTypes)

        // Pre-select type from URL param or editNode
        const preSlug = editNode
          ? allTypes.find((t) => t.id === editNode.type_id)?.slug
          : typeParam
        if (preSlug) {
          const t = allTypes.find((nt) => nt.slug === preSlug)
          if (t) initType(t, editNode?.fields)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  // Load loops (for session form) and contains edge type
  useEffect(() => {
    supabase
      .from('node_types')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('slug', 'loop')
      .single()
      .then(({ data: loopType }) => {
        if (!loopType) return
        supabase
          .from('nodes')
          .select('id, title, fields')
          .eq('campaign_id', campaignId)
          .eq('type_id', loopType.id)
          .then(({ data: loopNodes }) => {
            if (loopNodes) {
              setLoops(
                loopNodes
                  .map((n: any) => ({
                    id: n.id,
                    number: Number(n.fields?.number ?? 0),
                    title: n.title,
                    status: (n.fields?.status as string) ?? 'past',
                  }))
                  .sort((a: LoopOption, b: LoopOption) => a.number - b.number)
              )
            }
          })
      })

    supabase
      .from('edge_types')
      .select('id')
      .eq('slug', 'contains')
      .eq('is_base', true)
      .single()
      .then(({ data }) => {
        if (data) setContainsEdgeTypeId(data.id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  function initType(t: NodeType, existingFields?: Record<string, unknown>) {
    setSelectedType(t)
    const defaults: Record<string, string> = {}
    if (t.default_fields) {
      Object.keys(t.default_fields).forEach((k) => {
        if (HIDDEN_FIELDS.includes(k)) return
        defaults[k] = existingFields?.[k] != null ? String(existingFields[k]) : ''
      })
    }
    setFields(defaults)
  }

  function selectType(t: NodeType) {
    initType(t)
    setTitle('')
    setContent('')
  }

  // Auto-generate title for loops and sessions
  const autoTitle = useMemo(() => {
    if (!selectedType) return ''
    if (selectedType.slug === 'loop' && fields.number) {
      return `Петля ${fields.number}`
    }
    if (selectedType.slug === 'session' && fields.session_number) {
      return `Сессия ${fields.session_number}`
    }
    return ''
  }, [selectedType, fields.number, fields.session_number])

  async function handleSubmit() {
    const finalTitle = title.trim() || autoTitle
    if (!finalTitle || !selectedType) return
    setSaving(true)
    setError('')

    const cleanFields: Record<string, unknown> = {}
    Object.entries(fields).forEach(([k, v]) => {
      const trimmed = v.trim()
      if (trimmed) {
        // Store numbers as numbers
        if (NUMBER_FIELDS.includes(k)) {
          cleanFields[k] = parseInt(trimmed) || trimmed
        } else if (k === 'loop_number' && trimmed) {
          cleanFields[k] = parseInt(trimmed) || null
        } else {
          cleanFields[k] = trimmed
        }
      }
    })

    // Preserve tags from existing node
    if (editNode?.fields?.tags) {
      cleanFields.tags = editNode.fields.tags
    }

    const payload: any = {
      campaign_id: campaignId,
      type_id: selectedType.id,
      title: finalTitle,
      fields: cleanFields,
    }

    // Only include content for types that use it (loop notes stored in content)
    if (selectedType.slug === 'loop') {
      payload.content = content.trim()
    }

    let id: string | undefined = editNode?.id
    let err

    if (isEdit && editNode?.id) {
      const { error: e } = await supabase.from('nodes').update(payload).eq('id', editNode.id)
      err = e
    } else {
      const { data, error: e } = await supabase
        .from('nodes')
        .insert(payload)
        .select('id')
        .single()
      err = e
      id = data?.id
    }

    if (err || !id) {
      setError(err?.message || 'Ошибка сохранения')
      setSaving(false)
      return
    }

    // Manage contains edge for sessions
    if (selectedType.slug === 'session' && containsEdgeTypeId) {
      // Remove existing contains edges pointing to this session
      await supabase
        .from('edges')
        .delete()
        .eq('target_id', id)
        .eq('type_id', containsEdgeTypeId)

      const ln = cleanFields.loop_number as number | null
      if (ln != null) {
        const loopNode = loops.find((l) => l.number === ln)
        if (loopNode) {
          await supabase.from('edges').upsert({
            campaign_id: campaignId,
            source_id: loopNode.id,
            target_id: id,
            type_id: containsEdgeTypeId,
          }, { onConflict: 'source_id,target_id,type_id' })
        }
      }
    }

    // Redirect based on type
    if (selectedType.slug === 'loop') {
      const num = cleanFields.number ?? fields.number
      router.push(`/c/${campaignSlug}/loops?loop=${num}`)
    } else if (selectedType.slug === 'session') {
      router.push(`/c/${campaignSlug}/sessions/${id}`)
    } else {
      router.push(`/c/${campaignSlug}/catalog/${id}`)
    }
    router.refresh()
  }

  async function handleDelete() {
    if (!editNode?.id || !confirm('Удалить эту сущность? Связи удалятся автоматически.')) return
    setDeleting(true)
    await supabase.from('nodes').delete().eq('id', editNode.id)

    if (selectedType?.slug === 'loop') {
      router.push(`/c/${campaignSlug}/loops`)
    } else if (selectedType?.slug === 'session') {
      router.push(`/c/${campaignSlug}/sessions`)
    } else {
      router.push(`/c/${campaignSlug}/catalog`)
    }
    router.refresh()
  }

  function renderField(key: string, value: string) {
    const label = FIELD_LABELS[key] || key

    // Status dropdown for loops
    if (key === 'status' && selectedType?.slug === 'loop') {
      return (
        <div key={key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <select
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {LOOP_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )
    }

    // Loop number dropdown for sessions
    if (key === 'loop_number' && selectedType?.slug === 'session') {
      return (
        <div key={key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <select
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">— без петли —</option>
            {loops.map((l) => (
              <option key={l.id} value={l.number}>
                Петля {l.number}{l.title !== `Петля ${l.number}` ? ` — ${l.title}` : ''}
                {l.status === 'current' ? ' ✦' : ''}
              </option>
            ))}
          </select>
        </div>
      )
    }

    // Textarea for long text fields
    if (TEXTAREA_FIELDS.includes(key)) {
      return (
        <div key={key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <textarea
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            rows={key === 'recap' ? 10 : key === 'description' ? 4 : 5}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>
      )
    }

    // Number input
    if (NUMBER_FIELDS.includes(key)) {
      return (
        <div key={key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <input
            type="number"
            min={1}
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )
    }

    // Date input
    if (DATE_FIELDS.includes(key)) {
      return (
        <div key={key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <input
            type="date"
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )
    }

    // URL input
    if (URL_FIELDS.includes(key)) {
      return (
        <div key={key}>
          <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
          <input
            type="url"
            value={value}
            onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )
    }

    // Default: text input
    return (
      <div key={key}>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
    )
  }

  // Group fields: put number/meta fields first, then text areas
  const fieldOrder = Object.keys(fields).sort((a, b) => {
    const priority = (k: string) => {
      if (NUMBER_FIELDS.includes(k)) return 0
      if (k === 'status' || k === 'loop_number') return 1
      if (k === 'title' || k === 'player') return 2
      if (DATE_FIELDS.includes(k)) return 3
      if (k === 'game_date') return 4
      if (URL_FIELDS.includes(k)) return 4.5
      if (TEXTAREA_FIELDS.includes(k)) return 5
      return 3
    }
    return priority(a) - priority(b)
  })

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {!selectedType ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Выберите тип</h2>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => selectType(t)}
                className="rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-400"
              >
                <span className="mr-2">{t.icon}</span>
                <span className="font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!isEdit && (
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedType(null)} className="text-sm text-gray-400 hover:text-gray-600">
                ← назад
              </button>
              <span className="text-sm text-gray-500">
                {selectedType.icon} {selectedType.label}
              </span>
            </div>
          )}

          {isEdit && (
            <div className="text-sm text-gray-500">
              {selectedType.icon} {selectedType.label}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Название {autoTitle ? '' : '*'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={autoTitle || 'Имя персонажа, название локации...'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            {autoTitle && !title.trim() && (
              <p className="mt-1 text-xs text-gray-400">По умолчанию: {autoTitle}</p>
            )}
          </div>

          {/* Compact grid for short fields */}
          {(() => {
            const shortFields = fieldOrder.filter(
              (k) => !TEXTAREA_FIELDS.includes(k)
            )
            const longFields = fieldOrder.filter(
              (k) => TEXTAREA_FIELDS.includes(k)
            )

            return (
              <>
                {shortFields.length > 1 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {shortFields.map((key) => renderField(key, fields[key]))}
                  </div>
                ) : (
                  shortFields.map((key) => renderField(key, fields[key]))
                )}
                {longFields.map((key) => renderField(key, fields[key]))}
              </>
            )
          })()}

          {/* Content/notes for loops */}
          {selectedType.slug === 'loop' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Заметки ДМа (markdown)</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="Что важного произошло в этой петле?"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-y"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={saving || (!title.trim() && !autoTitle)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
            <button
              onClick={() => router.back()}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            {isEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto text-sm text-red-500 hover:text-red-700"
              >
                {deleting ? 'Удаляю…' : 'Удалить'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
