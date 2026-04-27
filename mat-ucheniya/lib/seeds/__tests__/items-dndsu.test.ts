/**
 * vitest spec for `lib/seeds/items-dndsu.ts` — spec-018 T016.
 *
 * Verifies properties of the auto-generated dnd.su seed:
 *   - every entry has the required fields
 *   - all enum-typed values are within their unions
 *   - no `srdSlug` collisions inside the dnd.su seed
 *   - no `srdSlug` collisions with the hand-curated SRD seed
 *   - all `dndsuUrl` values point at https://dnd.su/items/...
 *
 * The generated module must exist before this test runs:
 *
 *   $ cd mat-ucheniya
 *   $ npx tsx scripts/items-dndsu-codegen.ts
 *   $ npm run vitest
 */

import { describe, expect, it } from 'vitest'
import { ITEMS_SRD_SEED } from '../items-srd'
import { ITEMS_DNDSU_SEED } from '../items-dndsu'

const VALID_CATEGORIES = new Set([
  'weapon',
  'armor',
  'consumable',
  'magic-item',
  'wondrous',
  'tool',
  'treasure',
  'misc',
])

const VALID_RARITIES = new Set([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
])

const VALID_SLOTS = new Set([
  'ring',
  'cloak',
  'amulet',
  'boots',
  'gloves',
  'headwear',
  'belt',
  'body',
  'shield',
  '1-handed',
  '2-handed',
  'versatile',
  'ranged',
])

describe('ITEMS_DNDSU_SEED', () => {
  it('has at least 100 entries (sanity floor)', () => {
    expect(ITEMS_DNDSU_SEED.length).toBeGreaterThanOrEqual(100)
  })

  it('every entry has required fields', () => {
    for (const e of ITEMS_DNDSU_SEED) {
      expect(e.srdSlug, `entry ${JSON.stringify(e)}`).toBeTruthy()
      expect(e.titleRu, `entry ${e.srdSlug}`).toBeTruthy()
      expect(e.category, `entry ${e.srdSlug}`).toBeTruthy()
    }
  })

  it('all category values are within the enum', () => {
    const offenders = ITEMS_DNDSU_SEED.filter(
      (e) => !VALID_CATEGORIES.has(e.category),
    )
    expect(offenders.map((e) => `${e.srdSlug}:${e.category}`)).toEqual([])
  })

  it('all rarity values are within the enum or null', () => {
    const offenders = ITEMS_DNDSU_SEED.filter(
      (e) => e.rarity !== null && !VALID_RARITIES.has(e.rarity),
    )
    expect(offenders.map((e) => `${e.srdSlug}:${e.rarity}`)).toEqual([])
  })

  it('all slot values are within the enum or null', () => {
    const offenders = ITEMS_DNDSU_SEED.filter(
      (e) => e.slot !== null && !VALID_SLOTS.has(e.slot),
    )
    expect(offenders.map((e) => `${e.srdSlug}:${e.slot}`)).toEqual([])
  })

  it('has no duplicate srdSlug within the seed', () => {
    const seen = new Set<string>()
    const dups: string[] = []
    for (const e of ITEMS_DNDSU_SEED) {
      if (seen.has(e.srdSlug)) dups.push(e.srdSlug)
      seen.add(e.srdSlug)
    }
    expect(dups).toEqual([])
  })

  it('has no srdSlug collision with ITEMS_SRD_SEED', () => {
    const srdSlugs = new Set(ITEMS_SRD_SEED.map((e) => e.srdSlug))
    const collisions = ITEMS_DNDSU_SEED.filter((e) => srdSlugs.has(e.srdSlug))
    expect(collisions.map((e) => e.srdSlug)).toEqual([])
  })

  it('every entry has a dndsuUrl on dnd.su/items/', () => {
    for (const e of ITEMS_DNDSU_SEED) {
      expect(e.dndsuUrl, `entry ${e.srdSlug}`).toMatch(
        /^https:\/\/dnd\.su\/items\/\d+-/,
      )
    }
  })

  it('umbrella tier slugs follow the -plus-N suffix convention', () => {
    const tierEntries = ITEMS_DNDSU_SEED.filter((e) =>
      /-plus-\d+$/.test(e.srdSlug),
    )
    // If there are tier entries at all, they should always come in
    // groups (≥ 2) sharing a base slug — never an orphan -plus-1.
    const baseSlugs = new Map<string, number>()
    for (const e of tierEntries) {
      const base = e.srdSlug.replace(/-plus-\d+$/, '')
      baseSlugs.set(base, (baseSlugs.get(base) ?? 0) + 1)
    }
    const orphans = Array.from(baseSlugs.entries()).filter(
      ([, n]) => n < 2,
    )
    expect(orphans.map(([k]) => k)).toEqual([])
  })
})
