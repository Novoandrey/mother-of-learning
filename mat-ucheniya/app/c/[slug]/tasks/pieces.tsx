'use client'

import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  type Card as CardModel,
  type Member,
  findMember,
  findProject,
  findStatus,
  findType,
  fmtDate,
  stripRefPrefix,
} from './types-and-data'

/* ─────────────────────── Avatar ─────────────────────── */
export function Avatar({ memberId, size = 'md' }: { memberId: string | null; size?: 'md' | 'lg' }) {
  const m = memberId ? findMember(memberId) : undefined
  if (!m)
    return (
      <span className={`tt-avatar placeholder${size === 'lg' ? ' lg' : ''}`} aria-label="Не назначен">
        —
      </span>
    )
  return (
    <span
      className={`tt-avatar${size === 'lg' ? ' lg' : ''}`}
      style={{ background: m.color }}
      title={m.name}
    >
      {m.initials}
    </span>
  )
}

/* ─────────────────────── Status pill ─────────────────────── */
export function StatusPill({ statusId }: { statusId: string }) {
  const s = findStatus(statusId)
  if (!s) return null
  return (
    <span className="tt-st-pill" data-st={statusId}>
      <span className="tt-dot" />
      {s.label}
    </span>
  )
}

/* ─────────────────────── Card (in cell) ─────────────────────── */
export function Card({
  card,
  onOpen,
  isActive,
  onDragStart,
  onDragEnd,
  showProject,
}: {
  card: CardModel
  onOpen: (card: CardModel, anchor: HTMLElement) => void
  isActive: boolean
  onDragStart: (e: React.DragEvent<HTMLDivElement>, card: CardModel) => void
  onDragEnd: () => void
  showProject?: boolean
}) {
  const t = findType(card.type)
  const proj = showProject ? findProject(card.project) : undefined
  return (
    <div
      className={`tt-card${isActive ? ' active' : ''}`}
      data-st={card.status}
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={(e) => onOpen(card, e.currentTarget)}
      role="button"
      tabIndex={0}
    >
      <div className="tt-bar" />
      <div className="tt-body">
        <div className="tt-top">
          <span className="tt-em" title={t.label}>
            {t.emoji}
          </span>
          <span className="tt-ref">{card.ref}</span>
          {proj && (
            <span className="tt-ref" style={{ opacity: 0.6 }}>
              · {proj.name}
            </span>
          )}
          {card.needsAttention && (
            <span className="tt-att" title="Требует внимания">
              ●
            </span>
          )}
        </div>
        <div className="tt-ttl">{stripRefPrefix(card.title)}</div>
        <div className="tt-meta">
          <Avatar memberId={card.assignee} />
          <span className="tt-spacer" />
          {card.lastActivity && (
            <span title={`${card.lastActivity.chat} · ${card.lastActivity.date}`}>
              {fmtDate(card.lastActivity.date)}
            </span>
          )}
          <span
            className={`tt-sync${card.autoSynced ? '' : ' off'}`}
            title={card.autoSynced ? 'Auto-sync вкл.' : 'Auto-sync выкл.'}
          >
            {card.autoSynced ? '↻' : '·'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────── Picker ─────────────────────── */
export function Picker({
  anchor,
  onClose,
  align = 'start',
  children,
}: {
  anchor: HTMLElement
  onClose: () => void
  align?: 'start' | 'end'
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    const w = ref.current.offsetWidth
    setPos({
      top: a.bottom + 4,
      left: align === 'end' ? Math.max(8, a.right - w) : a.left,
    })
  }, [anchor, align])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="tt-picker" ref={ref} style={{ top: pos.top, left: pos.left }}>
      {children}
    </div>,
    document.body,
  )
}

/* ─────────────────────── Popover (expanded card) ─────────────────────── */
export function Popover({
  card,
  anchorEl,
  onClose,
  onUpdate,
  onRemove,
  isDM,
  onOpenStatusPicker,
  onOpenAssigneePicker,
  onOpenProjectPicker,
}: {
  card: CardModel
  anchorEl: HTMLElement
  onClose: () => void
  onUpdate: (patch: Partial<CardModel>) => void
  onRemove: (id: string) => void
  isDM: boolean
  onOpenStatusPicker: (anchor: HTMLElement) => void
  onOpenAssigneePicker: (anchor: HTMLElement) => void
  onOpenProjectPicker: (anchor: HTMLElement) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    top: number
    left: number
    arrowSide: 'left' | 'right'
    anchorTop: number
  }>({ top: 0, left: 0, arrowSide: 'left', anchorTop: 0 })

  useLayoutEffect(() => {
    if (!anchorEl || !ref.current) return
    const a = anchorEl.getBoundingClientRect()
    const w = ref.current.offsetWidth
    const h = ref.current.offsetHeight
    let left = a.right + 10
    let arrowSide: 'left' | 'right' = 'left'
    if (left + w > window.innerWidth - 10) {
      left = a.left - w - 10
      arrowSide = 'right'
    }
    let top = a.top + a.height / 2 - h / 2
    top = Math.max(20, Math.min(top, window.innerHeight - h - 20))
    setPos({ top, left, arrowSide, anchorTop: a.top + a.height / 2 })
  }, [anchorEl])

  const t = findType(card.type)
  const proj = findProject(card.project)
  const stat = findStatus(card.status)
  const assignee = card.assignee ? findMember(card.assignee) : undefined

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="tt-popover-backdrop" onClick={onClose} />
      <div
        className="tt-popover"
        ref={ref}
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="tt-pop-arrow"
          style={
            pos.arrowSide === 'right'
              ? { right: -6, top: pos.anchorTop - pos.top - 5, transform: 'rotate(135deg)' }
              : { left: -6, top: pos.anchorTop - pos.top - 5, transform: 'rotate(-45deg)' }
          }
        />
        <header>
          <div className="tt-row-1">
            <span className="tt-em">{t.emoji}</span>
            <span>{t.label}</span>
            <span>·</span>
            <span>{card.ref}</span>
            {card.needsAttention && (
              <span style={{ color: 'var(--red-600)' }}>● внимание</span>
            )}
            <button
              className="tt-btn-icon"
              style={{ marginLeft: 'auto' }}
              onClick={onClose}
              aria-label="Закрыть"
              type="button"
            >
              ✕
            </button>
          </div>
          <h3>{stripRefPrefix(card.title)}</h3>
        </header>

        <div className="tt-pop-section">
          <dl className="tt-pop-grid">
            <dt>Статус</dt>
            <dd>
              <button
                className="tt-trigger"
                onClick={(e) => onOpenStatusPicker(e.currentTarget)}
                type="button"
              >
                <StatusPill statusId={card.status} />
                <span className="tt-muted">▾</span>
              </button>
            </dd>

            <dt>Проект</dt>
            <dd>
              <button
                className="tt-trigger"
                onClick={(e) => onOpenProjectPicker(e.currentTarget)}
                type="button"
              >
                <span>{proj?.name}</span>
                <span className="tt-muted">▾</span>
              </button>
            </dd>

            <dt>Исполнитель</dt>
            <dd>
              <button
                className="tt-trigger"
                onClick={(e) => onOpenAssigneePicker(e.currentTarget)}
                type="button"
              >
                {assignee ? (
                  <>
                    <Avatar memberId={(assignee as Member).id} />
                    <span>{(assignee as Member).name}</span>
                  </>
                ) : (
                  <span className="tt-muted">— не назначен</span>
                )}
                <span className="tt-muted">▾</span>
              </button>
            </dd>

            <dt>Внимание</dt>
            <dd>
              <button
                className={`tt-tog${card.needsAttention ? ' on' : ''}`}
                onClick={() => onUpdate({ needsAttention: !card.needsAttention })}
                type="button"
                aria-pressed={card.needsAttention}
              />
              <span className="tt-note">пометить, что карточка требует решения</span>
            </dd>

            <dt>Auto-sync</dt>
            <dd>
              <button
                className={`tt-tog${card.autoSynced ? ' on' : ''}`}
                onClick={() => isDM && onUpdate({ autoSynced: !card.autoSynced })}
                style={!isDM ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                title={!isDM ? 'Только ДМ' : undefined}
                disabled={!isDM}
                type="button"
                aria-pressed={card.autoSynced}
              />
              <span className="tt-note">
                {card.autoSynced ? "статус обновляется по chatlog'ам" : 'ручной режим'}
              </span>
            </dd>
          </dl>
        </div>

        {card.excerpt && (
          <div className="tt-pop-section">
            <div style={{ marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--gray-400)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                Описание узла
              </span>
            </div>
            <div className="tt-excerpt">{card.excerpt}</div>
          </div>
        )}

        <div className="tt-pop-section">
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                color: 'var(--gray-400)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              Активность
            </span>
          </div>
          <div className="tt-activity">
            {card.lastActivity ? (
              <>
                <div>
                  {card.lastActivity.chat} · {fmtDate(card.lastActivity.date)} · auto →{' '}
                  <span style={{ color: stat?.color === 'blue' ? 'var(--blue-600)' : 'inherit' }}>
                    {stat?.label}
                  </span>
                </div>
                <div className="tt-muted">создано вручную · 2026-04-08</div>
              </>
            ) : (
              <div className="tt-muted">создано вручную · нет авто-обновлений</div>
            )}
          </div>
        </div>

        <div className="tt-pop-section tt-pop-actions">
          <button className="tt-btn-sec tiny" type="button">
            Открыть узел →
          </button>
          <button className="tt-btn-sec tiny" type="button" onClick={() => onRemove(card.id)}>
            Снять с доски
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
