'use client'

import { useState } from 'react'
import {
  linkTelegramAction,
  unlinkTelegramAction,
} from '@/app/actions/telegram-links'

export type LinkRow = {
  userId: string
  login: string
  displayName: string | null
  telegramId: string | null
  role: string
}

export function TelegramLinksClient({
  campaignId,
  slug,
  rows,
}: {
  campaignId: string
  slug: string
  rows: LinkRow[]
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function link(userId: string) {
    setError(null)
    setBusy(userId)
    const res = await linkTelegramAction({
      campaignId,
      slug,
      userId,
      telegramId: drafts[userId] ?? '',
    })
    setBusy(null)
    if (!res.ok) setError(res.error)
    else setDrafts((d) => ({ ...d, [userId]: '' }))
  }

  async function unlink(userId: string) {
    setError(null)
    setBusy(userId)
    const res = await unlinkTelegramAction({ campaignId, slug, userId })
    setBusy(null)
    if (!res.ok) setError(res.error)
  }

  return (
    <div className="mt-4">
      {error && (
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Аккаунт</th>
            <th className="py-2">Telegram</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b">
              <td className="py-2">
                <span className="font-medium">{r.login}</span>
                {r.displayName && (
                  <span className="text-gray-500"> · {r.displayName}</span>
                )}
                <span className="ml-1 text-xs text-gray-400">({r.role})</span>
              </td>
              <td className="py-2">
                {r.telegramId ? (
                  <code className="text-xs">{r.telegramId}</code>
                ) : (
                  <input
                    inputMode="numeric"
                    placeholder="telegram_id"
                    value={drafts[r.userId] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [r.userId]: e.target.value }))
                    }
                    className="w-32 rounded border px-2 py-1 text-xs"
                  />
                )}
              </td>
              <td className="py-2 text-right">
                {r.telegramId ? (
                  <button
                    onClick={() => unlink(r.userId)}
                    disabled={busy === r.userId}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    отвязать
                  </button>
                ) : (
                  <button
                    onClick={() => link(r.userId)}
                    disabled={
                      busy === r.userId || !(drafts[r.userId] ?? '').trim()
                    }
                    className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    привязать
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
