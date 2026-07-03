'use client'

/**
 * Telegram Mini App — entry + navigation controller (spec-046 shell + spec-044
 * ledger). Loads the Telegram WebApp SDK → reads initData → POST /api/tg/auth →
 * on a linked account this establishes a REAL GoTrue cookie session, then a
 * normal browser client reads the campaign's PCs under that session. The user
 * then navigates: character list (own on top, others below — C-02) → PC home
 * with a per-PC app launcher (C-04) → the Ledger app (wallet + feed + общак).
 *
 * Because the session is real, reads AND writes (record / transfer / общак /
 * starter) go through the exact same path as the desktop app — the server
 * actions authorise via the cookie session with no per-call token handling.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getCampaignCharacters, type CampaignCharacter } from '@/lib/queries/campaign-characters'
import {
  getMyCampaign,
  getCurrentLoopNumber,
  getTxCategoriesTg,
  type TgRole,
} from '@/lib/queries/ledger-tg'
import {
  Centered,
  CharacterList,
  PcHome,
  LedgerScreen,
  InventoryScreen,
  SetsScreen,
  RequestsScreen,
  StashScreen,
  BalancesScreen,
  StarterEquipScreen,
} from './_components/ledger-app'
import { WikiListScreen, WikiNodeScreen } from './_components/wiki-app'

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
  | { screen: 'inventory'; pc: CampaignCharacter }
  | { screen: 'sets'; pc: CampaignCharacter }
  | { screen: 'requests'; pc: CampaignCharacter }
  | { screen: 'stash'; pc: CampaignCharacter }
  | { screen: 'equip'; pc: CampaignCharacter }
  | { screen: 'balances' }
  | { screen: 'wiki' }
  | { screen: 'wiki-node'; nodeId: string; title: string }

function AppShell({ ready }: { ready: Ready }) {
  const { characters, supabase, campaignId } = ready
  const ownPcs = characters.filter((c) => c.isOwn)
  const multi = characters.length > 1
  const rootView: View =
    ownPcs.length === 1 ? { screen: 'home', pc: ownPcs[0] } : { screen: 'list' }

  // One own PC → straight to its home; otherwise the list.
  const [view, setView] = useState<View>(rootView)

  // Realtime (FR-010 / T023): migration 117 broadcasts `tx_insert` on the
  // campaign's private channel for every transaction. Each event bumps
  // refreshKey, which the visible screen carries in its load-effect deps, so a
  // second device re-fetches within ~2 s while open sheets/scroll are kept. If
  // Realtime is unreachable the app stays usable on manual refresh.
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) await supabase.realtime.setAuth(token)
      if (!alive) return
      channel = supabase
        .channel(`campaign:${campaignId}`, { config: { private: true } })
        .on('broadcast', { event: 'tx_insert' }, () => setRefreshKey((k) => k + 1))
        .subscribe()
    })()
    return () => {
      alive = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, campaignId])

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
          onOpenWiki={() => setView({ screen: 'wiki' })}
        />
      )
    case 'home':
      return (
        <PcHome
          character={view.pc}
          showBack={multi}
          onBack={() => setView({ screen: 'list' })}
          onOpenLedger={() => setView({ screen: 'ledger', pc: view.pc })}
          onOpenInventory={() => setView({ screen: 'inventory', pc: view.pc })}
          onOpenRequests={() => setView({ screen: 'requests', pc: view.pc })}
          onOpenBalances={() => setView({ screen: 'balances' })}
          onOpenEquip={() => setView({ screen: 'equip', pc: view.pc })}
          onOpenWiki={() => setView({ screen: 'wiki' })}
        />
      )
    case 'inventory':
      return (
        <InventoryScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          character={view.pc}
          others={characters.filter((c) => c.id !== view.pc.id)}
          onOpenSets={() => setView({ screen: 'sets', pc: view.pc })}
          onBack={() => setView({ screen: 'home', pc: view.pc })}
          refreshKey={refreshKey}
        />
      )
    case 'sets':
      return (
        <SetsScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          buyerPc={view.pc}
          userId={ready.userId}
          role={ready.role}
          onBack={() => setView({ screen: 'inventory', pc: view.pc })}
          refreshKey={refreshKey}
        />
      )
    case 'requests':
      return (
        <RequestsScreen
          supabase={ready.supabase}
          pcId={view.pc.id}
          pcTitle={view.pc.title}
          userId={ready.userId}
          categories={ready.categories}
          onBack={() => setView({ screen: 'home', pc: view.pc })}
          refreshKey={refreshKey}
        />
      )
    case 'equip':
      return (
        <StarterEquipScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          character={view.pc}
          onBack={() => setView({ screen: 'home', pc: view.pc })}
          refreshKey={refreshKey}
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
          refreshKey={refreshKey}
        />
      )
    case 'wiki':
      return (
        <WikiListScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          onSelect={(item) =>
            setView({ screen: 'wiki-node', nodeId: item.id, title: item.title })
          }
          onBack={() => setView(rootView)}
        />
      )
    case 'wiki-node':
      return (
        <WikiNodeScreen
          key={view.nodeId}
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          nodeId={view.nodeId}
          title={view.title}
          onBack={() => setView({ screen: 'wiki' })}
          onOpenNode={(nodeId, title) => setView({ screen: 'wiki-node', nodeId, title })}
        />
      )
    case 'ledger':
      return (
        <LedgerScreen
          supabase={ready.supabase}
          campaignId={ready.campaignId}
          loopNumber={ready.loopNumber}
          character={view.pc}
          others={characters.filter((c) => c.id !== view.pc.id)}
          onBack={() => setView({ screen: 'home', pc: view.pc })}
          onOpenStash={() => setView({ screen: 'stash', pc: view.pc })}
          refreshKey={refreshKey}
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
          others={characters.filter((c) => c.id !== view.pc.id)}
          onBack={() => setView({ screen: 'ledger', pc: view.pc })}
          refreshKey={refreshKey}
        />
      )
  }
}
