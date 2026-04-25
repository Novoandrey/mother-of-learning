import Link from 'next/link'
import type { PendingBatch } from '@/lib/approval'
import QueueBatchCard from './queue-batch-card'

type Props = {
  batches: PendingBatch[]
  campaignSlug: string
  isDM: boolean
  currentUserId: string
}

/**
 * Spec-014 T027 — server component listing pending batches.
 *
 * `getPendingBatches` already returns sorted newest-first; we just iterate
 * and let `<QueueBatchCard>` (client) handle expand/collapse + actions.
 *
 * Empty state: a friendly nudge back to the ledger. No CTA — submitting
 * new transactions still happens on `/accounting` (or PC pages); the
 * queue is a destination for monitoring, not authoring.
 */
export default function QueueList({
  batches,
  campaignSlug,
  isDM,
  currentUserId,
}: Props) {
  if (batches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        <p className="mb-2 text-base text-gray-700">Очередь пуста</p>
        <p>
          {isDM
            ? 'Когда игроки отправят заявки, они появятся здесь.'
            : 'У вас сейчас нет ожидающих заявок.'}
        </p>
        <Link
          href={`/c/${campaignSlug}/accounting`}
          className="mt-4 inline-block text-sm text-blue-700 hover:text-blue-900"
        >
          ← Вернуться в ленту
        </Link>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {batches.map((batch) => (
        <QueueBatchCard
          key={batch.batchId}
          batch={batch}
          campaignSlug={campaignSlug}
          isDM={isDM}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  )
}
