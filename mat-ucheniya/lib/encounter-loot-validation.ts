/**
 * Spec-013 — Loot-draft input validators.
 *
 * Pure, no I/O. Tested in `__tests__/encounter-loot-validation.test.ts`.
 *
 * Pattern matches `lib/starter-setup-validation.ts` — no zod runtime
 * dependency, hand-rolled checks returning the project's
 * `{ ok: true, value } | { ok: false, error }` shape so callers can
 * toast Russian messages directly.
 *
 * Two entry points:
 *   - `validateLootLine(input)` — structural + per-line invariants.
 *   - `validateLootDraft(input)` — calls `validateLootLine` per
 *     element + draft-level checks (loop_number, day_in_loop).
 *
 * Out of scope here:
 *   - PC node existence (`recipient_pc_id` resolves to a real
 *     character-typed node in the campaign) — requires DB; lives in
 *     the action layer.
 *   - Participant-set check ("at least one participant when any line
 *     has split_evenly") — DB-dependent, validated at apply-time.
 *   - Encounter status guard ("apply only when completed") — also
 *     action-layer.
 *
 * UUID format check is loose (regex) on purpose: the goal is to
 * reject obvious garbage (empty string, non-uuid input from a
 * malicious client) without depending on a uuid library.
 */

import type {
  CoinLine,
  ItemLine,
  LootDraft,
  LootLine,
} from './encounter-loot-types'

// ─────────────────────────── shared shape ───────────────────────────

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function looksLikeUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

// ─────────────────────────── per-line ───────────────────────────

export function validateLootLine(input: unknown): ValidateResult<LootLine> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Строка лута должна быть объектом' }
  }
  const obj = input as Record<string, unknown>

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return { ok: false, error: 'У строки лута отсутствует id' }
  }

  if (obj.kind === 'coin') {
    return validateCoinLine(obj)
  }
  if (obj.kind === 'item') {
    return validateItemLine(obj)
  }
  return {
    ok: false,
    error: `Неизвестный тип строки: ${JSON.stringify(obj.kind)}`,
  }
}

function validateCoinLine(obj: Record<string, unknown>): ValidateResult<CoinLine> {
  for (const k of ['cp', 'sp', 'gp', 'pp'] as const) {
    if (!isNonNegInt(obj[k])) {
      return {
        ok: false,
        error: `Номинал "${k}" должен быть целым неотрицательным числом`,
      }
    }
  }

  const cp = obj.cp as number
  const sp = obj.sp as number
  const gp = obj.gp as number
  const pp = obj.pp as number

  if (cp + sp + gp + pp === 0) {
    return {
      ok: false,
      error: 'Монетная строка должна содержать хотя бы один ненулевой номинал',
    }
  }

  // Optional comment — free-text label like «Тела пауков».
  let comment: string | undefined
  if (obj.comment != null) {
    if (typeof obj.comment !== 'string') {
      return { ok: false, error: 'comment должен быть строкой' }
    }
    if (obj.comment.length > 200) {
      return { ok: false, error: 'comment слишком длинный (макс 200)' }
    }
    const trimmed = obj.comment.trim()
    comment = trimmed === '' ? undefined : trimmed
  }

  // chat-50 polish: legacy `recipient_mode` / `recipient_pc_id` fields
  // are silently ignored if present (forwards-compat for old drafts).
  // Distribution is now a draft-level setting.

  return {
    ok: true,
    value: {
      id: obj.id as string,
      kind: 'coin',
      cp,
      sp,
      gp,
      pp,
      ...(comment !== undefined ? { comment } : {}),
    },
  }
}

