'use client'

/**
 * Telegram Mini App — entry (spec-046 shell + spec-044 ledger + spec-058 UX).
 * Loads the Telegram WebApp SDK → reads initData → POST /api/tg/auth →
 * on a linked account this establishes a REAL GoTrue cookie session, then a
 * normal browser client reads the campaign's PCs under that session. All
 * navigation lives in <TgShell> (_components/shell.tsx): нижний таб-бар
 * (⚡ Действие · 🎒 Персонаж · 🗺️ Карта · 🏰 Партия) + навигационный стек на таб.
 *
 * Because the session is real, reads AND writes (record / transfer / общак /
 * starter) go through the exact same path as the desktop app — the server
 * actions authorise via the cookie session with no per-call token handling.
 */

import { useCallback, useRef, useState } from 'react'
import Script from 'next/script'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getCampaignCharacters, type CampaignCharacter } from '@/lib/queries/campaign-characters'
import {
  getMyCampaign,
  getCurrentLoopNumber,
  getTxCategoriesTg,
  type TgRole,
} from '@/lib/queries/ledger-tg'
import { Centered } from './_components/primitives'
import { TgShell } from './_components/shell'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        ready: () => void
        expand?: () => void
        requestFullscreen?: () => void
        isFullscreen?: boolean
        platform?: string
        themeParams?: Record<string, string>
      }
    }
  }
}

type Ready = {
  phase: 'ready'
  supabase: SupabaseClient
  userId: string
  role: TgRole
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  categories: Map<string, string>
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'no-campaign' }
  | { phase: 'unlinked'; telegramId: number; username: string | null }
  | Ready

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
    // `expand()` is the documented fallback on every client. Telegram Desktop
    // may additionally honour the fullscreen request; older clients simply
    // keep the expanded Mini App without failing the sign-in flow.
    wa.expand?.()
    if (['tdesktop', 'macos'].includes(wa.platform ?? '') && !wa.isFullscreen) {
      wa.requestFullscreen?.()
    }

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
        ok?: boolean
        userId?: string
        unlinked?: boolean
        telegramId?: number
        username?: string | null
        accessToken?: string | null
        refreshToken?: string | null
        error?: string
      }

      if (data.unlinked && typeof data.telegramId === 'number') {
        setState({ phase: 'unlinked', telegramId: data.telegramId, username: data.username ?? null })
        return
      }
      if (!res.ok || !data.ok || !data.userId) {
        setState({ phase: 'error', message: data.error ?? 'Не удалось войти.' })
        return
      }

      // The Mini App holds a real GoTrue session. On mobile the response cookies
      // may not stick, so adopt the returned tokens directly: setSession puts the
      // access token in this client's memory (reads work right away) and writes
      // the auth cookies from JS (so server-action writes are authorised too).
      const userId = data.userId
      const supabase = createClient()

      if (data.accessToken && data.refreshToken) {
        await supabase.auth.setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
        })
      }

      const campaign = await getMyCampaign(supabase, userId)
      if (!campaign) {
        setState({ phase: 'no-campaign' })
        return
      }

      const [loopNumber, characters, categories] = await Promise.all([
        getCurrentLoopNumber(supabase, campaign.campaignId),
        getCampaignCharacters(supabase, campaign.campaignId, userId),
        getTxCategoriesTg(supabase, campaign.campaignId),
      ])

      setState({
        phase: 'ready',
        supabase,
        userId,
        role: campaign.role,
        campaignId: campaign.campaignId,
        loopNumber,
        characters,
        categories,
      })
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
      <main className="min-h-[var(--tg-viewport-stable-height,100dvh)] w-full max-w-none bg-neutral-950 px-4 py-6 text-neutral-100">
        {state.phase === 'loading' && <Centered>Загрузка…</Centered>}
        {state.phase === 'error' && <Centered>{state.message}</Centered>}
        {state.phase === 'no-campaign' && (
          <Centered>Ты пока не в кампании. Напиши ведущему.</Centered>
        )}
        {state.phase === 'unlinked' && (
          <Unlinked telegramId={state.telegramId} username={state.username} />
        )}
        {state.phase === 'ready' && (
          <TgShell
            supabase={state.supabase}
            userId={state.userId}
            role={state.role}
            campaignId={state.campaignId}
            loopNumber={state.loopNumber}
            characters={state.characters}
            categories={state.categories}
          />
        )}
      </main>
    </>
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
