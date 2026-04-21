'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { invalidateSidebarAction } from '@/app/actions/cache'
import {
  NUMBER_FIELDS,
  HIDDEN_FIELDS,
  slugify,
} from '@/lib/node-form-constants'

export type NodeType = {
  id: string
  slug: string
  label: string
  icon: string | null
  default_fields: Record<string, string>
}

export type LoopOption = { id: string; number: number; title: string; status: string }

export type ExistingNode = {
  id: string
  title: string
  fields: Record<string, unknown>
  content: string
  type_id: string
}

type Options = {
  campaignId: string
  campaignSlug: string
  editNode?: ExistingNode
  preselectedType?: string
}

/**
 * Data loading, state, and persistence for the node create/edit form.
 * UI-agnostic: component picks state + handlers from here.
 */
export function useNodeForm({ campaignId, campaignSlug, editNode, preselectedType }: Options) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const typeParam = preselectedType || searchParams.get('type')
  const isEdit = !!editNode

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

  // ── Init type fields from type or existing node ──
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

  // ── Load types + preselect ──────────────────────
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

  // ── Load loops + contains edge type ─────────────
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
              type LoopNodeRow = {
                id: string
                title: string
                fields: Record<string, unknown> | null
              }
              setLoops(
                (loopNodes as LoopNodeRow[])
                  .map((n) => {
                    const number = n.fields?.['number']
                    const status = n.fields?.['status']
                    return {
                      id: n.id,
                      number: Number(number ?? 0),
                      title: n.title,
                      status: typeof status === 'string' ? status : 'past',
                    }
                  })
                  .sort((a: LoopOption, b: LoopOption) => a.number - b.number),
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

  // ── Auto title for loops / sessions ─────────────
  const autoTitle = useMemo(() => {
    if (!selectedType) return ''
    if (selectedType.slug === 'loop' && fields.number) return `Петля ${fields.number}`
    if (selectedType.slug === 'session' && fields.session_number) return `Сессия ${fields.session_number}`
    return ''
  }, [selectedType, fields.number, fields.session_number])

  // ── Create custom type ──────────────────────────
  async function createCustomType(label: string, icon: string): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) return

    const slug = slugify(trimmed)
    const maxSort = types.length > 0 ? Math.max(...types.map(() => 0)) + 100 : 100

    const { data, error: err } = await supabase
      .from('node_types')
      .insert({
        campaign_id: campaignId,
        slug,
        label: trimmed,
        icon: icon.trim() || null,
        default_fields: { description: '' },
        sort_order: maxSort,
      })
      .select('id, slug, label, icon, default_fields')
      .single()

    if (err || !data) {
      setError(err?.message || 'Не удалось создать тип')
      throw err || new Error('create_failed')
    }

    const newType = data as NodeType
    setTypes((prev) => [...prev, newType])
    selectType(newType)
  }

  // ── Submit ──────────────────────────────────────
  async function handleSubmit(): Promise<void> {
    const finalTitle = title.trim() || autoTitle
    if (!finalTitle || !selectedType) return
    setSaving(true)
    setError('')

    const cleanFields: Record<string, unknown> = {}
    Object.entries(fields).forEach(([k, v]) => {
      const trimmed = v.trim()
      if (trimmed) {
        if (NUMBER_FIELDS.includes(k)) {
          cleanFields[k] = parseInt(trimmed) || trimmed
        } else if (k === 'loop_number' && trimmed) {
          cleanFields[k] = parseInt(trimmed) || null
        } else {
          cleanFields[k] = trimmed
        }
      }
    })

    if (editNode?.fields?.tags) {
      cleanFields.tags = editNode.fields.tags
    }

    type NodeInsertPayload = {
      campaign_id: string
      type_id: string
      title: string
      fields: Record<string, unknown>
      content?: string
    }
    const payload: NodeInsertPayload = {
      campaign_id: campaignId,
      type_id: selectedType.id,
      title: finalTitle,
      fields: cleanFields,
    }
    if (selectedType.slug === 'loop') payload.content = content.trim()

    let id: string | undefined = editNode?.id
    let err

    if (isEdit && editNode?.id) {
      const { error: e } = await supabase.from('nodes').update(payload).eq('id', editNode.id)
      err = e
    } else {
      const { data, error: e } = await supabase.from('nodes').insert(payload).select('id').single()
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
      await supabase.from('edges').delete().eq('target_id', id).eq('type_id', containsEdgeTypeId)
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

    // Title/type may have changed and the node may be brand new.
    // Invalidate the cached sidebar list so the next navigation sees it.
    await invalidateSidebarAction(campaignId)

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

  // ── Delete ──────────────────────────────────────
  async function handleDelete(): Promise<void> {
    if (!editNode?.id || !confirm('Удалить эту сущность? Связи удалятся автоматически.')) return
    setDeleting(true)
    await supabase.from('nodes').delete().eq('id', editNode.id)
    await invalidateSidebarAction(campaignId)

    if (selectedType?.slug === 'loop') router.push(`/c/${campaignSlug}/loops`)
    else if (selectedType?.slug === 'session') router.push(`/c/${campaignSlug}/sessions`)
    else router.push(`/c/${campaignSlug}/catalog`)
    router.refresh()
  }

  return {
    // State
    types, selectedType, title, fields, content, saving, error, loops, deleting, isEdit, autoTitle,
    // Setters
    setTitle, setFields, setContent, setError,
    // Actions
    selectType, setSelectedType,
    createCustomType, handleSubmit, handleDelete,
    router,
  }
}
