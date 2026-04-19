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
  proficiency_bonus?: number  // explicit; falls back to CR-derived

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
  legendary_resistance_budget?: number  // derived from passives
  passives: Passive[]

  source_doc?: string
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
  // SRD seed stores "hp"; migration 018 also declares "max_hp". Accept both.
  const max_hp = asNum(f.max_hp) ?? asNum(f.hp)

  const hasContent =
    actions.length > 0 ||
    bonus_actions.length > 0 ||
    reactions.length > 0 ||
    legendary_actions.length > 0 ||
    passives.length > 0 ||
    ac !== undefined ||
    max_hp !== undefined

  if (!hasContent) return null

  // Extract per-day Legendary Resistance budget from passives.
  const legendary_resistance_budget = extractLegendaryResistanceBudget(passives)

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
    proficiency_bonus: asNum(f.proficiency_bonus),
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
    legendary_resistance_budget,
    passives,
    source_doc: asStr(f.source_doc),
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

// ── Legendary Resistance budget ────────────────────────────────────
// Passive entries look like "Legendary Resistance (3/Day)" — parse N out.

const LR_NAME_RE = /legendary\s+resistance\s*\((\d+)\s*\/\s*day\)/i

export function extractLegendaryResistanceBudget(
  passives: readonly Passive[],
): number | undefined {
  for (const p of passives) {
    const m = p.name.match(LR_NAME_RE)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return undefined
}

// ── Proficiency bonus from CR ──────────────────────────────────────
// D&D 5e DMG table: CR 0-4 → +2, 5-8 → +3, 9-12 → +4, 13-16 → +5, ...
// Accepts fraction strings ("1/8", "1/4", "1/2") and plain numbers.

export function parseCrValue(cr: string | undefined): number | undefined {
  if (!cr) return undefined
  const trimmed = cr.trim()
  if (trimmed.includes('/')) {
    const [a, b] = trimmed.split('/').map(Number)
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b
    return undefined
  }
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

export function proficiencyFromCr(cr: string | undefined): number | undefined {
  const v = parseCrValue(cr)
  if (v === undefined) return undefined
  if (v < 5) return 2
  if (v < 9) return 3
  if (v < 13) return 4
  if (v < 17) return 5
  if (v < 21) return 6
  if (v < 25) return 7
  if (v < 29) return 8
  return 9
}

export function effectiveProficiency(sb: Statblock): number | undefined {
  return sb.proficiency_bonus ?? proficiencyFromCr(sb.cr)
}

// ── Creature-type tooltips ─────────────────────────────────────────
// Short Russian gloss + SRD-flavoured description, shown on hover.

const TYPE_INFO: Record<string, { label: string; desc: string }> = {
  aberration: {
    label: 'Аберрация',
    desc: 'Потустороннее создание с чужой анатомией и психикой. Биндл — боги-изгои или иные планы.',
  },
  beast: {
    label: 'Зверь',
    desc: 'Обычное животное — не магическое, не мыслящее сверх инстинктов.',
  },
  celestial: {
    label: 'Небожитель',
    desc: 'Житель Верхних планов: ангел, пегас, единорог. Преимущественно доброго согласия.',
  },
  construct: {
    label: 'Конструкт',
    desc: 'Созданный разумом или магией: голем, модрон, оживлённый доспех.',
  },
  dragon: {
    label: 'Дракон',
    desc: 'Могущественные чешуйчатые рептилии — от хроматических до металлических.',
  },
  elemental: {
    label: 'Элементаль',
    desc: 'Воплощение стихии со Стихийных планов: огня, воды, воздуха, земли.',
  },
  fey: {
    label: 'Фей',
    desc: 'Создание Фейского Дикого: сатир, дриада, пикси, эльф-ши.',
  },
  fiend: {
    label: 'Исчадие',
    desc: 'Демон или дьявол. Чаще всего злое по природе.',
  },
  giant: {
    label: 'Великан',
    desc: 'Гуманоид крупнее обычного: огры, тролли, великаны всех мастей.',
  },
  humanoid: {
    label: 'Гуманоид',
    desc: 'Человек, эльф, дварф, орк, гоблин — разумная раса среднего или малого размера.',
  },
  monstrosity: {
    label: 'Чудовище',
    desc: 'Страшные существа, не попадающие в прочие категории: мантикора, медуза, грифон.',
  },
  ooze: {
    label: 'Слизь',
    desc: 'Бесформенная желеобразная тварь подземелий.',
  },
  plant: {
    label: 'Растение',
    desc: 'Растительное создание или грибной организм.',
  },
  undead: {
    label: 'Нежить',
    desc: 'Мертвое, но движущееся: зомби, скелет, лич, вампир, призрак.',
  },
}

export function creatureTypeInfo(type: string | undefined | null):
  | { label: string; desc: string }
  | null {
  if (!type) return null
  const key = type.toLowerCase().trim()
  return TYPE_INFO[key] ?? null
}

// ── HP computation methods ─────────────────────────────────────────
// Parse hit dice like "17d10+85" → {count: 17, die: 10, bonus: 85}.

export type HitDice = { count: number; die: number; bonus: number }

const HD_RE = /^\s*(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i

export function parseHitDice(hd: string | undefined): HitDice | null {
  if (!hd) return null
  const m = hd.match(HD_RE)
  if (!m) return null
  const count = Number(m[1])
  const die = Number(m[2])
  const bonusRaw = (m[3] ?? '').replace(/\s+/g, '')
  const bonus = bonusRaw ? Number(bonusRaw) : 0
  if (!Number.isFinite(count) || !Number.isFinite(die) || !Number.isFinite(bonus)) return null
  return { count, die, bonus }
}

function rollDie(sides: number): number {
  // Math.random is fine for HP-rolling; not a security-sensitive RNG.
  return 1 + Math.floor(Math.random() * sides)
}

export type HpMethod = 'average' | 'max' | 'min' | 'roll'

export function isHpMethod(v: unknown): v is HpMethod {
  return v === 'average' || v === 'max' || v === 'min' || v === 'roll'
}

/**
 * Compute starting HP for a monster being added to an encounter.
 * Priority chain:
 *   - If `method` cannot be satisfied from the fields (e.g. no hit_dice for roll),
 *     fall back to the stored average (`fields.max_hp ?? fields.hp`).
 *   - If that too is missing, returns 0.
 */
export function computeMonsterHp(
  fields: Record<string, unknown> | null | undefined,
  method: HpMethod,
): number {
  const f = fields ?? {}
  const stored = asNum(f.max_hp) ?? asNum(f.hp)
  const hd = parseHitDice(asStr(f.hit_dice))

  if (method === 'average' || !hd) {
    return stored ?? 0
  }

  if (method === 'max') {
    return hd.count * hd.die + hd.bonus
  }
  if (method === 'min') {
    return Math.max(1, hd.count * 1 + hd.bonus)
  }
  if (method === 'roll') {
    let total = hd.bonus
    for (let i = 0; i < hd.count; i++) total += rollDie(hd.die)
    return Math.max(1, total)
  }

  return stored ?? 0
}
