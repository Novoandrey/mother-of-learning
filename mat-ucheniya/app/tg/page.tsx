'use client'

/**
 * Telegram Mini App (spec-046, T014–T018).
 *
 * Walking skeleton: load the Telegram WebApp SDK → read initData → POST to
 * /api/tg/auth → on a linked account, mint-backed session (supabase-js
 * `accessToken`) reads the caller's PCs → read-only card with the primary
 * portrait (placeholder fallback). Unlinked accounts see their telegram_id and
 * a prompt to send it to the DM (C-01 б). Mobile-first; no engine, no edit.
 */

// Portraits are external R2 URLs; next/image would need remotePatterns + image
// optimization we don't want for a read-only Mini App.
/* eslint-disable @next/next/no-img-element */

import { useCallback, useRef, useState } from 'react'
import Script from 'next/script'
import { createTgClient } from '@/lib/supabase/tg-client'
import { getMyCharacters, type MyCharacter } from '@/lib/queries/my-characters'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        ready: () => void
        expand?: () => void
        themeParams?: Record<string, string>
      }
    }
  }
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'unlinked'; telegramId: number; username: string | null }
  | { phase: 'ready'; characters: MyCharacter[] }

function portraitUrl(key: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  if (!key || !base) return null
  return `${base.replace(/\/$/, '')}/${key}`
}

export default function TgPage() {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const startedRef = useRef(false)

  const run = useCallback(async () => {
    const wa = window.Telegram?.WebApp
    if (!wa) {
      setState({ phase: 'error', message: 'Откройте это через кнопку бота в Telegram.' })
      return
    }
    wa.ready()
    wa.expand?.()

    // Telegram theme → page colors (T018), best-effort.
    const tp = wa.themeParams
    if (tp?.bg_color) document.body.style.backgroundColor = tp.bg_color
    if (tp?.text_color) document.body.style.color = tp.text_color

    const initData = wa.initData
    if (!initData) {
      setState({ phase: 'error', message: 'Нет данных Telegram. Откройте через кнопку бота.' })
      return
    }

    try {
      const res = await fetch('/api/tg/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      const data = (await res.json()) as {
        jwt?: string
        userId?: string
        unlinked?: boolean
        telegramId?: number
        username?: string | null
        error?: string
      }

      if (data.unlinked && typeof data.telegramId === 'number') {
        setState({ phase: 'unlinked', telegramId: data.telegramId, username: data.username ?? null })
        return
      }
      if (!res.ok || !data.jwt || !data.userId) {
        setState({ phase: 'error', message: data.error ?? 'Не удалось войти.' })
        return
      }

      const jwt = data.jwt
      const supabase = createTgClient(() => jwt)
      const characters = await getMyCharacters(supabase, data.userId)
      setState({ phase: 'ready', characters })
    } catch {
      setState({ phase: 'error', message: 'Сеть недоступна, попробуйте позже.' })
    }
  }, [])

  const start = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    void run()
  }, [run])

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={start}
        onReady={start}
      />
      <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100">
        {state.phase === 'loading' && <Centered>Загрузка…</Centered>}
        {state.phase === 'error' && <Centered>{state.message}</Centered>}
        {state.phase === 'unlinked' && (
          <Unlinked telegramId={state.telegramId} username={state.username} />
        )}
        {state.phase === 'ready' && <Characters characters={state.characters} />}
      </main>
    </>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-center text-sm text-neutral-400">
      {children}
    </div>
  )
}

function Unlinked({ telegramId, username }: { telegramId: number; username: string | null }) {
  return (
    <div className="mx-auto mt-8 max-w-sm text-center">
      <h1 className="text-lg font-semibold">Аккаунт не привязан</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Перешли этот id ведущему в чат кампании — он привяжет тебя.
      </p>
      <div className="mt-4 rounded-lg bg-neutral-900 px-4 py-3">
        <div className="text-xs text-neutral-500">твой telegram_id</div>
        <div className="select-all font-mono text-2xl">{telegramId}</div>
        {username && <div className="mt-1 text-xs text-neutral-500">@{username}</div>}
      </div>
    </div>
  )
}

function Characters({ characters }: { characters: MyCharacter[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    characters.length === 1 ? characters[0].id : null,
  )

  if (characters.length === 0) {
    return <Centered>За тобой пока нет персонажей.</Centered>
  }

  const selected = characters.find((c) => c.id === selectedId) ?? null

  if (selected) {
    return (
      <div className="mx-auto max-w-sm">
        {characters.length > 1 && (
          <button
            onClick={() => setSelectedId(null)}
            className="mb-4 text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← мои персонажи
          </button>
        )}
        <Card character={selected} />
      </div>
    )
  }

  // More than one PC, none selected: the list.
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-lg font-semibold">Мои персонажи</h1>
      <ul className="space-y-2">
        {characters.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => setSelectedId(c.id)}
              className="flex w-full items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-left hover:bg-neutral-800"
            >
              <Avatar name={c.title} keyStr={c.primaryPortraitKey} size={40} />
              <span className="font-medium">{c.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Card({ character }: { character: MyCharacter }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-neutral-900">
      <div className="aspect-square w-full">
        <Avatar name={character.title} keyStr={character.primaryPortraitKey} fill />
      </div>
      <div className="p-4">
        <div className="text-xl font-semibold">{character.title}</div>
      </div>
    </div>
  )
}

/** Portrait image when present, otherwise an initials placeholder (T017). */
function Avatar({
  name,
  keyStr,
  size,
  fill,
}: {
  name: string
  keyStr: string | null
  size?: number
  fill?: boolean
}) {
  const url = portraitUrl(keyStr)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const sizeStyle = fill ? undefined : { width: size, height: size }
  const shape = fill ? '' : 'rounded-full'
  const dims = fill ? 'h-full w-full' : 'shrink-0'

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={sizeStyle}
        className={`${dims} ${shape} object-cover`}
      />
    )
  }
  return (
    <div
      style={sizeStyle}
      className={`flex ${dims} items-center justify-center ${shape} bg-neutral-700 font-semibold text-neutral-200`}
    >
      {initial}
    </div>
  )
}
