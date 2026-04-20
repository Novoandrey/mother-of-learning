'use client'

// Error boundary for any route inside /c/[slug]/*.
// Next.js renders this when a Server Component throws — including RLS denials
// that surface as "Failed to fetch" or "permission denied for table".
// The campaign layout (sidebar + header) stays mounted; only <main> is replaced.

import Link from 'next/link'
import { useEffect } from 'react'
import { useParams } from 'next/navigation'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Best-effort classification. Supabase surfaces RLS violations as error
 * messages containing "row-level security", "permission denied" or code
 * '42501'. Anything else — we treat as an unexpected failure.
 */
function isPermissionError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('row-level security') ||
    m.includes('permission denied') ||
    m.includes('42501') ||
    m.includes('forbidden')
  )
}

export default function CampaignError({ error, reset }: Props) {
  const params = useParams<{ slug: string }>()

  useEffect(() => {
    // In prod this should ship to an error-tracker. For now — console only,
    // matching the rest of the codebase.
    console.error('Campaign route error:', error)
  }, [error])

  const isPerms = isPermissionError(error.message)

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="max-w-md rounded-[var(--radius-lg)] border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          {isPerms ? 'Нет доступа' : 'Что-то пошло не так'}
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          {isPerms
            ? 'У тебя нет прав на это действие. Если считаешь, что это ошибка, напиши ДМу.'
            : 'Страница не открылась. Попробуй ещё раз — если не поможет, сообщи в чат.'}
        </p>
        {!isPerms && error.digest && (
          <p className="mb-4 font-mono text-xs text-gray-400">
            id: {error.digest}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Попробовать снова
          </button>
          {params?.slug && (
            <Link
              href={`/c/${params.slug}/catalog`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              В каталог
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