function validateItemLine(obj: Record<string, unknown>): ValidateResult<ItemLine> {
  const rawName = obj.name
  if (typeof rawName !== 'string') {
    return { ok: false, error: 'У предмета должно быть имя (строка)' }
  }
  const name = rawName.trim()
  if (name.length === 0) {
    return { ok: false, error: 'Имя предмета не может быть пустым' }
  }

  if (!isNonNegInt(obj.qty) || (obj.qty as number) <= 0) {
    return { ok: false, error: 'Количество предмета должно быть положительным целым' }
  }

  const mode = obj.recipient_mode
  if (mode !== 'pc' && mode !== 'stash') {
    return {
      ok: false,
      error:
        'Для предметов recipient_mode может быть только pc или stash (split_evenly не поддерживается)',
    }
  }

  let recipientPcId: string | null
  if (mode === 'pc') {
    if (!looksLikeUuid(obj.recipient_pc_id)) {
      return {
        ok: false,
        error: 'Для recipient_mode=pc нужен валидный recipient_pc_id (uuid)',
      }
    }
    recipientPcId = obj.recipient_pc_id as string
  } else {
    if (obj.recipient_pc_id != null) {
      return {
        ok: false,
        error: 'recipient_pc_id должен быть null при recipient_mode=stash',
      }
    }
    recipientPcId = null
  }

  // Spec-015 (T038). `item_node_id` is optional. When present and not
  // null, must be a uuid string. When absent / null / undefined, the
  // line stays free-text and reconcile writes no link. Drafts produced
  // before mig 044 simply lack the field and pass through unchanged
  // (FR-018).
  let itemNodeId: string | null = null
  if ('item_node_id' in obj && obj.item_node_id != null) {
    if (!looksLikeUuid(obj.item_node_id)) {
      return {
        ok: false,
        error: 'item_node_id должен быть валидным uuid либо null',
      }
    }
    itemNodeId = obj.item_node_id as string
  }

  return {
    ok: true,
    value: {
      id: obj.id as string,
      kind: 'item',
      name,
      qty: obj.qty as number,
      recipient_mode: mode,
      recipient_pc_id: recipientPcId,
      ...(itemNodeId !== null ? { item_node_id: itemNodeId } : {}),
    },
  }
}

// ─────────────────────────── full draft ───────────────────────────

/**
 * Patch shape used by `updateEncounterLootDraft` — every field
 * optional, only what the caller wants to update is present.
 */
export type LootDraftPatch = {
  lines?: unknown
  loop_number?: unknown
  day_in_loop?: unknown
  money_distribution?: unknown
}

export type ValidatedLootDraftPatch = {
  lines?: LootLine[]
  loop_number?: number | null
  day_in_loop?: number | null
  money_distribution?: import('./encounter-loot-types').MoneyDistribution
}

function validateMoneyDistribution(
  input: unknown,
): ValidateResult<import('./encounter-loot-types').MoneyDistribution> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'money_distribution должно быть объектом' }
  }
  const obj = input as Record<string, unknown>
  const mode = obj.mode
  if (mode === 'stash' || mode === 'split_evenly') {
    if (obj.pc_id != null) {
      return {
        ok: false,
        error: `pc_id должен быть null при mode=${mode}`,
      }
    }
    return { ok: true, value: { mode, pc_id: null } }
  }
  if (mode === 'pc') {
    if (!looksLikeUuid(obj.pc_id)) {
      return {
        ok: false,
        error: 'Для money_distribution.mode=pc нужен валидный pc_id (uuid)',
      }
    }
    return { ok: true, value: { mode, pc_id: obj.pc_id as string } }
  }
  if (mode === 'manual') {
    if (obj.pc_id != null) {
      return { ok: false, error: 'pc_id должен быть null при mode=manual' }
    }
    if (!obj.amounts || typeof obj.amounts !== 'object') {
      return {
        ok: false,
        error: 'Для mode=manual нужен объект amounts с суммами по PC',
      }
    }
    const amountsObj = obj.amounts as Record<string, unknown>
    const amounts: Record<string, import('./encounter-loot-types').CoinSet> = {}
    for (const [pcNodeId, raw] of Object.entries(amountsObj)) {
      if (!looksLikeUuid(pcNodeId)) {
        return {
          ok: false,
          error: `Ключ amounts должен быть uuid PC-ноды, не ${JSON.stringify(pcNodeId)}`,
        }
      }
      if (!raw || typeof raw !== 'object') {
        return {
          ok: false,
          error: `amounts[${pcNodeId}] должно быть объектом с cp/sp/gp/pp`,
        }
      }
      const coinObj = raw as Record<string, unknown>
      for (const k of ['cp', 'sp', 'gp', 'pp'] as const) {
        if (!isNonNegInt(coinObj[k])) {
          return {
            ok: false,
            error: `amounts[${pcNodeId}].${k} должно быть целым неотрицательным`,
          }
        }
      }
      amounts[pcNodeId] = {
        cp: coinObj.cp as number,
        sp: coinObj.sp as number,
        gp: coinObj.gp as number,
        pp: coinObj.pp as number,
      }
    }
    return { ok: true, value: { mode, pc_id: null, amounts } }
  }
  return {
    ok: false,
    error: `Неизвестный money_distribution.mode: ${JSON.stringify(mode)}`,
  }
}

