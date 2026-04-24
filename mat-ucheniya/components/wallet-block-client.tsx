'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TransactionFormSheet from './transaction-form-sheet'
import TransactionRow from './transaction-row'
import WalletBalance from './wallet-balance'
import type {
  Category,
  TransactionWithRelations,
  Wallet,
} from '@/lib/transactions'
import { deleteTransaction, deleteTransfer } from '@/app/actions/transactions'

type Props = {
  /** Section heading — "Кошелёк" for PCs, "Баланс общака" for the stash. */
  heading: string
  wallet: Wallet
  walletCaption: string
  /** Render the "нет текущей петли — показан lifetime итог" note. */
  showLifetimeFallback: boolean

  campaignId: string
  campaignSlug: string
  actorNodeId: string
  currentUserId: string
  /** Viewer is campaign owner or DM — can edit/delete any row. */
  canManage: boolean
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  /** Current wallet aggregate — fed into the transaction form for shortfall prompt. */
  currentWalletGp?: number
  categories: Category[]
  recent: TransactionWithRelations[]
}

/**
 * Balance + "+ Транзакция" button + recent activity list + sheet host.
 *
 * Layout: vertical stacking.
 *   Row 1: heading + balance (left) · "+ Транзакция" (right)
 *   Row 2: recent list, full width
 *   Row 3: "Все транзакции →" link, right-aligned
 *
 * Reused on both the PC catalog detail page and the stash page. The
 * `heading` + `wallet`/`walletCaption` props make the same client
 * component serve both without page-specific branching.
 */
export default function WalletBlockClient({
  heading,
  wallet,
  walletCaption,
  showLifetimeFallback,
  campaignId,
  campaignSlug,
  actorNodeId,
  currentUserId,
  canManage,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  currentWalletGp,
  categories,
  recent,
}: Props) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const openCreate = useCallback(() => {
    setEditing(null)
    setSheetOpen(true)
  }, [])

  const openEdit = useCallback((tx: TransactionWithRelations) => {
    setEditing(tx)
    setSheetOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setEditing(null)
  }, [])

  const handleDelete = useCallback(
    async (row: TransactionWithRelations) => {
      const isTransfer =
        row.kind === 'transfer' && !!row.transfer_group_id
      const prompt = isTransfer
        ? 'Удалить перевод? Обе стороны будут удалены.'
        : 'Удалить эту транзакцию?'
      if (!confirm(prompt)) return
      setBusyId(row.id)
      try {
        const res = isTransfer
          ? await deleteTransfer(row.transfer_group_id!)
          : await deleteTransaction(row.id)
        if (!res.ok) {
          alert(res.error)
          return
        }
        router.refresh()
      } finally {
        setBusyId(null)
      }
    },
    [router],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: heading + balance (left) · action button (right) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {heading}
          </div>
          <div className="mt-1">
            <WalletBalance wallet={wallet} caption={walletCaption} />
          </div>
          {showLifetimeFallback && (
            <p className="mt-2 text-xs text-gray-400">
              Текущая петля не определена — показан итог за всю историю.
              Создайте активную петлю, чтобы вести учёт по текущему циклу.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex-shrink-0 self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + Транзакция
        </button>
      </div>

      {/* Row 2: full-width recent list */}
      <RecentList
        recent={recent}
        campaignSlug={campaignSlug}
        currentUserId={currentUserId}
        canManage={canManage}
        busyId={busyId}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {/* Row 3: "Все транзакции" link, right-aligned */}
      <div className="flex justify-end">
        <Link
          href={`/c/${campaignSlug}/accounting?pc=${actorNodeId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          Все транзакции →
        </Link>
      </div>

      <TransactionFormSheet
        open={sheetOpen}
        onClose={closeSheet}
        campaignId={campaignId}
        actorPcId={actorNodeId}
        defaultLoopNumber={defaultLoopNumber}
        defaultDayInLoop={defaultDayInLoop}
        defaultSessionId={defaultSessionId}
        currentWalletGp={currentWalletGp}
        categories={categories}
        editing={editing}
      />
    </div>
  )
}

function RecentList({
  recent,
  campaignSlug,
  currentUserId,
  canManage,
  busyId,
  onEdit,
  onDelete,
}: {
  recent: TransactionWithRelations[]
  campaignSlug: string
  currentUserId: string
  canManage: boolean
  busyId: string | null
  onEdit: (tx: TransactionWithRelations) => void
  onDelete: (tx: TransactionWithRelations) => void
}) {
  if (recent.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
        В этой петле пока нет транзакций
      </div>
    )
  }

  return (
    <ul className="flex w-full flex-col gap-1.5">
      {recent.map((tx) => {
        const canEditRow = canManage || tx.author_user_id === currentUserId
        return (
          <TransactionRow
            key={tx.id}
            tx={tx}
            campaignSlug={campaignSlug}
            showActor={false}
            canEdit={canEditRow}
            onEdit={onEdit}
            onDelete={onDelete}
            busy={busyId === tx.id}
          />
        )
      })}
    </ul>
  )
}
