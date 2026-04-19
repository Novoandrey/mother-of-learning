// lib/statblock.ts
// Types + parser for creature/NPC statblocks stored in nodes.fields.
// Shape follows migration 018.

export type Targeting = 'single' | 'area' | 'self'

export type StatblockAction = {
  name: string
  desc: string
  targeting: Targeting
  source?: string   // "statblock" | "item:<id>" | "effect:<id>"
  cost?: number     // legendary action cost
}

export type Passive = {
  name: string
  desc: string
  source?: string
}

export type AbilityScores = {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

export type Senses = {
  passive_perception?: number
  darkvision?: number
  blindsight?: number
  truesight?: number
  tremorsense?: number
}

export type Speed = {
  walk?: number
  fly?: number
  swim?: number
  climb?: number
  burrow?: number
  hover?: boolean
}

export type Statblock = {
  name: string          // creature canonical name (not nickname)
  cr?: string
  type?: string         // "dragon", "humanoid", ...
  size?: string
  alignment?: string

  ac?: number
  ac_detail?: string
  max_hp?: number
  hit_dice?: string

  stats?: AbilityScores
  saves?: Partial<AbilityScores>
  skills?: Record<string, number>
  senses?: Senses
  speed?: Speed

  languages?: string
  resistances?: string
  immunities?: string
  vulnerabilities?: string
  condition_immunities?: string

  actions: StatblockAction[]
  bonus_actions: StatblockAction[]
  reactions: StatblockAction[]
  legendary_actions: StatblockAction[]
  legendary_budget?: number
  passives: Passive[]

  statblock_url?: string
}

// ── Parser ──────────────────────────────────────────────────────────
// Node fields are JSONB — anything could be there. This defensively coerces.

type NodeFields = Record<string, unknown> | null | undefined

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined

const asNum = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

const asTargeting = (v: unknown): Targeting => {
  if (v === 'area' || v === 'self' || v === 'single') return v
  return 'single'
}

function parseAction(v: unknown): StatblockAction | null {
  if (!isObj(v)) return null
  const name = asStr(v.name)
  if (!name) return null
  return {
    name,
    desc: asStr(v.desc) ?? '',
    targeting: asTargeting(v.targeting),
    source: asStr(v.source),
    cost: asNum(v.cost),
  }
}

function parsePassive(v: unknown): Passive | null {
  if (!isObj(v)) return null
  const name = asStr(v.name)
  if (!name) return null
  return {
    name,
    desc: asStr(v.desc) ?? '',
    source: asStr(v.source),
  }
}

function parseList<T>(v: unknown, fn: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const item of v) {
    const parsed = fn(item)
    if (parsed) out.push(parsed)
  }
  return out
}

function parseStats(v: unknown): AbilityScores | undefined {
  if (!isObj(v)) return undefined
  const keys: (keyof AbilityScores)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  const out: Partial<AbilityScores> = {}
  for (const k of keys) {
    const n = asNum(v[k])
    if (n !== undefined) out[k] = n
  }
  if (keys.every((k) => out[k] !== undefined)) return out as AbilityScores
  return undefined
}

function parseSenses(v: unknown): Senses | undefined {
  if (!isObj(v)) return undefined
  const out: Senses = {}
  const pp = asNum(v.passive_perception)
  if (pp !== undefined) out.passive_perception = pp
  for (const k of ['darkvision', 'blindsight', 'truesight', 'tremorsense'] as const) {
    const n = asNum(v[k])
    if (n !== undefined) out[k] = n
  }
  return Object.keys(out).length ? out : undefined
}

function parseSpeed(v: unknown): Speed | undefined {
  if (!isObj(v)) return undefined
  const out: Speed = {}
  for (const k of ['walk', 'fly', 'swim', 'climb', 'burrow'] as const) {
    const n = asNum(v[k])
    if (n !== undefined) out[k] = n
  }
  if (v.hover === true) out.hover = true
  return Object.keys(out).length ? out : undefined
}

/**
 * Build a Statblock from a node's fields + title.
 * Returns null if the node has no meaningful combat content (no actions,
 * no AC, no HP) — the panel should render an empty state instead.
 */
export function parseStatblock(
  title: string,
  fields: NodeFields,
): Statblock | null {
  const f = fields ?? {}

  const actions = parseList(f.actions, parseAction)
  const bonus_actions = parseList(f.bonus_actions, parseAction)
  const reactions = parseList(f.reactions, parseAction)
  const legendary_actions = parseList(f.legendary_actions, parseAction)
  const passives = parseList(f.passives, parsePassive)

  const ac = asNum(f.ac)
  const max_hp = asNum(f.max_hp)

  const hasContent =
    actions.length > 0 ||
    bonus_actions.length > 0 ||
    reactions.length > 0 ||
    legendary_actions.length > 0 ||
    passives.length > 0 ||
    ac !== undefined ||
    max_hp !== undefined

  if (!hasContent) return null

  return {
    name: asStr(f.name) ?? title,
    cr: asStr(f.cr),
    type: asStr(f.type),
    size: asStr(f.size),
    alignment: asStr(f.alignment),
    ac,
    ac_detail: asStr(f.ac_detail),
    max_hp,
    hit_dice: asStr(f.hit_dice),
    stats: parseStats(f.stats),
    saves: isObj(f.saves) ? (f.saves as Partial<AbilityScores>) : undefined,
    skills: isObj(f.skills) ? (f.skills as Record<string, number>) : undefined,
    senses: parseSenses(f.senses),
    speed: parseSpeed(f.speed),
    languages: asStr(f.languages),
    resistances: asStr(f.resistances),
    immunities: asStr(f.immunities),
    vulnerabilities: asStr(f.vulnerabilities),
    condition_immunities: asStr(f.condition_immunities),
    actions,
    bonus_actions,
    reactions,
    legendary_actions,
    legendary_budget: asNum(f.legendary_budget),
    passives,
    statblock_url: asStr(f.statblock_url),
  }
}

// Ability-modifier helper (D&D 5e convention)
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function formatMod(mod: number): string {
  return (mod >= 0 ? '+' : '') + String(mod)
}

// ── "Dead" detection ────────────────────────────────────────────────
// A participant counts as dead when any of its conditions match a known
// "dead"-shaped name. This is D&D 5e-flavoured and Russian-flavoured.
//
// TODO (IDEA-028 in backlog): move these lists into a per-campaign setting
// table so other systems / other languages can customise what "dead" means.

const DEAD_CONDITION_NAMES = new Set([
  'dead',
  'мертв',
  'мёртв',
  'deceased',
  'slain',
])

export function isDeadConditionName(name: string): boolean {
  return DEAD_CONDITION_NAMES.has(name.toLowerCase())
}

export function hasDeadCondition(conditions: readonly { name: string }[]): boolean {
  return conditions.some((c) => isDeadConditionName(c.name))
}
