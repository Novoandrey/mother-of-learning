'use client'

import { EdgeList } from './edge-list'
import { CreateEdgeForm } from './create-edge-form'
import { useState } from 'react'

type Edge = {
  id: string
  type_label: string
  label: string | null
  direction: 'outgoing' | 'incoming'
  related_id: string
  related_title: string
}

type Props = {
  node: {
    id: string
    title: string
    fields: Record<string, unknown>
    type: { slug: string; label: string; icon: string | null }
  }
  edges: Edge[]
  campaignSlug: string
  campaignId: string
}

const HIDDEN_FIELDS = ['tags']

export function NodeDetail({ node, edges, campaignSlug, campaignId }: Props) {
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


      {/* Markdown content stub */}
      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Контент</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">скоро</span>
        </div>
        <p className="text-sm text-gray-400 italic">
          Markdown-страница: статы, описание, картинки, таблицы
        </p>
      </div>

      {/* Chronicles stub */}
      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Летопись</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">скоро</span>
        </div>
        <p className="text-sm text-gray-400 italic">
          Рассказы, фанфики и заметки с привязкой к петле и дате
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Связи</h2>
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
