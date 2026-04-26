/**
 * Pure validators for transaction inputs — spec-010.
 *
 * All validators return `null` on success or a Russian error string
 * on failure. Errors are user-facing; callers render them as-is in
 * form field captions / inline banners.
 *
 * The DB has CHECK constraints that cover the same ground at write
 * time — these validators exist so the UI can reject bad input
 * before round-tripping to the server. Keep messages and rules in
 * sync with migration 034.
 */

import type { CoinSet } from './transactions';
import { DENOMINATIONS } from './transaction-resolver';

export type ValidationError = string;

/**
 * `amount_gp` must be a finite non-zero number. `0` transactions
 * carry no information and are blocked at the DB too
 * (`transactions_money_nonzero`). `null`/`undefined` fails — every
 * money/transfer row needs an amount.
 */
export function validateAmountSign(
  amount_gp: number | null | undefined,
): ValidationError | null {
  if (amount_gp === null || amount_gp === undefined) {
    return 'Укажите сумму';
  }
  if (!Number.isFinite(amount_gp)) {
    return 'Сумма должна быть числом';
  }
  if (amount_gp === 0) {
    return 'Сумма не может быть нулём';
  }
  return null;
}

/**
 * Day must be an integer in `[1, loopLength]`. The DB also
 * enforces `[1, 365]` as an absolute cap; this validator uses the
 * loop-specific upper bound so spec-009's variable-length loops
 * get tight feedback.
 */
export function validateDayInLoop(
  day: number,
  loopLength: number,
): ValidationError | null {
  if (!Number.isInteger(day)) {
    return 'День должен быть целым числом';
  }
  if (day < 1 || day > loopLength) {
    return `День должен быть от 1 до ${loopLength}`;
  }
  return null;
}

/**
 * Transfer pre-check: no self-transfer, no cross-loop transfer.
 * Server action re-validates with DB-joined data — this is the
 * client-side fast-fail so the user sees the error inline without
 * a submit round-trip.
 */
export function validateTransfer(
  senderId: string,
  recipientId: string,
  senderLoop: number,
  recipientLoop: number,
): ValidationError | null {
  if (!senderId || !recipientId) {
    return 'Выберите отправителя и получателя';
  }
  if (senderId === recipientId) {
    return 'Нельзя переводить самому себе';
  }
  if (senderLoop !== recipientLoop) {
    return 'Перевод возможен только внутри одной петли';
  }
  return null;
}

/**
 * Coin-set invariants: every slot is an integer, at least one
 * slot is non-zero, no negative-zero values (JS's `-0` would slip
 * through a `!== 0` check but break equality invariants downstream).
 */
export function validateCoinSet(coins: CoinSet): ValidationError | null {
  let anyNonZero = false;
  for (const d of DENOMINATIONS) {
    const v = coins[d];
    if (!Number.isInteger(v)) {
      return `Количество ${d.toUpperCase()} должно быть целым числом`;
    }
    // Object.is(-0, 0) is false — catches negative-zero literals
    // that survived arithmetic elsewhere.
    if (Object.is(v, -0)) {
      return 'Отрицательный ноль недопустим';
    }
    if (v !== 0) anyNonZero = true;
  }
  if (!anyNonZero) {
    return 'Хотя бы одна монета должна быть ненулевой';
  }
  return null;
}

// ============================================================================
// Item-transfer validators — spec-011
// ============================================================================

/**
 * `item_qty` must be a non-zero integer. The DB CHECK was relaxed in
 * migration 036 (`item_qty <> 0`) so transfer pairs can encode
 * direction by sign. Spec-015 chat 64 extends this to single-leg
 * item rows: `+ Предмет` writes a positive qty (gained), `− Предмет`
 * writes a negative qty (lost). Used by the UI for inline feedback
 * before submitting the form.
 */
export function validateItemQty(qty: number): ValidationError | null {
  if (typeof qty !== 'number' || !Number.isFinite(qty)) {
    return 'Количество должно быть числом';
  }
  if (!Number.isInteger(qty)) {
    return 'Количество должно быть целым числом';
  }
  if (qty === 0) {
    return 'Количество не может быть нулём';
  }
  return null;
}

/**
 * Pre-flight validator for item transfer inputs. Rejects empty /
 * whitespace-only item names; delegates qty checks to `validateItemQty`.
 * Server-side validation in `createItemTransfer` reruns this with the
 * exact same rule set to keep client and server in lockstep.
 */
export function validateItemTransfer(input: {
  itemName: string;
  qty: number;
}): ValidationError | null {
  if (!input.itemName || input.itemName.trim().length === 0) {
    return 'Укажите название предмета';
  }
  return validateItemQty(input.qty);
}
