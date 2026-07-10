import { describe, it, expect } from 'vitest'
import {
  cleanScribeParticipants,
  totalScribeHours,
  missingScribeHours,
} from '../scribe'

describe('cleanScribeParticipants', () => {
  it('drops empty/invalid lines and rounds hours to 2dp', () => {
    expect(
      cleanScribeParticipants([
        { nodeId: 'a', hours: 8 },
        { nodeId: '', hours: 5 },
        { nodeId: 'b', hours: 0 },
        { nodeId: 'c', hours: -3 },
        { nodeId: 'd', hours: 1.6666666666 },
      ]),
    ).toEqual([
      { nodeId: 'a', hours: 8 },
      { nodeId: 'd', hours: 1.67 },
    ])
  })
  it('handles undefined', () => {
    expect(cleanScribeParticipants(undefined)).toEqual([])
  })
})

describe('totalScribeHours', () => {
  it('sums positive hours', () => {
    expect(totalScribeHours([{ hours: 20 }, { hours: 20 }])).toBe(40)
    expect(totalScribeHours([])).toBe(0)
  })
})

describe('missingScribeHours', () => {
  it('0 when the threshold is met or exceeded', () => {
    expect(missingScribeHours(40, 40)).toBe(0)
    expect(missingScribeHours(40, 50)).toBe(0)
  })
  it('the remaining gap, rounded UP to 2dp', () => {
    expect(missingScribeHours(40, 30)).toBe(10)
    expect(missingScribeHours(8, 7.333)).toBe(0.67)
  })
})
