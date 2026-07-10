'use client'

/**
 * Переключатель редакции тела заклинания (spec-059, SC-002). Тумблер
 * 2014/2024 показывается ТОЛЬКО когда есть непустое тело 2024
 * (`fields.content_2024`) — иначе просто рендерим 2014.
 *
 * Редакция 2014 = `nodes.content` → editable `<MarkdownContent>` (её же
 * сохраняет `PUT /api/nodes/[id]/content`). Редакция 2024 живёт в
 * `fields.content_2024`, а этот роут пишет ТОЛЬКО `content`, поэтому 2024
 * рендерим read-only: дать «Редактировать» на 2024 значило бы молча
 * затирать тело 2014 (правило проекта: сначала корректность данных).
 */

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { MarkdownContent } from './markdown-content'

type Edition = '2014' | '2024'

export function SpellEditionView({
  nodeId,
  campaignSlug,
  content2014,
  content2024,
}: {
  nodeId: string
  campaignSlug: string
  content2014: string
  content2024: string
}) {
  const hasV2024 = content2024.trim().length > 0
  const [edition, setEdition] = useState<Edition>('2014')
  const showV2024 = hasV2024 && edition === '2024'

  return (
    <div className="flex flex-col gap-3">
      {hasV2024 && (
        <div className="inline-flex self-start rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          {(['2014', '2024'] as Edition[]).map((e) => (
            <button
              key={e}
              onClick={() => setEdition(e)}
              className={`rounded-md px-3 py-1 transition-colors ${
                edition === e
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Редакция {e}
            </button>
          ))}
        </div>
      )}

      {showV2024 ? (
        <ReadOnly2024 content={content2024} />
      ) : (
        <MarkdownContent
          nodeId={nodeId}
          initialContent={content2014}
          campaignSlug={campaignSlug}
        />
      )}
    </div>
  )
}

/** Read-only карточка тела 2024 — совпадает по виду с read-режимом
 *  MarkdownContent, но без «Редактировать» (нет пути записи content_2024). */
function ReadOnly2024({ content }: { content: string }) {
  const isEmpty = !content.trim()
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Контент · редакция 2024
        </h2>
        <span className="text-xs text-gray-300">только чтение</span>
      </div>
      {isEmpty ? (
        <div className="p-4">
          <p className="text-sm italic text-gray-400">Пусто.</p>
        </div>
      ) : (
        <div className="prose prose-sm max-w-none p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
