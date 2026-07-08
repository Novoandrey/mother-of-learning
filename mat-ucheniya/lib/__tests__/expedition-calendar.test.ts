import { describe, expect, it } from 'vitest'

import {
  LOOP_DAYS,
  LOOP_START_ABS_MIN,
  LOOP_END_ABS_MIN,
  startAbsMin,
  validateExpeditionWindow,
  minuteToHHMM,
  hhmmToMinute,
} from '../expedition-calendar'

describe('expedition-calendar constants (spec-055 — слой времени)', () => {
  it('pins the loop shape (30-day month, 02:00 → 02:00)', () => {
    expect(LOOP_DAYS).toBe(30)
    expect(LOOP_START_ABS_MIN).toBe(120)
    expect(LOOP_END_ABS_MIN).toBe(43320)
  })
})

describe('startAbsMin', () => {
  it('day 1 at 02:00 is exactly the loop start', () => {
    expect(startAbsMin(1, hhmmToMinute(2, 0))).toBe(LOOP_START_ABS_MIN)
  })
  it('day 31 at 02:00 is exactly the loop end', () => {
    expect(startAbsMin(31, hhmmToMinute(2, 0))).toBe(LOOP_END_ABS_MIN)
  })
  it('adds full days plus the minute-of-day', () => {
    // day 2, 00:00 → one full day past day-1 midnight
    expect(startAbsMin(2, 0)).toBe(1440)
    expect(startAbsMin(15, hhmmToMinute(9, 30))).toBe(14 * 1440 + 570)
  })
})

describe('validateExpeditionWindow — window boundaries', () => {
  it('rejects day 1 at 01:59 (before the loop opens)', () => {
    expect(
      validateExpeditionWindow({
        day: 1,
        startMinute: hhmmToMinute(1, 59),
        durationMinute: 60,
      }),
    ).toEqual({ ok: false, error: 'Петля начинается в 02:00 дня 1' })
  })

  it('accepts day 1 at exactly 02:00', () => {
    expect(
      validateExpeditionWindow({
        day: 1,
        startMinute: hhmmToMinute(2, 0),
        durationMinute: 0,
      }),
    ).toEqual({ ok: true })
  })

  it('rejects day 30 22:00 + 5h (spills past 02:00 day 31)', () => {
    expect(
      validateExpeditionWindow({
        day: 30,
        startMinute: hhmmToMinute(22, 0),
        durationMinute: 5 * 60,
      }),
    ).toEqual({
      ok: false,
      error: 'Вылазка выходит за конец петли (02:00 дня 31)',
    })
  })

  it('accepts a run that ends exactly at 02:00 day 31 (day 1 02:00 + 30 days)', () => {
    expect(
      validateExpeditionWindow({
        day: 1,
        startMinute: hhmmToMinute(2, 0),
        durationMinute: LOOP_DAYS * 1440, // 43200, ends exactly at LOOP_END_ABS_MIN
      }),
    ).toEqual({ ok: true })
  })

  it('rejects a run one minute past the loop end', () => {
    expect(
      validateExpeditionWindow({
        day: 1,
        startMinute: hhmmToMinute(2, 0),
        durationMinute: LOOP_DAYS * 1440 + 1,
      }).ok,
    ).toBe(false)
  })

  it('accepts a normal mid-loop window', () => {
    expect(
      validateExpeditionWindow({
        day: 15,
        startMinute: hhmmToMinute(9, 30),
        durationMinute: 3 * 60,
      }),
    ).toEqual({ ok: true })
  })
})

describe('validateExpeditionWindow — field ranges', () => {
  it('rejects day 0 and day 31 (out of 1..30)', () => {
    expect(
      validateExpeditionWindow({ day: 0, startMinute: 120, durationMinute: 0 }).ok,
    ).toBe(false)
    expect(
      validateExpeditionWindow({ day: 31, startMinute: 120, durationMinute: 0 }).ok,
    ).toBe(false)
  })
  it('rejects a start minute past 23:59 or negative', () => {
    expect(
      validateExpeditionWindow({ day: 5, startMinute: 1440, durationMinute: 0 }).ok,
    ).toBe(false)
    expect(
      validateExpeditionWindow({ day: 5, startMinute: -1, durationMinute: 0 }).ok,
    ).toBe(false)
  })
  it('rejects a negative duration', () => {
    expect(
      validateExpeditionWindow({ day: 5, startMinute: 120, durationMinute: -1 }),
    ).toEqual({ ok: false, error: 'Длительность не может быть отрицательной' })
  })
  it('rejects non-integer inputs', () => {
    expect(
      validateExpeditionWindow({ day: 1.5, startMinute: 120, durationMinute: 0 }).ok,
    ).toBe(false)
    expect(
      validateExpeditionWindow({ day: 5, startMinute: 120.5, durationMinute: 0 }).ok,
    ).toBe(false)
    expect(
      validateExpeditionWindow({ day: 5, startMinute: 120, durationMinute: 1.5 }).ok,
    ).toBe(false)
  })
})

describe('minuteToHHMM / hhmmToMinute', () => {
  it('formats minute-of-day as zero-padded HH:MM', () => {
    expect(minuteToHHMM(hhmmToMinute(14, 30))).toBe('14:30')
    expect(minuteToHHMM(hhmmToMinute(2, 0))).toBe('02:00')
    expect(minuteToHHMM(hhmmToMinute(1, 59))).toBe('01:59')
    expect(minuteToHHMM(0)).toBe('00:00')
    expect(minuteToHHMM(hhmmToMinute(23, 59))).toBe('23:59')
  })
  it('round-trips clock → minute → clock', () => {
    for (const [h, m] of [[0, 0], [9, 5], [14, 30], [23, 59]] as const) {
      expect(minuteToHHMM(hhmmToMinute(h, m))).toBe(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      )
    }
  })
  it('clamps non-finite / negative input to 00:00', () => {
    expect(minuteToHHMM(Number.NaN)).toBe('00:00')
    expect(minuteToHHMM(-5)).toBe('00:00')
  })
})
