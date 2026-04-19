'use client'

import { useState, useCallback } from 'react'
import { Shield, Eye, Swords, Zap, Crown, Sparkles } from 'lucide-react'
import { HpBar } from './hp-bar'
import { CounterChip } from './counter-chip'
import { StatRow } from './stat-row'
import { StatblockSection } from './statblock-section'
import { ActionButton, ActionTooltip } from './action-button'
import { TargetPickerDialog, type PickerParticipant } from './target-picker-dialog'
import { ActionResolveDialog, type ResolveResult } from './action-resolve-dialog'
import {
  creatureTypeInfo,
  effectiveProficiency,
  formatMod,
  type Statblock,
  type StatblockAction,
  type AbilityScores,
} from '@/lib/statblock'

type Props = {
  /** Selected participant (turn-holder, or user-picked). */
  participant: {
    id: string
    display_name: string
    current_hp: number
    max_hp: number
    temp_hp: number
    used_reactions: number
    legendary_used: number
    legendary_resistance_used: number
    conditions: string[]
  }
  statblock: Statblock | null
  otherParticipants: PickerParticipant[]
  disabled?: boolean
  onChangeReactions: (used: number) => void
  onChangeLegendary: (used: number) => void
  onChangeLegendaryResistance: (used: number) => void
  /**
   * Fires after the DM has decided what happened — writes event log and
   * applies damage to targets.
   */
  onActionResolved: (
    action: StatblockAction,
    targets: PickerParticipant[],
    result: ResolveResult,
  ) => void
}

const ABILITY_KEYS: (keyof AbilityScores)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ABILITY_LABEL_RU: Record<keyof AbilityScores, string> = {
  str: 'СИЛ', dex: 'ЛВК', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР',
}

