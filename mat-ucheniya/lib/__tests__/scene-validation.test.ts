import { describe, expect, it } from 'vitest'
import {
  isSceneMessageKind,
  isSceneSpeakerKind,
  normalizeSceneBody,
} from '@/lib/scene-validation'

describe('scene validation', () => {
  it('accepts only the stored message and speaker enums', () => {
    expect(isSceneSpeakerKind('character')).toBe(true)
    expect(isSceneSpeakerKind('dm')).toBe(true)
    expect(isSceneSpeakerKind('npc')).toBe(false)
    expect(isSceneMessageKind('speech')).toBe(true)
    expect(isSceneMessageKind('description')).toBe(true)
    expect(isSceneMessageKind('system')).toBe(false)
  })

  it('trims prose but rejects empty and oversized messages', () => {
    expect(normalizeSceneBody('  Реплика  ')).toBe('Реплика')
    expect(normalizeSceneBody(' \n ')).toBeNull()
    expect(normalizeSceneBody('x'.repeat(8001))).toBeNull()
  })
})
