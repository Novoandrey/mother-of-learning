import { describe, expect, it } from 'vitest'
import {
  hasMatchingImageSignature,
  imageExtensionFor,
  isSupportedImageType,
} from '@/lib/image-signatures'

describe('image upload signatures', () => {
  it.each([
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/jpeg', [0xff, 0xd8, 0xff]],
    ['image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ] as const)('accepts a valid %s header', (type, header) => {
    expect(hasMatchingImageSignature(type, new Uint8Array(header))).toBe(true)
  })

  it('rejects a renamed non-image payload', () => {
    expect(
      hasMatchingImageSignature('image/png', new TextEncoder().encode('<svg onload=alert(1)>')),
    ).toBe(false)
  })

  it('keeps the accepted types and storage extensions aligned', () => {
    expect(isSupportedImageType('image/jpeg')).toBe(true)
    expect(isSupportedImageType('image/gif')).toBe(false)
    expect(imageExtensionFor('image/webp')).toBe('webp')
    expect(imageExtensionFor('image/gif')).toBeNull()
  })
})
