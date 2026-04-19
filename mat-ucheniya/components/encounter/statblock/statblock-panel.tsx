'use client'

import { useState, useCallback } from 'react'
import { Shield, Eye, Swords, Zap, Crown, Sparkles } from 'lucide-react'
import { HpBar } from './hp-bar'
import { CounterChip } from './counter-chip'
import { StatRow } from './stat-row'
import { StatblockSection } from './statblock-section'
import { ActionButton, ActionTooltip } from './action-button'
import { TargetPickerDialog, type PickerParticipant } from './target-picker-dialog'
import type { Statblock, StatblockAction } from '@/lib/statblock'

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
    conditions: string[]   // condition names
  }
  /** Parsed statblock for the participant's node (or null = empty state). */
  statblock: Statblock | null
  /** All active participants in the encounter, for target picker. */
  otherParticipants: PickerParticipant[]
  disabled?: boolean
  onChangeReactions: (used: number) => void
  onChangeLegendary: (used: number) => void
  /** Called when an action is fired. `targetIds` is [] for single/self. */
  onActionUsed: (action: StatblockAction, targetIds: string[]) => void
}

export function StatblockPanel({
  participant,
  statblock,
  otherParticipants,
  disabled,
  onChangeReactions,
  onChangeLegendary,
  onActionUsed,
}: Props) {
  const [picker, setPicker] = useState<StatblockAction | null>(null)
  const [hover, setHover] = useState<{ action: StatblockAction; el: HTMLElement } | null>(null)

  const handleAction = useCallback(
    (a: StatblockAction) => {
      if (disabled) return
      if (a.targeting === 'area') {
        setPicker(a)
        return
      }
      // single/self: fire immediately with no target list
      onActionUsed(a, [])
      // Spend legendary cost if any
      if (a.cost && a.cost > 0 && statblock) {
        const budget = statblock.legendary_budget ?? 0
        onChangeLegendary(Math.min(budget, participant.legendary_used + a.cost))
      }
    },
    [disabled, onActionUsed, onChangeLegendary, participant.legendary_used, statblock],
  )

  const handlePickerApply = useCallback(
    (ids: string[]) => {
      if (picker) {
        onActionUsed(picker, ids)
        if (picker.cost && picker.cost > 0 && statblock) {
          const budget = statblock.legendary_budget ?? 0
          onChangeLegendary(Math.min(budget, participant.legendary_used + picker.cost))
        }
      }
      setPicker(null)
    },
    [picker, onActionUsed, onChangeLegendary, participant.legendary_used, statblock],
  )

  // ── Empty state: no statblock data on the node ──
  if (!statblock) {
    return (
      <div
        className="rounded-lg border bg-white p-4 text-center"
        style={{ borderColor: 'var(--gray-200)' }}
      >
        <div className="text-[13px] font-medium" style={{ color: 'var(--gray-900)' }}>
          {participant.display_name}
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--fg-3)' }}>
          У этой ноды нет статблока.
          <br />
          Открой карточку в каталоге и заполни поля (ac, hp, actions…).
        </div>
      </div>
    )
  }

  const sb = statblock
  const legBudget = sb.legendary_budget ?? 0
  const legRemaining = Math.max(0, legBudget - participant.legendary_used)

  return (
    <>
      <div
        className="sticky top-4 flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-lg border bg-white"
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
                {[sb.size, sb.type].filter(Boolean).join(' ')}
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
                <div className="flex items-center gap-1">
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
                className="font-semibold uppercase tracking-wider"
                style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
              >
                HP
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
                  {sb.speed.fly !== undefined && <div>fly {sb.speed.fly}</div>}
                  {sb.speed.swim !== undefined && <div>swim {sb.speed.swim}</div>}
                  {sb.speed.climb !== undefined && <div>climb {sb.speed.climb}</div>}
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
              onDec={() => onChangeReactions(Math.max(0, participant.used_reactions - 1))}
              onInc={() => onChangeReactions(Math.min(1, participant.used_reactions + 1))}
            />
            {legBudget > 0 && (
              <CounterChip
                label="Легендарки"
                used={participant.legendary_used}
                max={legBudget}
                icon="crown"
                disabled={disabled}
                onDec={() => onChangeLegendary(Math.max(0, participant.legendary_used - 1))}
                onInc={() => onChangeLegendary(Math.min(legBudget, participant.legendary_used + 1))}
              />
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

          {(sb.senses || sb.immunities || sb.resistances) && (
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
              {sb.senses?.darkvision && (
                <>
                  <span style={{ color: 'var(--fg-3)' }}>·</span>
                  <span>darkvision {sb.senses.darkvision}</span>
                </>
              )}
              {sb.senses?.blindsight && (
                <>
                  <span style={{ color: 'var(--fg-3)' }}>·</span>
                  <span>blindsight {sb.senses.blindsight}</span>
                </>
              )}
              {sb.immunities && (
                <>
                  <span style={{ color: 'var(--fg-3)' }}>·</span>
                  <span style={{ color: 'var(--red-600)' }}>имм: {sb.immunities}</span>
                </>
              )}
              {sb.resistances && (
                <>
                  <span style={{ color: 'var(--fg-3)' }}>·</span>
                  <span style={{ color: 'var(--orange-500)' }}>рез: {sb.resistances}</span>
                </>
              )}
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
    </>
  )
}
