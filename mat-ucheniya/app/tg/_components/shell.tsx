'use client'

/**
 * /tg shell (spec-058 W1): нижний таб-бар (⚡ Действие · 🎒 Персонаж · 🏰 Партия)
 * + навигационный СТЕК на таб + шапка с активным PC и входом в каталог (📖)
 * + realtime-рефреш (broadcast tx_insert → refreshKey), перенесённый из page.tsx.
 *
 * Контракт для модулей табов (W2/W3/W4):
 * - useTgNav() — стек текущего таба: push/pop/replace/reset. Переключение таба
 *   (в т.ч. повторный тап по активному) = reset стека до корня таба.
 * - useTgRefresh() — { refreshKey, bump }: refreshKey кладётся в deps
 *   load-эффектов (как в старых экранах), bump — ручной толчок после мутаций,
 *   которые не порождают transaction-строку (наборы, схемы, настройки).
 * - Экранные имена, которые рендерит САМ shell: 'action' | 'character' |
 *   'party' (корни табов), 'pc-select', 'wiki', 'wiki-node' и два моста из
 *   аккордеона ⋯ Ещё — 'legacy-equip' (стартовый набор) и 'legacy-sets' (наборы).
 *   Любой другой screen проваливается в компонент активного таба — таб сам
 *   рендерит свои пуш-экраны по useTgNav().top.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { CampaignCharacter } from '@/lib/queries/campaign-characters'
import type { TgRole } from '@/lib/queries/ledger-tg'
import { Avatar, Centered } from './primitives'
import { CharacterList, SetsScreen, StarterEquipScreen } from './ledger-app'
import { WikiListScreen, WikiNodeScreen } from './wiki-app'
import { ActionHub } from './action-hub'
import { CharacterTab } from './character-tab'
import { PartyTab } from './party-tab'

// ─────────────────────────── navigation stack ───────────────────────────

export type TgTab = 'action' | 'character' | 'party'

export type NavEntry = { screen: string; params?: Record<string, unknown> }

export type TgNav = {
  /** Активный таб. */
  tab: TgTab
  /** Стек активного таба; последний элемент — видимый экран. */
  stack: NavEntry[]
  /** Верх стека (= stack[stack.length - 1]). */
  top: NavEntry
  push: (entry: NavEntry) => void
  /** «← Назад» везде. На корне таба — no-op. */
  pop: () => void
  replace: (entry: NavEntry) => void
  /** Переключить таб и сбросить его стек до корня. */
  reset: (tab: TgTab) => void
}

const NavContext = createContext<TgNav | null>(null)

export function useTgNav(): TgNav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useTgNav() вне <TgShell>')
  return nav
}

// ─────────────────────────── realtime refresh ───────────────────────────

export type TgRefresh = {
  /** Растёт на каждый broadcast tx_insert кампании — кладите в deps load-эффектов. */
  refreshKey: number
  /** Ручной толчок (мутации без transaction-строки: наборы, схемы и т.п.). */
  bump: () => void
}

const RefreshContext = createContext<TgRefresh | null>(null)

export function useTgRefresh(): TgRefresh {
  const r = useContext(RefreshContext)
  if (!r) throw new Error('useTgRefresh() вне <TgShell>')
  return r
}

// ─────────────────────────── app context (пропсы табов) ───────────────────────────

export type TgAppContext = {
  supabase: SupabaseClient
  userId: string
  role: TgRole
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  categories: Map<string, string>
  /** Активный PC шапки; не-null (characters.length ≥ 1 гарантирует shell). */
  activePc: CampaignCharacter
  setActivePc: (pc: CampaignCharacter) => void
}

export type TgTabProps = { app: TgAppContext }

// ─────────────────────────── shell ───────────────────────────

const TABS: { tab: TgTab; icon: string; label: string }[] = [
  { tab: 'action', icon: '⚡', label: 'Действие' },
  { tab: 'character', icon: '🎒', label: 'Персонаж' },
  { tab: 'party', icon: '🏰', label: 'Партия' },
]

