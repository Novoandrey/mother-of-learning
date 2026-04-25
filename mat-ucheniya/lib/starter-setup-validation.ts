/**
 * Spec-012 — Input validators for starter configs and autogen keys.
 *
 * Pure, no I/O. Tested in `__tests__/starter-setup-validation.test.ts`.
 *
 * Each validator takes `unknown` (the boundary between user input and
 * the typed app) and either returns `{ ok: true, value }` with the
 * normalized typed value, or `{ ok: false, error }` with a
 * human-readable message safe to surface in a toast.
 */

import type { CoinSet } from './transactions'
import type { StarterItem, WizardKey } from './starter-setup'

// ─────────────────────────── CoinSet ───────────────────────────

export function validateCoinSet(
  input: unknown,
): { ok: true; value: CoinSet } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Ожидается объект { cp, sp, gp, pp }' }
  }
  const obj = input as Record<string, unknown>
  const keys: (keyof CoinSet)[] = ['cp', 'sp', 'gp', 'pp']
  const out: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 }
  for (const k of keys) {
    const v = obj[k]
    if (v === undefined || v === null) {
      out[k] = 0
      continue
    }
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return { ok: false, error: `Номинал "${k}" должен быть целым числом` }
    }
    if (v < 0) {
      return { ok: false, error: `Номинал "${k}" не может быть отрицательным` }
    }
    out[k] = v
  }
  return { ok: true, value: out }
}

// ─────────────────────────── StarterItem[] ───────────────────────────

export function validateStarterItems(
  input: unknown,
): { ok: true; value: StarterItem[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Ожидается массив предметов' }
  }
  const out: StarterItem[] = []
  for (let i = 0; i < input.length; i++) {
    const item = input[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Элемент #${i + 1}: ожидается { name, qty }` }
    }
    const { name, qty } = item as { name?: unknown; qty?: unknown }
    if (typeof name !== 'string' || name.trim().length === 0) {
      return {
        ok: false,
        error: `Элемент #${i + 1}: название не может быть пустым`,
      }
    }
    if (typeof qty !== 'number' || !Number.isInteger(qty)) {
      return {
        ok: false,
        error: `Элемент #${i + 1} ("${name}"): количество должно быть целым числом`,
      }
    }
    if (qty < 1) {
      return {
        ok: false,
        error: `Элемент #${i + 1} ("${name}"): количество должно быть ≥ 1`,
      }
    }
    out.push({ name: name.trim(), qty })
  }
  return { ok: true, value: out }
}

// ─────────────────────────── WizardKey ───────────────────────────

const KNOWN_WIZARD_KEYS = new Set<WizardKey>([
  'starting_money',
  'starting_loan',
  'stash_seed',
  'starting_items',
  'encounter_loot', // spec-013
])

export function isKnownWizardKey(s: unknown): s is WizardKey {
  return typeof s === 'string' && KNOWN_WIZARD_KEYS.has(s as WizardKey)
}
