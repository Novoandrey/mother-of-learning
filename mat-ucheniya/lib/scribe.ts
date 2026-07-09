/**
 * Scribe (написание свитков) — spec-059. PURE helpers, no I/O, no server-only
 * imports — unit-testable и импортируемы откуда угодно (образец: lib/craft.ts).
 * Серверный экшен (`app/actions/scribe.ts`) делает БД-работу; этот модуль
 * только комбинирует уже разрешённые значения. Тунабельные числа (таблица
 * часов/цен) — в `lib/scribe-settings.ts`.
 *
 * ⚠️ Экономика ИНАЯ, чем у крафта: часы — это ПОРОГ (Σ часов писцов ≥ норма
 * таблицы для уровня заклинания), а деньги — ФИКС-цена из таблицы (НЕ часы×ставка).
 */

/** Одна строка писца, как её шлёт клиент: PC-нода + вложенные часы. */
export type ScribeParticipantInput = { nodeId: string; hours: number }

/**
 * Санитайз payload писцов до хранимой формы [{nodeId, hours}]: выкинуть строки
 * без node id или с неположительными/невалидными часами; округлить часы до 2 зн.
 * (гигиена jsonb — UI шлёт float-остатки при равном делении).
 */
export function cleanScribeParticipants(
  list: ScribeParticipantInput[] | undefined,
): { nodeId: string; hours: number }[] {
  return (list ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.nodeId === 'string' &&
        p.nodeId.length > 0 &&
        Number.isFinite(p.hours) &&
        p.hours > 0,
    )
    .map((p) => ({ nodeId: p.nodeId, hours: Math.round(p.hours * 100) / 100 }))
}

/** Суммарные вложенные часы писцов. Пустой список → 0. */
export function totalScribeHours(participants: { hours: number }[]): number {
  let total = 0
  for (const p of participants) {
    if (Number.isFinite(p.hours) && p.hours > 0) total += p.hours
  }
  return Math.round(total * 100) / 100
}

/**
 * Сколько ещё часов нужно, чтобы достичь нормы записи (инвариант spec-059:
 * `Σ(часы писцов) ≥ норма_часов(уровень)`). 0 = норма покрыта. Округление ВВЕРХ
 * до 2 зн., чтобы сообщение об ошибке никогда не недопрашивало.
 */
export function missingScribeHours(
  requiredHours: number,
  totalHours: number,
): number {
  const missing = requiredHours - totalHours
  if (missing <= 1e-9) return 0
  return Math.ceil(missing * 100) / 100
}