export function TgShell({
  supabase,
  userId,
  role,
  campaignId,
  loopNumber,
  characters,
  categories,
}: {
  supabase: SupabaseClient
  userId: string
  role: TgRole
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  categories: Map<string, string>
}) {
  const ownPcs = characters.filter((c) => c.isOwn)
  const multi = characters.length > 1

  // Логика rootView из старого page.tsx: ровно один свой PC → сразу внутрь;
  // иначе поверх корня лежит выбор персонажа (аналог экрана 'list').
  const [activePc, setActivePc] = useState<CampaignCharacter | null>(
    () => ownPcs[0] ?? characters[0] ?? null,
  )
  const [navState, setNavState] = useState<{ tab: TgTab; stack: NavEntry[] }>(() => ({
    tab: 'action',
    stack:
      ownPcs.length === 1 || characters.length <= 1
        ? [{ screen: 'action' }]
        : [{ screen: 'action' }, { screen: 'pc-select' }],
  }))

  const push = useCallback((entry: NavEntry) => {
    setNavState((s) => ({ ...s, stack: [...s.stack, entry] }))
  }, [])
  const pop = useCallback(() => {
    setNavState((s) => (s.stack.length > 1 ? { ...s, stack: s.stack.slice(0, -1) } : s))
  }, [])
  const replace = useCallback((entry: NavEntry) => {
    setNavState((s) => ({ ...s, stack: [...s.stack.slice(0, -1), entry] }))
  }, [])
  const reset = useCallback((tab: TgTab) => {
    setNavState({ tab, stack: [{ screen: tab }] })
  }, [])

  const top = navState.stack[navState.stack.length - 1]
  const nav = useMemo<TgNav>(
    () => ({ tab: navState.tab, stack: navState.stack, top, push, pop, replace, reset }),
    [navState, top, push, pop, replace, reset],
  )

  // Realtime (FR-010 / T023, перенос из page.tsx): migration 117 броадкастит
  // `tx_insert` в приватный канал кампании на каждую транзакцию. Каждое событие
  // инкрементит refreshKey; видимый экран несёт его в deps load-эффекта, так что
  // второе устройство перезагружается за ~2 с, а открытые шиты/скролл живут.
  // Если Realtime недоступен — приложение работает на ручном обновлении.
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])
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
  const refresh = useMemo<TgRefresh>(() => ({ refreshKey, bump }), [refreshKey, bump])

  if (characters.length === 0 || !activePc) {
    return <Centered>В этой кампании пока нет персонажей.</Centered>
  }

  const app: TgAppContext = {
    supabase,
    userId,
    role,
    campaignId,
    loopNumber,
    characters,
    categories,
    activePc,
    setActivePc,
  }

  return (
    <NavContext.Provider value={nav}>
      <RefreshContext.Provider value={refresh}>
        <div className="mx-auto max-w-sm pb-24">
          <ShellHeader
            pc={activePc}
            canSwitch={multi}
            onSwitch={() => {
              if (top.screen !== 'pc-select') push({ screen: 'pc-select' })
            }}
            onOpenWiki={() => {
              if (top.screen !== 'wiki') push({ screen: 'wiki' })
            }}
          />
          <ShellScreen app={app} nav={nav} refreshKey={refreshKey} />
        </div>
        <TabBar active={navState.tab} onSelect={reset} />
      </RefreshContext.Provider>
    </NavContext.Provider>
  )
}

function ShellHeader({
  pc,
  canSwitch,
  onSwitch,
  onOpenWiki,
}: {
  pc: CampaignCharacter
  canSwitch: boolean
  onSwitch: () => void
  onOpenWiki: () => void
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <button
        onClick={canSwitch ? onSwitch : undefined}
        disabled={!canSwitch}
        className={
          'flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl px-1 text-left ' +
          (canSwitch ? 'transition-colors hover:bg-neutral-900' : 'cursor-default')
        }
      >
        <Avatar name={pc.title} keyStr={pc.primaryPortraitKey} size={32} />
        <span className="truncate font-medium">{pc.title}</span>
        {canSwitch && <span className="shrink-0 text-xs text-neutral-500">⌄</span>}
      </button>
      <button
        onClick={onOpenWiki}
        aria-label="Каталог"
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-xl transition-colors hover:bg-neutral-900"
      >
        📖
      </button>
    </div>
  )
}

function TabBar({ active, onSelect }: { active: TgTab; onSelect: (tab: TgTab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-sm">
        {TABS.map((t) => (
          <button
            key={t.tab}
            onClick={() => onSelect(t.tab)}
            aria-current={active === t.tab ? 'page' : undefined}
            className={
              'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ' +
              (active === t.tab ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300')
            }
          >
            <span className="text-xl leading-none">{t.icon}</span>
            <span className="text-[11px]">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

// ─────────────────────────── screen router ───────────────────────────

function ShellScreen({
  app,
  nav,
  refreshKey,
}: {
  app: TgAppContext
  nav: TgNav
  refreshKey: number
}) {
  const { top, push, pop } = nav
  const { supabase, userId, role, campaignId, loopNumber, characters, activePc } = app

  switch (top.screen) {
    // Корни табов — контент отдают модули W2/W3/W4.
    case 'action':
      return <ActionHub app={app} />
    case 'character':
      return <CharacterTab app={app} />
    case 'party':
      return <PartyTab app={app} />

    // Выбор активного PC (переиспользован CharacterList — свои сверху).
    case 'pc-select':
      return (
        <CharacterList
          characters={characters}
          onSelect={(pc) => {
            app.setActivePc(pc)
            pop()
          }}
        />
      )

    // Каталог/вики — существующий wiki-app как экраны стека.
    case 'wiki':
      return (
        <WikiListScreen
          supabase={supabase}
          campaignId={campaignId}
          onSelect={(item) => push({ screen: 'wiki-node', params: { nodeId: item.id, title: item.title } })}
          onBack={pop}
        />
      )
    case 'wiki-node': {
      const { nodeId, title } = (top.params ?? {}) as { nodeId: string; title: string }
      return (
        <WikiNodeScreen
          key={nodeId}
          supabase={supabase}
          campaignId={campaignId}
          nodeId={nodeId}
          title={title}
          onBack={pop}
          onOpenNode={(id, t) => push({ screen: 'wiki-node', params: { nodeId: id, title: t } })}
        />
      )
    }

    // ── Мосты из аккордеона ⋯ Ещё (ActionHub): наборы и стартовый набор —
    //    последние экраны ledger-app, до которых можно дойти из shell напрямую. ──
    case 'legacy-sets':
      return (
        <SetsScreen
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          buyerPc={activePc}
          userId={userId}
          role={role}
          onBack={pop}
          refreshKey={refreshKey}
        />
      )
    case 'legacy-equip':
      return (
        <StarterEquipScreen
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          character={activePc}
          onBack={pop}
          refreshKey={refreshKey}
        />
      )

    // Неизвестный экран → активный таб рендерит его сам (W2/W3/W4).
    default:
      switch (nav.tab) {
        case 'action':
          return <ActionHub app={app} />
        case 'character':
          return <CharacterTab app={app} />
        case 'party':
          return <PartyTab app={app} />
      }
  }
}
