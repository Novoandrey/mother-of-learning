'use client';

/**
 * `<StashButtons>` — spec-011 T022.
 *
 * Two buttons side by side: "Положить в Общак" / "Взять из Общака".
 * Each opens the `<TransactionFormSheet>` pre-pinned to the stash
 * (direction encoded in `initialTransferDirection`). The form then
 * dispatches to the right stash action on save.
 *
 * Rendered in two contexts:
 *   - PC page (`/c/[slug]/catalog/[id]` when type='character'),
 *     next to the existing "+ Транзакция" button.
 *   - Ledger actor bar (`/accounting`) when the selected actor is
 *     a PC (not the stash itself).
 *
 * Mobile-first: big tap targets, full width on narrow viewports,
 * side-by-side at sm+. Disabled state when no loop is current —
 * stash flows require a loop (FR-010 carry-over from spec-010).
 */

import { useCallback, useState } from 'react';
import TransactionFormSheet from './transaction-form-sheet';
import type { Category, TransactionWithRelations } from '@/lib/transactions';

type Props = {
  campaignId: string;
  campaignSlug: string;
  canEditCatalog: boolean;
  actorPcId: string;
  /** `null` → no current loop → buttons disabled with a hint. */
  currentLoopNumber: number | null;
  defaultDay: number;
  defaultSessionId: string | null;
  /** Pre-fetched on the server to avoid a second round-trip. */
  categories?: Category[];
};

export default function StashButtons({
  campaignId,
  campaignSlug,
  canEditCatalog,
  actorPcId,
  currentLoopNumber,
  defaultDay,
  defaultSessionId,
  categories,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [direction, setDirection] = useState<
    'put-into-stash' | 'take-from-stash' | null
  >(null);

  const openPut = useCallback(() => {
    setDirection('put-into-stash');
    setSheetOpen(true);
  }, []);

  const openTake = useCallback(() => {
    setDirection('take-from-stash');
    setSheetOpen(true);
  }, []);

  const close = useCallback(() => {
    setSheetOpen(false);
    setDirection(null);
  }, []);

  const disabled = currentLoopNumber === null;
  const hint = disabled
    ? 'Отметьте петлю как текущую, чтобы пользоваться общаком'
    : undefined;

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={openPut}
          disabled={disabled}
          title={hint}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          Положить в Общак
        </button>
        <button
          type="button"
          onClick={openTake}
          disabled={disabled}
          title={hint}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          Взять из Общака
        </button>
      </div>

      <TransactionFormSheet
        open={sheetOpen}
        onClose={close}
        campaignId={campaignId}
          campaignSlug={campaignSlug}
          canEditCatalog={canEditCatalog}
        actorPcId={actorPcId}
        defaultLoopNumber={currentLoopNumber ?? 1}
        defaultDayInLoop={defaultDay}
        defaultSessionId={defaultSessionId}
        categories={categories}
        editing={null as TransactionWithRelations | null}
        initialTransferDirection={direction}
      />
    </>
  );
}
