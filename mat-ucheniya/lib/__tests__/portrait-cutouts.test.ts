import { describe, expect, it } from 'vitest'
import { cutoutStorageKey, planPortraitCutouts, selectCurrentCutoutKey } from '@/lib/portrait-cutouts'

describe('portrait cutout planner', () => {
  it('deduplicates PC portrait assets and never needs map data', () => {
    const result = planPortraitCutouts([
      { mediaAssetId: 'a', portraitTag: 'pc' },
      { mediaAssetId: 'a', portraitTag: 'pc' },
      { mediaAssetId: 'b', portraitTag: 'npc' },
      { mediaAssetId: null, portraitTag: 'pc' },
    ], new Map([
      ['a', { version: 2, ready: true, hasCutout: false }],
      ['b', { version: 1, ready: true, hasCutout: false }],
    ]), 'pc')
    expect(result.candidates).toEqual([{ assetId: 'a', version: 2, portraitTags: ['pc'] }])
    expect(result.skipped).toMatchObject({ filtered_tag: 1, missing_asset: 1 })
  })

  it('skips assets which are not ready or already have a current cutout', () => {
    const result = planPortraitCutouts([
      { mediaAssetId: 'a', portraitTag: 'npc' },
      { mediaAssetId: 'b', portraitTag: 'npc' },
    ], new Map([
      ['a', { version: 1, ready: false, hasCutout: false }],
      ['b', { version: 1, ready: true, hasCutout: true }],
    ]), 'all')
    expect(result.candidates).toEqual([])
    expect(result.skipped).toMatchObject({ not_ready: 1, has_cutout: 1 })
  })

  it('selects only the current cutout rendition and uses an ASCII deterministic key', () => {
    expect(cutoutStorageKey('00000000-0000-0000-0000-000000000001', 2)).toBe('media/cutout/00000000-0000-0000-0000-000000000001-v2.png')
    expect(selectCurrentCutoutKey([
      { rendition: 'cutout', version: 1, storage_key: 'old.png' },
      { rendition: 'preview', version: 2, storage_key: 'preview.webp' },
      { rendition: 'cutout', version: 2, storage_key: 'cutout.png' },
    ], 2)).toBe('cutout.png')
  })
})
