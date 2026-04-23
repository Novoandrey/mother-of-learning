'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Loop, Session } from '@/lib/loops'
import { assignLanes } from './loop-progress-bar-lanes'

type Props = {
  loop: Pick<Loop, 'id' | 'length_days' | 'status'>
  sessions: Session[]
  campaignSlug: string
}

// Per-day minimum width. Columns stretch to 1fr of available space,
// so a 30-day bar fills the card on desktop and still fits on mobile.
// No horizontal scrollbar needed — the grid is fluid.
const DAY_MIN_WIDTH = 18

/**
 * Horizontal timeline for a single loop. Dated sessions are placed as
 * segments spanning `day_from..day_to` on lanes assigned by the
 * greedy `assignLanes` algorithm (overlaps stack on separate rows).
 *
 * Interactions (T016):
 *   - Desktop (≥sm): hovering a segment shows a tooltip below it via
 *     pure CSS group-hover (no JS / no portal).
 *   - Mobile (<sm): tapping a segment opens a bottom sheet with the
 *     same content. Closed via backdrop tap or the ✕ button.
 *
 * Frontier marker: for a `current` loop, a dashed vertical line is
 * drawn after `max(day_to)` with a caption "Дошли до дня N".
 *
 * Undated sessions (no day_from/day_to) are listed as a pill row
 * below the bar with links to their pages.
 */
