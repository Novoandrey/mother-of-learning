'use client';

/**
 * `<ShortfallPrompt>` — spec-011 T023.
 *
 * Inline warning banner shown *inside* the transaction form when the
 * user types an expense that overdraws the PC's wallet (FR-008). Three
 * visual modes driven by how much the stash can contribute:
 *
 *   1. Stash rich  (stashGp >= shortfall): "Не хватает N gp; добрать
 *      из общака?"  + [Да, добрать] / [Нет, уйти в минус].
 *   2. Stash poor  (0 < stashGp < shortfall): "Не хватает N gp; в
 *      общаке только M gp; добрать M + (N−M) в минус?"
 *   3. Stash empty (stashGp === 0): "Не хватает N gp; общак пуст.
 *      Сохранить (персонаж уйдёт в минус)?" + [Да] / [Отмена].
 *
 * NEVER a modal — this is an inline affordance so the user can keep
 * editing the amount and the prompt updates live. Parent manages the
 * "prompt visible" state (condition: shortfall > 0, non-stash actor,
 * kind='expense', amount > 0).
 *
 * Styling uses project tokens: amber for warning, red accent for the
 * "fully negative" / empty-stash case.
 */

type Props = {
  shortfallGp: number;
  stashGp: number;
  /** Accept the covering transfer and proceed with the expense. */
  onAcceptBorrow: () => void;
  /** Decline the transfer — fall through to spec-010 baseline (negative wallet). */
  onDeclineBorrow: () => void;
};

function formatGp(value: number): string {
  // Trim trailing zeros for cp precision (no `1.00 gp`, keep `1 gp`).
  if (Number.isInteger(value)) return `${value} gp`;
  return `${value.toFixed(2).replace(/\.?0+$/, '')} gp`;
}

export default function ShortfallPrompt({
  shortfallGp,
  stashGp,
  onAcceptBorrow,
  onDeclineBorrow,
}: Props) {
  if (shortfallGp <= 0) return null;

  const toBorrow = Math.min(shortfallGp, Math.max(0, stashGp));
  const remainder = shortfallGp - toBorrow;

  const mode: 'rich' | 'poor' | 'empty' =
    stashGp <= 0 ? 'empty' : stashGp >= shortfallGp ? 'rich' : 'poor';

  const bannerClass =
    mode === 'empty'
      ? 'rounded-lg border border-red-200 bg-red-50 p-3'
      : 'rounded-lg border border-amber-200 bg-amber-50 p-3';

  const titleClass =
    mode === 'empty'
      ? 'text-sm font-medium text-red-800'
      : 'text-sm font-medium text-amber-900';

  const title = (() => {
    if (mode === 'rich') {
      return `Не хватает ${formatGp(shortfallGp)} — добрать из общака?`;
    }
    if (mode === 'poor') {
      return `Не хватает ${formatGp(shortfallGp)}; в общаке только ${formatGp(stashGp)}`;
    }
    return `Не хватает ${formatGp(shortfallGp)}; общак пуст`;
  })();

  const subtitle = (() => {
    if (mode === 'rich') return null;
    if (mode === 'poor') {
      return `Добрать ${formatGp(toBorrow)} и уйти в минус на ${formatGp(remainder)}?`;
    }
    return 'Сохранить расход — персонаж уйдёт в минус?';
  })();

  return (
    <div className={bannerClass} role="alert">
      <p className={titleClass}>{title}</p>
      {subtitle && (
        <p className="mt-1 text-sm text-gray-700">{subtitle}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAcceptBorrow}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {mode === 'empty' ? 'Да, сохранить' : 'Да, добрать'}
        </button>
        <button
          type="button"
          onClick={onDeclineBorrow}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {mode === 'empty' ? 'Отмена' : 'Нет, уйти в минус'}
        </button>
      </div>
    </div>
  );
}
