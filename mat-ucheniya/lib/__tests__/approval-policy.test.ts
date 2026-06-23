import { describe, it, expect } from 'vitest'
import { isAutoApproved } from '../approval-policy'

describe('isAutoApproved (spec-014 + C-05 free общак)', () => {
  it('DM/owner are always approved, with or without autoApprove', () => {
    expect(isAutoApproved('owner')).toBe(true)
    expect(isAutoApproved('dm')).toBe(true)
    expect(isAutoApproved('owner', false)).toBe(true)
    expect(isAutoApproved('dm', true)).toBe(true)
  })

  it('a player write defaults to pending (queued)', () => {
    expect(isAutoApproved('player')).toBe(false)
    expect(isAutoApproved('player', false)).toBe(false)
    expect(isAutoApproved('player', undefined)).toBe(false)
  })

  it('a player free-общак op (autoApprove=true) is approved', () => {
    expect(isAutoApproved('player', true)).toBe(true)
  })
})
