'use client'

/**
 * Telegram Mini App — entry + navigation controller (spec-046 shell + spec-044
 * ledger). Loads the Telegram WebApp SDK → reads initData → POST /api/tg/auth →
 * on a linked account, a minted-JWT session reads the campaign's PCs. The user
 * then navigates: character list (own on top, others below — C-02) → PC home
 * with a per-PC app launcher (C-04) → the Ledger app (wallet + feed + общак).
 *
 * Reads run through the minted-JWT tg-client under RLS. Writes (record /
 * transfer / free-общак) land in a later task via the server actions' auth
 * adapter; this build is read-only, so foreign PCs are naturally view-only.
 */

import { useCallback, useRef, useState } from 'react'
import Script from 'next/script'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTgClient } from '@/lib/supabase/tg-client'
import { getCampaignCharacters, type CampaignCharacter } from '@/lib/queries/campaign-characters'
import {
  getMyCampaign,
  getCurrentLoopNumber,
  getTxCategoriesTg,
} from '@/lib/queries/ledger-tg'
import {
  Centered,
  CharacterList,
  PcHome,
  LedgerScreen,
  StashScreen,
  BalancesScreen,
} from './_components/ledger-app'

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

type Ready = {
  phase: 'ready'
  supabase: SupabaseClient
  userId: string
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  categories: Map<string, string>
  tgToken: string
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
    wa.expand?.()

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
      const userId = data.userId
      const supabase = createTgClient(() => jwt)

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
        campaignId: campaign.campaignId,
        loopNumber,
        characters,
        categories,
        tgToken: jwt,
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
      <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100">
        {state.phase === 'loading' && <Centered>Загрузка…</Centered>}
        {state.phase === 'error' && <Centered>{state.message}</Centered>}
        {state.phase === 'no-campaign' && (
          <Centered>Ты пока не в кампании. Напиши ведущему.</Centered>
        )}
        {state.phase === 'unlinked' && (
          <Unlinked telegramId={state.telegramId} username={state.username} />
        )}
        {state.phase === 'ready' && <AppShell ready={state} />}
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

// ─────────────────────────── navigation ───────────────────────────

type View =
  | { screen: 'list' }
  | { screen: 'home'; pc: CampaignCharacter }
  | { screen: 'ledger'; pc: CampaignCharacter }
  | { screen: 'stash'; pc: CampaignCharacter }
  | { screen: 'balances' }

function AppShell({ ready }: { ready: Ready }) {
  const { characters } = ready
  const ownPcs = characters.filter((c) => c.isOwn)
  const multi = characters.length > 1
  const rootView: View =
    ownPcs.length === 1 ? { screen: 'home', pc: ownPcs[0] } : { screen: 'list' }

  // One own PC → straight to its home; otherwise the list.
  const [view, setView] = useState<View>(rootView)

  if (characters.length === 0) {
    return <Centered>В этой кампании пока нет персонажей.</Centered>
  }

  switch (view.screen) {
    case 'list':
      return (
        <CharacterList
          characters={characters}
          onSelect={(pc) => setView({ screen: 'home', pc })}
          onOpenBalances={() => setView({ screen: 'balances' })}
        />
      )
    case 'home':
      return (
        <PcHome
          character={view.pc}
          showBack={multi}
          onBack={() => setView({ screen: 'list' })}
          onOpenLedger={() => setView({ screen: 'ledger', pc: view.pc })}
          onOpenBalances={() => setView({ screen: 'balances' })}
        />
      )
    case 'balances':
      return (
        <BalancesScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          characters={characters}
          onBack={() => setView(rootView)}
          onSelect={(pc) => setView({ screen: 'home', pc })}
        />
      )
    case 'ledger':
      return (
        <LedgerScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          character={view.pc}
          tgToken={ready.tgToken}
          others={characters.filter((c) => c.id !== view.pc.id)}
          onBack={() => setView({ screen: 'home', pc: view.pc })}
          onOpenStash={() => setView({ screen: 'stash', pc: view.pc })}
        />
      )
    case 'stash':
      return (
        <StashScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          categories={ready.categories}
          character={view.pc}
          tgToken={ready.tgToken}
          others={characters.filter((c) => c.id !== view.pc.id)}
          onBack={() => setView({ screen: 'ledger', pc: view.pc })}
        />
      )
  }
}
