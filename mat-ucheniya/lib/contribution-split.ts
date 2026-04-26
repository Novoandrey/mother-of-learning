/**
 * Spec-017 — Складчина split helper.
 *
 * Pure, no I/O. Tested in `__tests__/contribution-split.test.ts`.
 *
 * Все функции работают в копейках внутри (multiply ×100 → integer
 * math → ÷100 на выходе) чтобы не словить классическое
 * `0.1 + 0.2 ≠ 0.3` с floats. Numeric(12, 2) на стороне Postgres
 * гарантирует что input всегда укладывается в 2 decimals — мы
 * просто округляем при заходе в helper и обратно при выходе.
 */

const CENTS_PER_UNIT = 100

/**
 * Внутренний хелпер: number → integer cents с округлением до
 * ближайшего цента. 0.1 → 10, 750 → 75000, 750.005 → 75001.
 */
function toCents(value: number): number {
  return Math.round(value * CENTS_PER_UNIT)
}

/** Внутренний хелпер: integer cents → number с 2 decimals. */
function fromCents(cents: number): number {
  return Math.round(cents) / CENTS_PER_UNIT
}

/**
 * Split `total` равными долями между `n` участниками. Floor-cents
 * с остатком в первой строке (детерминизм важнее equity — автор
 * перетыкает вручную если нужно).
 *
 * Examples:
 *   splitEqual(4500, 6)  → [750, 750, 750, 750, 750, 750]
 *   splitEqual(100, 3)   → [33.34, 33.33, 33.33] (cents-precise)
 *   splitEqual(0.05, 3)  → [0.05, 0, 0]
 *   splitEqual(1, 1)     → [1]
 *
 * Throws on n ≤ 0 or total ≤ 0 — форма не должна вызывать с такими
 * параметрами; throw здесь — guard от логических ошибок выше по
 * стеку.
 */
export function splitEqual(total: number, n: number): number[] {
  if (n <= 0 || !Number.isInteger(n)) {
    throw new Error(`splitEqual: n must be positive integer, got ${n}`)
  }
  if (total <= 0) {
    throw new Error(`splitEqual: total must be positive, got ${total}`)
  }

  const totalCents = toCents(total)
  const baseCents = Math.floor(totalCents / n)
  const remainderCents = totalCents - baseCents * n

  const shares: number[] = []
  for (let i = 0; i < n; i++) {
    const cents = baseCents + (i === 0 ? remainderCents : 0)
    shares.push(fromCents(cents))
  }
  return shares
}

/**
 * Sum shares with cent-precision (защита от IEEE float drift).
 * Empty array → 0.
 */
export function sumShares(shares: number[]): number {
  let cents = 0
  for (const s of shares) {
    cents += toCents(s)
  }
  return fromCents(cents)
}

/**
 * Проверка что sum(shares) === total с epsilon 0.005 (полцента).
 * Внутри сравниваются integer cents, так что фактически exact.
 * Epsilon только для ground (никаких float-drift сюрпризов).
 */
export function sharesMatchTotal(shares: number[], total: number): boolean {
  const sumCents = shares.reduce((acc, s) => acc + toCents(s), 0)
  const totalCents = toCents(total)
  return Math.abs(sumCents - totalCents) === 0
}

/**
 * Edit-form guard: можно ли уменьшить total до `newTotal` без
 * нарушения paid-rows-frozen rule.
 *
 * Если `newTotal < sum(paid shares)` — нельзя, отдаём reason +
 * `paidSum` для UI-сообщения.
 */
export function canReduceTotal(
  newTotal: number,
  participants: Array<{ share: number; paid: boolean }>,
): { ok: true } | { ok: false; reason: string; paidSum: number } {
  const paidCents = participants.reduce(
    (acc, p) => acc + (p.paid ? toCents(p.share) : 0),
    0,
  )
  const paidSum = fromCents(paidCents)
  const newTotalCents = toCents(newTotal)

  if (newTotalCents < paidCents) {
    return {
      ok: false,
      reason:
        `Нельзя сделать общую сумму меньше уже собранного ` +
        `(собрано ${paidSum.toFixed(2)}). Сначала расжмите чекбокс ` +
        `у кого-то из тех, кто отмечен «сдал».`,
      paidSum,
    }
  }
  return { ok: true }
}
