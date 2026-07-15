import { describe, expect, it } from 'vitest'
import { clampMapPosition } from '@/lib/maps'

describe('clampMapPosition', () => {
  it('keeps valid normalized coordinates and limits precision', () => {
    expect(clampMapPosition(0.12345678)).toBe(0.12346)
    expect(clampMapPosition(0.5)).toBe(0.5)
  })

  it('prevents a malformed client payload from moving a token off the map', () => {
    expect(clampMapPosition(-3)).toBe(0)
    expect(clampMapPosition(2)).toBe(1)
    expect(clampMapPosition(Number.NaN)).toBe(0)
  })
})