export function validateLootDraftPatch(
  input: unknown,
): ValidateResult<ValidatedLootDraftPatch> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Патч должен быть объектом' }
  }
  const obj = input as Record<string, unknown>
  const out: ValidatedLootDraftPatch = {}

  if ('lines' in obj) {
    if (!Array.isArray(obj.lines)) {
      return { ok: false, error: 'lines должно быть массивом' }
    }
    const lines: LootLine[] = []
    for (let i = 0; i < obj.lines.length; i++) {
      const r = validateLootLine(obj.lines[i])
      if (!r.ok) {
        return { ok: false, error: `Строка #${i + 1}: ${r.error}` }
      }
      lines.push(r.value)
    }
    // Detect duplicate line ids — would corrupt React keys + later
    // patch operations.
    const seen = new Set<string>()
    for (const l of lines) {
      if (seen.has(l.id)) {
        return { ok: false, error: `Дубликат id строки лута: ${l.id}` }
      }
      seen.add(l.id)
    }
    out.lines = lines
  }

  if ('loop_number' in obj) {
    const v = obj.loop_number
    if (v === null) {
      out.loop_number = null
    } else if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: 'loop_number должно быть положительным целым или null' }
    } else {
      out.loop_number = v
    }
  }

  if ('day_in_loop' in obj) {
    const v = obj.day_in_loop
    if (v === null) {
      out.day_in_loop = null
    } else if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 30) {
      return { ok: false, error: 'day_in_loop должно быть целым от 1 до 30 или null' }
    } else {
      out.day_in_loop = v
    }
  }

  if ('money_distribution' in obj) {
    const r = validateMoneyDistribution(obj.money_distribution)
    if (!r.ok) return r
    out.money_distribution = r.value
  }

  return { ok: true, value: out }
}

/**
 * Validate a fully-hydrated draft (e.g. read from DB) before the apply
 * action expands it. Catches drafts with missing day fields, malformed
 * lines, etc.
 */
export function validateLootDraftReady(
  draft: LootDraft,
): ValidateResult<LootDraft> {
  if (draft.loop_number === null || draft.loop_number <= 0) {
    return { ok: false, error: 'Не указан номер петли' }
  }
  if (
    draft.day_in_loop === null ||
    draft.day_in_loop < 1 ||
    draft.day_in_loop > 30
  ) {
    return { ok: false, error: 'Не указан день петли (1..30)' }
  }
  if (draft.lines.length === 0) {
    // An empty draft is a valid no-op apply (FR-024) — caller decides
    // whether to short-circuit.
    return { ok: true, value: draft }
  }
  for (let i = 0; i < draft.lines.length; i++) {
    const r = validateLootLine(draft.lines[i])
    if (!r.ok) {
      return { ok: false, error: `Строка #${i + 1}: ${r.error}` }
    }
  }
  return { ok: true, value: draft }
}
