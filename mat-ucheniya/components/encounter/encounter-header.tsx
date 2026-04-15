'use client'

import { SaveAsTemplateButton } from '@/components/save-as-template-button'

type Participant = {
  id: string
  display_name: string
  max_hp: number
  role: string
  sort_order: number
  node_id: string | null
}

type Props = {
  title: string
  status: 'active' | 'completed'
  currentRound: number
  onRoundChange: (delta: number) => void
  onNextTurn: () => void
  onEndCombat: () => void
  campaignId: string
  participants: Participant[]
}

export function EncounterHeader({
  title,
  status,
  currentRound,
  onRoundChange,
  onNextTurn,
  onEndCombat,
  campaignId,
  participants,
}: Props) {
  const isCompleted = status === 'completed'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {isCompleted && (
          <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-600">
            Завершён
          </span>
        )}
      </div>

      {!isCompleted && (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
          {/* Round counter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">Раунд</span>
            <button
              onClick={() => onRoundChange(-1)}
              disabled={currentRound <= 1}
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              −
            </button>
            <span className="min-w-[2ch] text-center text-lg font-bold text-gray-900">
              {currentRound}
            </span>
            <button
              onClick={() => onRoundChange(1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              +
            </button>
          </div>

          {/* Next turn */}
          <button
            onClick={onNextTurn}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Следующий ход →
          </button>

          <div className="flex-1" />

          {/* Template + End */}
          <SaveAsTemplateButton
            campaignId={campaignId}
            participants={participants}
          />
          <button
            onClick={onEndCombat}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            Завершить бой
          </button>
        </div>
      )}
    </div>
  )
}