export function StatblockPanel({
  participant,
  statblock,
  otherParticipants,
  disabled,
  onChangeReactions,
  onChangeLegendary,
  onChangeLegendaryResistance,
  onActionResolved,
}: Props) {
  const [picker, setPicker] = useState<StatblockAction | null>(null)
  // Resolve step holds the action and the chosen targets. `targets=[]` → self.
  const [resolving, setResolving] = useState<
    { action: StatblockAction; targets: PickerParticipant[] } | null
  >(null)
  const [hover, setHover] = useState<{ action: StatblockAction; el: HTMLElement } | null>(null)

  // Start action flow: pick targets first (single/area) or resolve directly (self).
  const handleAction = useCallback(
    (a: StatblockAction) => {
      if (disabled) return
      if (a.targeting === 'self') {
        setResolving({ action: a, targets: [] })
        return
      }
      // single or area → target picker first
      setPicker(a)
    },
    [disabled],
  )

  // Picker confirmed → open resolve step with chosen targets.
  const handlePickerApply = useCallback(
    (ids: string[]) => {
      if (!picker) return
      const chosen = otherParticipants.filter((p) => ids.includes(p.id))
      setResolving({ action: picker, targets: chosen })
      setPicker(null)
    },
    [picker, otherParticipants],
  )

  // Resolve confirmed → bubble up, charge legendary cost, close.
  const handleResolveApply = useCallback(
    (result: ResolveResult) => {
      if (!resolving) return
      const { action, targets } = resolving
      onActionResolved(action, targets, result)
      if (action.cost && action.cost > 0 && statblock) {
        const budget = statblock.legendary_budget ?? 0
        onChangeLegendary(Math.min(budget, participant.legendary_used + action.cost))
      }
      setResolving(null)
    },
    [resolving, onActionResolved, onChangeLegendary, participant.legendary_used, statblock],
  )

  if (!statblock) {
    return (
      <div
        className="sticky top-4 flex w-full max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-lg border bg-white"
        style={{ borderColor: 'var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="border-b p-3.5" style={{ borderColor: 'var(--gray-200)' }}>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--gray-900)' }}>
            {participant.display_name}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
            У этой ноды нет статблока.
            <br />
            Открой карточку в каталоге и заполни поля (ac, hp, actions…).
          </div>
        </div>
      </div>
    )
  }

  const sb = statblock
  const legBudget = sb.legendary_budget ?? 0
  const legRemaining = Math.max(0, legBudget - participant.legendary_used)
  const lrBudget = sb.legendary_resistance_budget ?? 0
  const lrRemaining = Math.max(0, lrBudget - participant.legendary_resistance_used)
  const pb = effectiveProficiency(sb)
  const typeInfo = creatureTypeInfo(sb.type)

  const saves = sb.saves ?? {}
  const saveEntries = ABILITY_KEYS
    .filter((k) => typeof saves[k] === 'number')
    .map((k) => ({ key: k, label: ABILITY_LABEL_RU[k], mod: saves[k] as number }))

  const skills = sb.skills ?? {}
  const skillEntries = Object.entries(skills)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ key: k, label: humanizeSkill(k), mod: v as number }))

  return (
    <>
      <div
        className="sticky top-4 flex w-full max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-lg border bg-white"
        style={{ borderColor: 'var(--gray-200)', boxShadow: 'var(--shadow-sm)' }}
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <div
          className="relative border-b p-3.5"
          style={{ borderColor: 'var(--gray-200)' }}
        >
          <div className="mb-1.5 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div
                className="text-[17px] font-bold leading-tight"
                style={{ color: 'var(--gray-900)', letterSpacing: '-0.01em' }}
              >
                {participant.display_name}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--fg-3)' }}>
                {sb.size && <span>{sb.size} </span>}
                {sb.type && (
                  <span
                    className={typeInfo ? 'underline decoration-dotted cursor-help' : undefined}
                    title={typeInfo ? `${typeInfo.label} — ${typeInfo.desc}` : undefined}
                  >
                    {sb.type}
                  </span>
                )}
                {sb.alignment && <span>, {sb.alignment}</span>}
                {sb.name && participant.display_name !== sb.name && ` · ${sb.name}`}
              </div>
            </div>
            {sb.cr && (
              <span
                className="rounded font-mono text-[10px] font-semibold"
                style={{ padding: '2px 7px', background: 'var(--gray-900)', color: '#fff', letterSpacing: '0.02em' }}
              >
                CR {sb.cr}
              </span>
            )}
          </div>

          <div
            className="mt-1.5 grid items-end gap-3.5"
            style={{ gridTemplateColumns: 'auto 1fr auto' }}
          >
            {sb.ac !== undefined && (
              <div>
                <div
                  className="font-semibold uppercase tracking-wider"
                  style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
                >
                  AC
                </div>
                <div
                  className="flex items-center gap-1"
                  title={sb.ac_detail || undefined}
                >
                  <Shield size={14} strokeWidth={1.5} style={{ color: 'var(--fg-2)' }} />
                  <span
                    className="font-mono tabular font-bold"
                    style={{ fontSize: 20, color: 'var(--gray-900)' }}
                  >
                    {sb.ac}
                  </span>
                </div>
              </div>
            )}
            <div>
              <div
                className="flex items-baseline gap-1.5 font-semibold uppercase tracking-wider"
                style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
              >
                HP
                {sb.hit_dice && (
                  <span
                    className="font-mono normal-case tracking-normal"
                    style={{ color: 'var(--fg-3)', letterSpacing: 0 }}
                  >
                    · {sb.hit_dice}
                  </span>
                )}
              </div>
              <HpBar
                current={participant.current_hp}
                max={participant.max_hp}
                tempHp={participant.temp_hp}
                size="big"
              />
            </div>
            {sb.speed && (
              <div className="text-right">
                <div
                  className="font-semibold uppercase tracking-wider"
                  style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
                >
                  Скор.
                </div>
                <div className="font-mono text-[11px] leading-snug" style={{ color: 'var(--fg-2)' }}>
                  {sb.speed.walk !== undefined && <div>walk {sb.speed.walk}</div>}
                  {sb.speed.fly !== undefined && (
                    <div>fly {sb.speed.fly}{sb.speed.hover ? ' (hover)' : ''}</div>
                  )}
                  {sb.speed.swim !== undefined && <div>swim {sb.speed.swim}</div>}
                  {sb.speed.climb !== undefined && <div>climb {sb.speed.climb}</div>}
                  {sb.speed.burrow !== undefined && <div>burrow {sb.speed.burrow}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <CounterChip
              label="Реакция"
              used={participant.used_reactions}
              max={1}
              icon="zap"
              disabled={disabled}
              onSpend={() => onChangeReactions(Math.min(1, participant.used_reactions + 1))}
              onRestore={() => onChangeReactions(Math.max(0, participant.used_reactions - 1))}
            />
            {legBudget > 0 && (
              <CounterChip
                label="Легендарки"
                used={participant.legendary_used}
                max={legBudget}
                icon="crown"
                disabled={disabled}
                onSpend={() => onChangeLegendary(Math.min(legBudget, participant.legendary_used + 1))}
                onRestore={() => onChangeLegendary(Math.max(0, participant.legendary_used - 1))}
              />
            )}
            {lrBudget > 0 && (
              <CounterChip
                label="Сопротивл."
                used={participant.legendary_resistance_used}
                max={lrBudget}
                icon="sparkles"
                disabled={disabled}
                onSpend={() =>
                  onChangeLegendaryResistance(
                    Math.min(lrBudget, participant.legendary_resistance_used + 1),
                  )
                }
                onRestore={() =>
                  onChangeLegendaryResistance(
                    Math.max(0, participant.legendary_resistance_used - 1),
                  )
                }
              />
            )}
            {pb !== undefined && (
              <span
                className="inline-flex items-center rounded border font-mono text-[10px]"
                style={{
                  padding: '2px 7px',
                  borderColor: 'var(--gray-200)',
                  color: 'var(--fg-2)',
                  background: 'var(--gray-50)',
                }}
                title="Бонус мастерства"
              >
                PB <b className="ml-1" style={{ color: 'var(--gray-900)' }}>{formatMod(pb)}</b>
              </span>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3.5 pt-2.5 pb-4">
          {sb.stats && (
            <div className="mb-3">
              <StatRow stats={sb.stats} />
            </div>
          )}

          {saveEntries.length > 0 && (
            <div
              className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px]"
              style={{ color: 'var(--fg-2)' }}
            >
              <span
                className="font-semibold uppercase tracking-wider"
                style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
              >
                Спасы
              </span>
              {saveEntries.map((s) => (
                <span key={s.key} className="font-mono tabular">
                  {s.label} <b style={{ color: 'var(--gray-900)' }}>{formatMod(s.mod)}</b>
                </span>
              ))}
            </div>
          )}

          {skillEntries.length > 0 && (
            <div
              className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px]"
              style={{ color: 'var(--fg-2)' }}
            >
              <span
                className="font-semibold uppercase tracking-wider"
                style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
              >
                Навыки
              </span>
              {skillEntries.map((s) => (
                <span key={s.key} className="font-mono tabular">
                  {s.label} <b style={{ color: 'var(--gray-900)' }}>{formatMod(s.mod)}</b>
                </span>
              ))}
            </div>
          )}

          {(sb.senses || sb.immunities || sb.resistances || sb.vulnerabilities || sb.condition_immunities || sb.languages) && (
            <div
              className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-y py-2 text-[11px]"
              style={{ borderColor: 'var(--gray-100)', color: 'var(--fg-2)' }}
            >
              {sb.senses?.passive_perception !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Eye size={11} strokeWidth={1.5} style={{ color: 'var(--fg-3)' }} />
                  PP{' '}
                  <b className="font-mono tabular" style={{ color: 'var(--gray-900)' }}>
                    {sb.senses.passive_perception}
                  </b>
                </span>
              )}
              {sb.senses?.darkvision && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span>darkvision {sb.senses.darkvision} ft</span></>)}
              {sb.senses?.blindsight && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span>blindsight {sb.senses.blindsight} ft</span></>)}
              {sb.senses?.truesight && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span>truesight {sb.senses.truesight} ft</span></>)}
              {sb.senses?.tremorsense && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span>tremorsense {sb.senses.tremorsense} ft</span></>)}
              {sb.vulnerabilities && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span style={{ color: '#b45309' }}>уязв: {sb.vulnerabilities}</span></>)}
              {sb.immunities && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span style={{ color: 'var(--red-600)' }}>имм: {sb.immunities}</span></>)}
              {sb.resistances && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span style={{ color: 'var(--orange-500)' }}>рез: {sb.resistances}</span></>)}
              {sb.condition_immunities && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span>имм. состояний: {sb.condition_immunities}</span></>)}
              {sb.languages && (<><span style={{ color: 'var(--fg-3)' }}>·</span><span>языки: {sb.languages}</span></>)}
            </div>
          )}

          {sb.actions.length > 0 && (
            <StatblockSection title="Действия" count={sb.actions.length} icon={Swords}>
              <div className="flex flex-col gap-1.5">
                {sb.actions.map((a) => (
                  <ActionButton
                    key={a.name}
                    action={a}
                    disabled={disabled}
                    active={picker?.name === a.name}
                    onClick={handleAction}
                    onHover={(act, el) => setHover(act && el ? { action: act, el } : null)}
                  />
                ))}
              </div>
            </StatblockSection>
          )}

          {sb.bonus_actions.length > 0 && (
            <StatblockSection title="Бонусные" count={sb.bonus_actions.length} icon={Zap}>
              <div className="flex flex-col gap-1.5">
                {sb.bonus_actions.map((a) => (
                  <ActionButton
                    key={a.name}
                    action={a}
                    disabled={disabled}
                    active={picker?.name === a.name}
                    onClick={handleAction}
                    onHover={(act, el) => setHover(act && el ? { action: act, el } : null)}
                  />
                ))}
              </div>
            </StatblockSection>
          )}

          {sb.reactions.length > 0 && (
            <StatblockSection title="Реакции" count={sb.reactions.length} icon={Zap}>
              <div className="flex flex-col gap-1.5">
                {sb.reactions.map((a) => (
                  <ActionButton
                    key={a.name}
                    action={a}
                    disabled={disabled || participant.used_reactions >= 1}
                    active={picker?.name === a.name}
                    onClick={(act) => {
                      handleAction(act)
                      onChangeReactions(Math.min(1, participant.used_reactions + 1))
                    }}
                    onHover={(act, el) => setHover(act && el ? { action: act, el } : null)}
                  />
                ))}
              </div>
            </StatblockSection>
          )}

          {sb.legendary_actions.length > 0 && (
            <StatblockSection
              title={`Легендарные · ${legRemaining}/${legBudget}`}
              count={sb.legendary_actions.length}
              icon={Crown}
            >
              <div className="flex flex-col gap-1.5">
                {sb.legendary_actions.map((a) => {
                  const cost = a.cost ?? 1
                  const noBudget = legRemaining < cost
                  return (
                    <ActionButton
                      key={a.name}
                      action={a}
                      disabled={disabled || noBudget}
                      active={picker?.name === a.name}
                      onClick={handleAction}
                      onHover={(act, el) => setHover(act && el ? { action: act, el } : null)}
                    />
                  )
                })}
              </div>
            </StatblockSection>
          )}

          {sb.passives.length > 0 && (
            <StatblockSection title="Пассивно" count={sb.passives.length} icon={Sparkles}>
              <div className="flex flex-col gap-1.5">
                {sb.passives.map((ps) => (
                  <div
                    key={ps.name}
                    className="rounded-md border p-2.5"
                    style={{ borderColor: 'var(--gray-200)', background: 'var(--gray-50)' }}
                  >
                    <div
                      className="mb-0.5 text-[12px] font-semibold"
                      style={{ color: 'var(--gray-900)' }}
                    >
                      {ps.name}
                    </div>
                    <div className="text-[11px] leading-relaxed" style={{ color: 'var(--fg-2)' }}>
                      {ps.desc}
                    </div>
                  </div>
                ))}
              </div>
            </StatblockSection>
          )}

          {lrBudget > 0 && (
            <div
              className="mt-3 rounded border px-2.5 py-1.5 text-[11px]"
              style={{
                borderColor: 'var(--gray-200)',
                background: 'var(--gray-50)',
                color: 'var(--fg-2)',
              }}
            >
              <b>Легендарное сопротивление:</b> {lrRemaining}/{lrBudget} осталось сегодня.
            </div>
          )}

          {(sb.source_doc || sb.statblock_url) && (
            <div
              className="mt-3 border-t pt-2 text-[10px]"
              style={{ borderColor: 'var(--gray-100)', color: 'var(--fg-3)' }}
            >
              {sb.source_doc && <span>Источник: {sb.source_doc}</span>}
              {sb.source_doc && sb.statblock_url && <span> · </span>}
              {sb.statblock_url && (
                <a
                  href={sb.statblock_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-600"
                >
                  статблок ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {hover && <ActionTooltip action={hover.action} anchor={hover.el} />}

      {picker && (
        <TargetPickerDialog
          action={picker}
          participants={otherParticipants}
          onApply={handlePickerApply}
          onClose={() => setPicker(null)}
        />
      )}

      {resolving && (
        <ActionResolveDialog
          action={resolving.action}
          targets={resolving.targets}
          onApply={handleResolveApply}
          onClose={() => setResolving(null)}
        />
      )}
    </>
  )
}

const SKILL_LABEL_RU: Record<string, string> = {
  acrobatics: 'Акроб',
  animal_handling: 'Уход',
  arcana: 'Аркан',
  athletics: 'Атлет',
  deception: 'Обман',
  history: 'История',
  insight: 'Проница',
  intimidation: 'Запугив',
  investigation: 'Рассл',
  medicine: 'Медиц',
  nature: 'Природа',
  perception: 'Воспр',
  performance: 'Выступ',
  persuasion: 'Убежд',
  religion: 'Религия',
  sleight_of_hand: 'Ловк. рук',
  stealth: 'Скрытн',
  survival: 'Выжив',
}

function humanizeSkill(key: string): string {
  const k = key.toLowerCase().trim()
  if (SKILL_LABEL_RU[k]) return SKILL_LABEL_RU[k]
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
