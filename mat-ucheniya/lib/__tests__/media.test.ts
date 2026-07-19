import { afterEach, describe, expect, it } from 'vitest'
import {
  isMediaManager,
  mediaAssetUrl,
  normalizeMediaFilename,
} from '@/lib/media'

const previousAssetBase = process.env.NEXT_PUBLIC_R2_ASSET_BASE
const previousPortraitBase = process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE

afterEach(() => {
  if (previousAssetBase === undefined) delete process.env.NEXT_PUBLIC_R2_ASSET_BASE
  else process.env.NEXT_PUBLIC_R2_ASSET_BASE = previousAssetBase

  if (previousPortraitBase === undefined) delete process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  else process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE = previousPortraitBase
})

describe('mediaAssetUrl', () => {
  it('uses the shared asset base and removes its trailing slash', () => {
    process.env.NEXT_PUBLIC_R2_ASSET_BASE = 'https://assets.example.test/'
    process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE = 'https://legacy.example.test'

    expect(mediaAssetUrl('media/campaign/image.png')).toBe(
      'https://assets.example.test/media/campaign/image.png',
    )
  })

  it('keeps the portrait base as a backwards-compatible deployment fallback', () => {
    delete process.env.NEXT_PUBLIC_R2_ASSET_BASE
    process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE = 'https://legacy.example.test/'

    expect(mediaAssetUrl('media/campaign/image.webp')).toBe(
      'https://legacy.example.test/media/campaign/image.webp',
    )
  })

  it('returns null without a key or configured public base', () => {
    delete process.env.NEXT_PUBLIC_R2_ASSET_BASE
    delete process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE

    expect(mediaAssetUrl('media/campaign/image.jpg')).toBeNull()
    expect(mediaAssetUrl(null)).toBeNull()
  })
})

describe('normalizeMediaFilename', () => {
  it('keeps a trimmed user-facing filename', () => {
    expect(normalizeMediaFilename('  Кватач-Ичл, лич.png  ', 'image/png')).toBe(
      'Кватач-Ичл, лич.png',
    )
  })

  it('creates a readable fallback and respects the database length bound', () => {
    expect(normalizeMediaFilename('   ', 'image/webp')).toBe('image.webp')
    expect(normalizeMediaFilename('a'.repeat(300), 'image/jpeg')).toHaveLength(255)
  })
})

describe('isMediaManager', () => {
  it('allows campaign owners and DMs but not players', () => {
    expect(isMediaManager('owner')).toBe(true)
    expect(isMediaManager('dm')).toBe(true)
    expect(isMediaManager('player')).toBe(false)
  })
})
