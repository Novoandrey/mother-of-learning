import { describe, it, expect } from 'vitest'
import {
  isAutoApproved,
  approvalsEnabledFromSettings,
} from '../approval-policy'

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

  it('spec-053 kill-switch: approvalsEnabled=false approves everyone', () => {
    expect(isAutoApproved('player', false, false)).toBe(true)
    expect(isAutoApproved('player', undefined, false)).toBe(true)
    expect(isAutoApproved('dm', false, false)).toBe(true)
  })

  it('spec-053: approvalsEnabled=true keeps the spec-014 rule', () => {
    expect(isAutoApproved('player', false, true)).toBe(false)
    expect(isAutoApproved('player', true, true)).toBe(true)
    expect(isAutoApproved('dm', false, true)).toBe(true)
  })
})

describe('approvalsEnabledFromSettings (spec-053, defaults OFF)', () => {
  it('defaults to false when the key is absent or settings are junk', () => {
    expect(approvalsEnabledFromSettings(undefined)).toBe(false)
    expect(approvalsEnabledFromSettings(null)).toBe(false)
    expect(approvalsEnabledFromSettings({})).toBe(false)
    expect(approvalsEnabledFromSettings([])).toBe(false)
    expect(approvalsEnabledFromSettings({ approvals_enabled: 'yes' })).toBe(false)
  })

  it('reads an explicit boolean opt-in/out', () => {
    expect(approvalsEnabledFromSettings({ approvals_enabled: true })).toBe(true)
    expect(approvalsEnabledFromSettings({ approvals_enabled: false })).toBe(false)
  })
})
