'use client'

import { EdgeList } from './edge-list'
import { CreateEdgeForm } from './create-edge-form'
import { MarkdownContent } from './markdown-content'
import { Chronicles } from './chronicles'
import { useState } from 'react'

type Edge = {
  id: string
  type_label: string
  label: string | null
  direction: 'outgoing' | 'incoming'
  related_id: string
  related_title: string
}

type Chronicle = {
  id: string
  title: string
  content: string
  loop_number: number | null
  game_date: string | null
  created_at: string
  updated_at: string
}

type Props = {
  node: {
    id: string
    title: string
    fields: Record<string, unknown>
    content: string
    type: { slug: string; label: string; icon: string | null }
  }
  edges: Edge[]
  chronicles: Chronicle[]
  campaignSlug: string
  campaignId: string
}

const HIDDEN_FIELDS = ['tags']

export function NodeDetail({ node, edges, chronicles, campaignSlug, campaignId }: Props) {
  const [showEdgeForm, setShowEdgeForm] = useState(false)
  const fields = Object.entries(node.fields || {}).filter(
    ([key]) => !HIDDEN_FIELDS.includes(key)
  )
  const tags = (node.fields?.tags as string[]) || []

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          {node.type.icon && <span>{node.type.icon}</span>}
          <span className="text-sm font-medium text-gray-500">{node.type.label}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{node.title}</h1>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {fields.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="space-y-3">
            {fields.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{key}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">
                  {String(value || '—')}
                </dd>
              </div>
            ))}
          </div>
        </div>
      )}

      <MarkdownContent
        nodeId={node.id}
        initialContent={node.content || ''}
        campaignSlug={campaignSlug}
      />

      <Chronicles
        nodeId={node.id}
        campaignId={campaignId}
        campaignSlug={campaignSlug}
        initialChronicles={chronicles}
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Связи</h2>
          <button
            onClick={() => setShowEdgeForm(!showEdgeForm)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showEdgeForm ? 'Отмена' : '+ Добавить связь'}
          </button>
        </div>
        {showEdgeForm && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <CreateEdgeForm
              sourceId={node.id}
              campaignId={campaignId}
              campaignSlug={campaignSlug}
              onDone={() => setShowEdgeForm(false)}
            />
          </div>
        )}
        <EdgeList edges={edges} campaignSlug={campaignSlug} />
        {edges.length === 0 && !showEdgeForm && (
          <p className="text-sm text-gray-400">Нет связей</p>
        )}
      </div>
    </div>
  )
}
