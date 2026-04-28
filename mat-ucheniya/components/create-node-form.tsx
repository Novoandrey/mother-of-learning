'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NodeFormField } from './node-form-field'
import { ParticipantsPicker } from './participants-picker'
import { useNodeForm, type ExistingNode } from '@/hooks/use-node-form'
import { useFormDraft } from '@/hooks/use-form-draft'
import { TEXTAREA_FIELDS, fieldPriority } from '@/lib/node-form-constants'
import { validateDayRange } from '@/lib/session-validation'
import { createClient } from '@/lib/supabase/client'
import { updateSessionParticipants } from '@/app/actions/sessions'
import { DEFAULT_LOOP_LENGTH_DAYS } from '@/lib/loop-length'

type DraftSnapshot = {
  title: string
  fields: Record<string, string>
  content: string
  participantIds: string[]
}

function formatDraftTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

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

  // Bridge: useNodeForm fires `onBeforeRedirect` after a successful
  // save but before the redirect — that's the moment to wipe the
  // local-storage draft. We can't pass `clearDraft` directly because
  // it doesn't exist until useFormDraft runs below, so we route
  // through a ref that's filled in once both hooks have run.
  const draftClearRef = useRef<() => void>(() => {})

  const f = useNodeForm({
    campaignId,
    campaignSlug,
    editNode,
    preselectedType,
    onBeforeRedirect: async (nodeId, typeSlug) => {
      // Only sessions store participants; no-op otherwise.
      if (typeSlug === 'session') {
        await updateSessionParticipants(nodeId, participantIds)
      }
      // Save succeeded (and side-effects too) — the draft is now safely
      // committed. Drop it so next visit doesn't show a stale prompt.
      draftClearRef.current()
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
    if (!isSession) return DEFAULT_LOOP_LENGTH_DAYS
    const raw = f.fields.loop_number
    const parsed = raw ? Number(raw) : NaN
    if (!Number.isFinite(parsed)) return DEFAULT_LOOP_LENGTH_DAYS
    const loop = f.loops.find((l) => l.number === parsed)
    return loop?.length_days ?? DEFAULT_LOOP_LENGTH_DAYS
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

  // ── Local draft autosave ───────────────────────────────────────────
  // localStorage-backed safety net for in-progress edits — survives
  // tab close, browser crash, OS reboot. Keyed per-node-id (edit) or
  // per-(campaign, type-slug) (create), so two parallel "new session"
  // tabs would collide; that's an acceptable trade vs. random IDs that
  // never get cleaned up.
  //
  // Disabled until `selectedType` is known so the very first auto-write
  // captures real form state (with type defaults applied) rather than
  // the brief empty render that precedes type loading.
  const draftKey = useMemo(() => {
    if (!f.selectedType) return null
    if (editNode?.id) return `mat-uch:draft:edit:${editNode.id}`
    return `mat-uch:draft:new:${campaignId}:${f.selectedType.slug}`
  }, [f.selectedType, editNode?.id, campaignId])

  const draftValue = useMemo<DraftSnapshot>(
    () => ({
      title: f.title,
      fields: f.fields,
      content: f.content,
      participantIds,
    }),
    [f.title, f.fields, f.content, participantIds],
  )

  const isDraftEmpty = useCallback((v: DraftSnapshot) => {
    if (v.title.trim()) return false
    if (v.content.trim()) return false
    if (v.participantIds.length > 0) return false
    for (const k of Object.keys(v.fields)) {
      const fv = v.fields[k]
      if (typeof fv === 'string' && fv.trim()) return false
    }
    return true
  }, [])

  const draft = useFormDraft<DraftSnapshot>({
    key: draftKey,
    value: draftValue,
    enabled: !!f.selectedType,
    isEmpty: isDraftEmpty,
    onRestore: (d) => {
      f.setTitle(d.title ?? '')
      // Merge into existing field shape so any newly-added fields stay
      // at their defaults rather than being wiped to undefined.
      f.setFields({ ...f.fields, ...(d.fields ?? {}) })
      f.setContent(d.content ?? '')
      setParticipantIds(d.participantIds ?? [])
    },
  })

  // Wire the clearDraft callback into the ref consumed by
  // useNodeForm.onBeforeRedirect.
  useEffect(() => {
    draftClearRef.current = draft.clearDraft
  }, [draft.clearDraft])

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
  // For sessions, session_number is visually anchored on its own row at
  // the very top. Everything else (loop_number, played_at, …) goes in a
  // grid *after* the day-range block and participants picker — those
  // two are the inputs filled at session start and deserve high
  // position.
  const sessionEarlyKey = 'session_number'
  const shortFieldsEarly =
    isSession && shortFields.includes(sessionEarlyKey) ? [sessionEarlyKey] : []
  const shortFieldsLate = isSession
    ? shortFields.filter((k) => k !== sessionEarlyKey)
    : shortFields
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
          {/* Draft restore banner — shown when localStorage has an
              unrecovered snapshot for this form key. */}
          {draft.pendingDraft && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              <span className="min-w-0 text-amber-900">
                📝 Найден несохранённый черновик от{' '}
                <span className="font-medium">
                  {formatDraftTime(draft.pendingDraft.savedAt)}
                </span>
              </span>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  onClick={draft.restoreDraft}
                  className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700"
                >
                  Восстановить
                </button>
                <button
                  onClick={draft.discardDraft}
                  className="rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-800 transition-colors hover:bg-amber-100"
                >
                  Отбросить
                </button>
              </div>
            </div>
          )}

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

          {/* Sessions: session_number first, standalone. */}
          {shortFieldsEarly.map((key) => (
            <NodeFormField
              key={key}
              fieldKey={key}
              value={f.fields[key]}
              onChange={(v) => f.setFields({ ...f.fields, [key]: v })}
              typeSlug={f.selectedType?.slug}
              loops={f.loops}
            />
          ))}

          {/* Non-session types: render the single grid as before. */}
          {!isSession && shortFieldsLate.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {shortFieldsLate.map((key) => (
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
          )}
          {!isSession && shortFieldsLate.length === 1 && (
            <NodeFormField
              key={shortFieldsLate[0]}
              fieldKey={shortFieldsLate[0]}
              value={f.fields[shortFieldsLate[0]]}
              onChange={(v) => f.setFields({ ...f.fields, [shortFieldsLate[0]]: v })}
              typeSlug={f.selectedType?.slug}
              loops={f.loops}
            />
          )}

          {/* Session-only: day range (T012). */}
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

          {/* Session-only: participants (T012). */}
          {isSession && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Участники (пачка)
              </label>
              <ParticipantsPicker
                key={editNode?.id ?? 'new'}
                campaignId={campaignId}
                selectedIds={participantIds}
                onChange={setParticipantIds}
              />
            </div>
          )}

          {/* Sessions: loop_number / played_at / etc. land AFTER day range + picker. */}
          {isSession && shortFieldsLate.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {shortFieldsLate.map((key) => (
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
          )}
          {isSession && shortFieldsLate.length === 1 && (
            <NodeFormField
              key={shortFieldsLate[0]}
              fieldKey={shortFieldsLate[0]}
              value={f.fields[shortFieldsLate[0]]}
              onChange={(v) => f.setFields({ ...f.fields, [shortFieldsLate[0]]: v })}
              typeSlug={f.selectedType?.slug}
              loops={f.loops}
            />
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
            {draft.lastSavedAt && !draft.pendingDraft && (
              <span
                className="text-xs text-gray-400"
                title={`Локальный черновик · ${new Date(draft.lastSavedAt).toLocaleString('ru-RU')}`}
              >
                Автосохранено
              </span>
            )}
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
