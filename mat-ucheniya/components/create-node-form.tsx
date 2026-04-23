'use client'

import { useEffect, useMemo, useState } from 'react'
import { NodeFormField } from './node-form-field'
import { ParticipantsPicker } from './participants-picker'
import { useNodeForm, type ExistingNode } from '@/hooks/use-node-form'
import { TEXTAREA_FIELDS, fieldPriority } from '@/lib/node-form-constants'
import { validateDayRange } from '@/lib/session-validation'
import { createClient } from '@/lib/supabase/client'
import { updateSessionParticipants } from '@/app/actions/sessions'

type Props = {
  campaignId: string
  campaignSlug: string
  editNode?: ExistingNode
  preselectedType?: string
}

const DAY_RANGE_KEYS = ['day_from', 'day_to']

export function CreateNodeForm({ campaignId, campaignSlug, editNode, preselectedType }: Props) {
  // ── Session participants state (T012) ──────────────────────────────
  // Tracked locally: participants live in `participated_in` edges, not
  // in `nodes.fields`. Loaded from the DB for edit; persisted through
  // the `onBeforeRedirect` hook passed into useNodeForm below.
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [dayError, setDayError] = useState<string | null>(null)

  const f = useNodeForm({
    campaignId,
    campaignSlug,
    editNode,
    preselectedType,
    onBeforeRedirect: async (nodeId, typeSlug) => {
      // Only sessions store participants; no-op otherwise.
      if (typeSlug !== 'session') return
      await updateSessionParticipants(nodeId, participantIds)
    },
  })

  const [showNewType, setShowNewType] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [newTypeIcon, setNewTypeIcon] = useState('')
  const [creatingType, setCreatingType] = useState(false)

  async function onCreateCustom() {
    if (!newTypeLabel.trim()) return
    setCreatingType(true)
    try {
      await f.createCustomType(newTypeLabel, newTypeIcon)
      setShowNewType(false)
      setNewTypeLabel('')
      setNewTypeIcon('')
    } catch { /* error state set inside hook */ }
    setCreatingType(false)
  }

  // ── Load existing participants when editing a session ──────────────
  const supabase = useMemo(() => createClient(), [])
  const isSession = f.selectedType?.slug === 'session'
  useEffect(() => {
    if (!editNode || !isSession) return
    let canceled = false
    ;(async () => {
      const { data: et } = await supabase
        .from('edge_types')
        .select('id')
        .eq('slug', 'participated_in')
        .eq('is_base', true)
        .maybeSingle()
      if (canceled || !et) return
      const { data } = await supabase
        .from('edges')
        .select('target_id')
        .eq('source_id', editNode.id)
        .eq('type_id', et.id)
      if (canceled) return
      setParticipantIds((data ?? []).map((r) => r.target_id as string))
    })()
    return () => {
      canceled = true
    }
  }, [editNode, isSession, supabase])

  // ── Resolve loopLength for the currently selected session loop ─────
  const loopLength = useMemo(() => {
    if (!isSession) return 30
    const raw = f.fields.loop_number
    const parsed = raw ? Number(raw) : NaN
    if (!Number.isFinite(parsed)) return 30
    const loop = f.loops.find((l) => l.number === parsed)
    return loop?.length_days ?? 30
  }, [isSession, f.fields.loop_number, f.loops])

  // ── Live-ish day-range validation (re-run on relevant changes) ─────
  useEffect(() => {
    if (!isSession) {
      if (dayError) setDayError(null)
      return
    }
    const err = validateDayRange(f.fields.day_from, f.fields.day_to, loopLength)
    setDayError(err)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSession, f.fields.day_from, f.fields.day_to, loopLength])

  // ── Submit gate: block on day-range error; let hook handle the rest ─
  function handleSubmitClick() {
    if (isSession) {
      const err = validateDayRange(f.fields.day_from, f.fields.day_to, loopLength)
      setDayError(err)
      if (err) return
    }
    f.handleSubmit()
  }

  const fieldOrder = Object.keys(f.fields).sort((a, b) => fieldPriority(a) - fieldPriority(b))
  const allShortFields = fieldOrder.filter((k) => !TEXTAREA_FIELDS.includes(k))
  // Day range fields get their own dedicated flex-row below the grid —
  // keep them out of the generic short-field layout.
  const shortFields = allShortFields.filter((k) => !DAY_RANGE_KEYS.includes(k))
  const hasDayRange =
    isSession && DAY_RANGE_KEYS.every((k) => k in f.fields)
  const longFields = fieldOrder.filter((k) => TEXTAREA_FIELDS.includes(k))

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {!f.selectedType ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Выберите тип</h2>
          <div className="grid grid-cols-2 gap-2">
            {f.types.map((t) => (
              <button
                key={t.id}
                onClick={() => f.selectType(t)}
                className="rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-400"
              >
                <span className="mr-2">{t.icon}</span>
                <span className="font-medium">{t.label}</span>
              </button>
            ))}
          </div>

          {!showNewType ? (
            <button
              onClick={() => setShowNewType(true)}
              className="mt-3 w-full rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              + Создать свой тип
            </button>
          ) : (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
              <p className="text-sm font-medium text-gray-700">Новый тип сущности</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTypeIcon}
                  onChange={(e) => setNewTypeIcon(e.target.value)}
                  placeholder="🎨"
                  className="w-14 rounded-lg border border-gray-200 px-3 py-2 text-sm text-center placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                  maxLength={4}
                />
                <input
                  type="text"
                  value={newTypeLabel}
                  onChange={(e) => setNewTypeLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onCreateCustom() }}
                  placeholder="Название типа"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>
              {f.error && <p className="text-sm text-red-600">{f.error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={onCreateCustom}
                  disabled={creatingType || !newTypeLabel.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creatingType ? 'Создаю...' : 'Создать'}
                </button>
                <button
                  onClick={() => { setShowNewType(false); f.setError('') }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!f.isEdit && (
            <div className="flex items-center gap-2">
              <button onClick={() => f.setSelectedType(null)} className="text-sm text-gray-400 hover:text-gray-600">
                ← назад
              </button>
              <span className="text-sm text-gray-500">
                {f.selectedType.icon} {f.selectedType.label}
              </span>
            </div>
          )}

          {f.isEdit && (
            <div className="text-sm text-gray-500">
              {f.selectedType.icon} {f.selectedType.label}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Название {f.autoTitle ? '' : '*'}
            </label>
            <input
              type="text"
              value={f.title}
              onChange={(e) => f.setTitle(e.target.value)}
              placeholder={f.autoTitle || 'Имя персонажа, название локации...'}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            {f.autoTitle && !f.title.trim() && (
              <p className="mt-1 text-xs text-gray-400">По умолчанию: {f.autoTitle}</p>
            )}
          </div>

          {shortFields.length > 1 ? (
            <div className="grid grid-cols-2 gap-3">
              {shortFields.map((key) => (
                <NodeFormField
                  key={key}
                  fieldKey={key}
                  value={f.fields[key]}
                  onChange={(v) => f.setFields({ ...f.fields, [key]: v })}
                  typeSlug={f.selectedType?.slug}
                  loops={f.loops}
                />
              ))}
            </div>
          ) : (
            shortFields.map((key) => (
              <NodeFormField
                key={key}
                fieldKey={key}
                value={f.fields[key]}
                onChange={(v) => f.setFields({ ...f.fields, [key]: v })}
                typeSlug={f.selectedType?.slug}
                loops={f.loops}
              />
            ))
          )}
          {longFields.map((key) => (
            <NodeFormField
              key={key}
              fieldKey={key}
              value={f.fields[key]}
              onChange={(v) => f.setFields({ ...f.fields, [key]: v })}
              typeSlug={f.selectedType?.slug}
              loops={f.loops}
            />
          ))}

          {/* Session-only: day range + participants (spec-009). */}
          {hasDayRange && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <NodeFormField
                  key="day_from"
                  fieldKey="day_from"
                  value={f.fields.day_from ?? ''}
                  onChange={(v) => f.setFields({ ...f.fields, day_from: v })}
                  typeSlug={f.selectedType?.slug}
                  loops={f.loops}
                />
                <NodeFormField
                  key="day_to"
                  fieldKey="day_to"
                  value={f.fields.day_to ?? ''}
                  onChange={(v) => f.setFields({ ...f.fields, day_to: v })}
                  typeSlug={f.selectedType?.slug}
                  loops={f.loops}
                />
              </div>
              <p className="text-xs text-gray-400">
                Диапазон дней внутри петли (длина петли: {loopLength}). Оставь
                пустым, если сессия без точной даты.
              </p>
              {dayError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                  {dayError}
                </p>
              )}
            </div>
          )}

          {isSession && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Участники (пачка)
              </label>
              <ParticipantsPicker
                key={editNode?.id ?? 'new'}
                campaignId={campaignId}
                initialSelectedIds={participantIds}
                onChange={setParticipantIds}
              />
            </div>
          )}

          {f.selectedType.slug === 'loop' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Заметки ДМа (markdown)</label>
              <textarea
                value={f.content}
                onChange={(e) => f.setContent(e.target.value)}
                rows={6}
                placeholder="Что важного произошло в этой петле?"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-y"
              />
            </div>
          )}

          {f.error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{f.error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSubmitClick}
              disabled={
                f.saving ||
                (!f.title.trim() && !f.autoTitle) ||
                (isSession && dayError !== null)
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {f.saving ? 'Сохраняю...' : f.isEdit ? 'Сохранить' : 'Создать'}
            </button>
            <button
              onClick={() => f.router.back()}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            {f.isEdit && (
              <button
                onClick={f.handleDelete}
                disabled={f.deleting}
                className="ml-auto text-sm text-red-500 hover:text-red-700"
              >
                {f.deleting ? 'Удаляю…' : 'Удалить'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