export function LoopProgressBar({ loop, sessions, campaignSlug }: Props) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const dated = sessions.filter(
    (s): s is Session & { day_from: number; day_to: number } =>
      s.day_from != null && s.day_to != null,
  )
  const undated = sessions.filter((s) => s.day_from == null || s.day_to == null)

  const { laneById, laneCount } = assignLanes(
    dated.map((s) => ({ id: s.id, day_from: s.day_from, day_to: s.day_to })),
  )

  const totalDays = Math.max(1, loop.length_days)
  // Fluid columns: each day is at least DAY_MIN_WIDTH px, then
  // distributes extra space equally up to 1fr. No overflow container
  // needed — the grid auto-fits the parent card.
  const gridCols = `repeat(${totalDays}, minmax(${DAY_MIN_WIDTH}px, 1fr))`

  // Frontier = the largest day_to reached so far. Rendered only on
  // current loops — past/future loops skip the marker.
  const frontier = dated.length === 0 ? null : Math.max(...dated.map((s) => s.day_to))
  const showFrontier = loop.status === 'current' && frontier !== null
  // Frontier marker sits at the right edge of the `frontier` day
  // column. Expressed as a percentage of the grid so it stays aligned
  // regardless of column width.
  const frontierPercent = frontier != null ? (frontier / totalDays) * 100 : null

  const openSession = openSessionId
    ? sessions.find((s) => s.id === openSessionId) ?? null
    : null

  return (
    <div>
      <div className="relative pb-1">
        {/* Day axis */}
        <div className="grid mb-1.5" style={{ gridTemplateColumns: gridCols }}>
          {Array.from({ length: totalDays }, (_, i) => {
            const day = i + 1
            const isMajor = day % 5 === 0 || day === 1
            return (
              <div
                key={day}
                className={`text-center text-[10px] leading-tight ${
                  isMajor ? 'text-gray-600 font-medium' : 'text-gray-300'
                }`}
              >
                {day}
              </div>
            )
          })}
        </div>

        {/* Lanes */}
        {dated.length === 0 ? (
          <div
            className="h-7 rounded border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400 italic"
          >
            пока нет сессий с датами
          </div>
        ) : (
          Array.from({ length: laneCount }, (_, laneIdx) => (
            <div
              key={laneIdx}
              className="grid mb-1"
              style={{ gridTemplateColumns: gridCols }}
            >
              {dated
                .filter((s) => laneById.get(s.id) === laneIdx)
                .map((s) => (
                  <SegmentBlock
                    key={s.id}
                    session={s}
                    dayFrom={s.day_from}
                    dayTo={s.day_to}
                    totalDays={totalDays}
                    onOpen={setOpenSessionId}
                    campaignSlug={campaignSlug}
                  />
                ))}
            </div>
          ))
        )}

        {/* Frontier marker — solid blue vertical line. Positioned by
            percentage to stay in sync with fluid columns. A 0-width
            element with dashed border sometimes renders nothing; a
            filled 2px-wide div is reliable. */}
        {showFrontier && frontierPercent != null && (
          <div
            className="absolute top-3 bottom-1 w-0.5 bg-blue-500 pointer-events-none"
            style={{ left: `${frontierPercent}%` }}
            aria-hidden
          />
        )}
      </div>

      {showFrontier && frontierPercent != null && (
        <div className="relative h-5">
          <span
            className="absolute -top-0.5 whitespace-nowrap text-xs font-medium text-blue-600"
            style={{
              // Anchor under the line; clamp so near-edge labels don't
              // overflow the card.
              left: `${Math.min(Math.max(frontierPercent, 2), 98)}%`,
              transform: 'translateX(-50%)',
            }}
          >
            ↑ дошли до дня {frontier}
          </span>
        </div>
      )}

      {undated.length > 0 && (
        <div className="mt-3 text-sm">
          <span className="text-gray-400">Без дат: </span>
          {undated.map((s, i) => (
            <span key={s.id} className="contents">
              <Link
                href={`/c/${campaignSlug}/sessions/${s.id}`}
                className="rounded px-1.5 py-0.5 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <span className="font-mono text-xs text-gray-400">
                  #{s.session_number}
                </span>{' '}
                {s.title}
              </Link>
              {i < undated.length - 1 && <span className="text-gray-300 mx-0.5">·</span>}
            </span>
          ))}
        </div>
      )}

      {/* Mobile bottom sheet — desktop uses CSS hover tooltip instead. */}
      {openSession && (
        <MobileSheet
          session={openSession}
          campaignSlug={campaignSlug}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </div>
  )
}

// ─── Segment (single session block on a lane) ──────────────────────────

function SegmentBlock({
  session,
  dayFrom,
  dayTo,
  totalDays,
  onOpen,
  campaignSlug,
}: {
  session: Session
  dayFrom: number
  dayTo: number
  totalDays: number
  onOpen: (id: string) => void
  campaignSlug: string
}) {
  // Clamp to grid bounds so legacy data with out-of-range days doesn't
  // overflow the row or produce invalid grid-column values.
  const clampedFrom = Math.max(1, Math.min(dayFrom, totalDays))
  const clampedTo = Math.max(clampedFrom, Math.min(dayTo, totalDays))

  return (
    <div
      className="group relative"
      style={{ gridColumn: `${clampedFrom} / ${clampedTo + 1}` }}
    >
      <button
        type="button"
        onClick={() => onOpen(session.id)}
        className="block w-full h-7 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 text-[11px] font-mono text-blue-800 leading-none overflow-hidden transition-colors"
        title={`#${session.session_number} ${session.title}`}
      >
        #{session.session_number}
      </button>

      {/* Desktop-only tooltip. Hidden on mobile (below sm); only group-hover
          at sm+ reveals it. */}
      <div className="hidden sm:group-hover:block absolute z-20 top-full mt-1 left-0 w-60 rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-xs">
        <SessionDetailCard session={session} campaignSlug={campaignSlug} />
      </div>
    </div>
  )
}

// ─── Shared detail content used by both tooltip and bottom sheet ────────

function SessionDetailCard({
  session,
  campaignSlug,
}: {
  session: Session
  campaignSlug: string
}) {
  const dayRange =
    session.day_from != null && session.day_to != null
      ? session.day_from === session.day_to
        ? `День ${session.day_from}`
        : `Дни ${session.day_from}–${session.day_to}`
      : null

  return (
    <div>
      <div className="font-medium text-gray-900">
        <span className="font-mono text-gray-400 mr-1">#{session.session_number}</span>
        {session.title}
      </div>
      {dayRange && <div className="text-gray-500 mt-1">{dayRange}</div>}
      {session.participants.length > 0 && (
        <div className="mt-2 text-gray-700">
          <span className="text-gray-400">Участники: </span>
          {session.participants.map((p) => p.title).join(', ')}
        </div>
      )}
      <Link
        href={`/c/${campaignSlug}/sessions/${session.id}`}
        className="block mt-2 text-blue-600 hover:underline"
      >
        Открыть →
      </Link>
    </div>
  )
}

// ─── Mobile bottom sheet ────────────────────────────────────────────────

function MobileSheet({
  session,
  campaignSlug,
  onClose,
}: {
  session: Session
  campaignSlug: string
  onClose: () => void
}) {
  return (
    <div className="sm:hidden fixed inset-0 z-50 flex items-end" role="dialog">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Закрыть"
      />
      <div className="relative w-full rounded-t-xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <SessionDetailCard session={session} campaignSlug={campaignSlug} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 text-xl leading-none text-gray-400 hover:text-gray-700"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
