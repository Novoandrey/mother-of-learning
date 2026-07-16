import { describe, it, expect } from 'vitest'
import {
  cleanCraftParticipants,
  totalCraftHours,
  missingCraftHours,
  craftRarityKey,
  schemaRarityForTarget,
  craftProductName,
} from '../craft'

describe('cleanCraftParticipants (spec-056)', () => {
  it('пропускает валидные строки и округляет часы до 2 знаков', () => {
    expect(
      cleanCraftParticipants([
        { nodeId: 'a', hours: 2 },
        { nodeId: 'b', hours: 1.6666666666666667 },
      ]),
    ).toEqual([
      { nodeId: 'a', hours: 2 },
      { nodeId: 'b', hours: 1.67 },
    ])
  })

  it('выкидывает пустые nodeId и неположительные/нечисловые часы', () => {
    expect(
      cleanCraftParticipants([
        { nodeId: '', hours: 2 },
        { nodeId: 'a', hours: 0 },
        { nodeId: 'b', hours: -1 },
        { nodeId: 'c', hours: NaN },
        { nodeId: 'd', hours: 0.5 },
      ]),
    ).toEqual([{ nodeId: 'd', hours: 0.5 }])
  })

  it('undefined → пустой список', () => {
    expect(cleanCraftParticipants(undefined)).toEqual([])
  })
})

describe('totalCraftHours', () => {
  it('суммирует часы', () => {
    expect(totalCraftHours([{ hours: 2 }, { hours: 1.5 }, { hours: 0.25 }])).toBe(3.75)
  })

  it('игнорирует мусорные значения и пустой список', () => {
    expect(totalCraftHours([])).toBe(0)
    expect(totalCraftHours([{ hours: NaN }, { hours: -3 }, { hours: 1 }])).toBe(1)
  })

  it('не копит плавающий шум (0.1+0.2-стайл)', () => {
    expect(totalCraftHours([{ hours: 0.1 }, { hours: 0.2 }])).toBe(0.3)
  })
})

describe('missingCraftHours (инвариант Σ(часы)×ставка ≥ рабочая цена)', () => {
  it('часов хватает → 0 (в т.ч. впритык)', () => {
    // Таблица Andrey при БМ 4: необычный 75 зм / 50 зм-в-час = 1.5 ч.
    expect(
      missingCraftHours({ workCostGp: 75, ratePerHour: 50, totalHours: 1.5 }),
    ).toBe(0)
    expect(
      missingCraftHours({ workCostGp: 75, ratePerHour: 50, totalHours: 2 }),
    ).toBe(0)
  })

  it('часов не хватает → недостача, округлённая ВВЕРХ до 2 знаков', () => {
    // 250 зм при 50 зм/ч = 5 ч; вложен 1 ч → не хватает 4 ч.
    expect(
      missingCraftHours({ workCostGp: 250, ratePerHour: 50, totalHours: 1 }),
    ).toBe(4)
    // 50 зм при 3.125 зм/ч = 16 ч; вложено 15.99 → 0.01 ч (вверх, не вниз).
    expect(
      missingCraftHours({ workCostGp: 50, ratePerHour: 3.125, totalHours: 15.99 }),
    ).toBe(0.01)
  })

  it('нулевая цена покрыта всегда, даже при нулевой ставке', () => {
    expect(missingCraftHours({ workCostGp: 0, ratePerHour: 0, totalHours: 0 })).toBe(0)
  })

  it('ненулевая цена при нулевой ставке → Infinity (крафт невозможен)', () => {
    expect(
      missingCraftHours({ workCostGp: 50, ratePerHour: 0, totalHours: 100 }),
    ).toBe(Infinity)
  })
})

describe('craftRarityKey (резолв цены — plan-056)', () => {
  it('канонические ключи проходят как есть', () => {
    expect(craftRarityKey('common')).toBe('common')
    expect(craftRarityKey('very-rare')).toBe('very-rare')
    expect(craftRarityKey('legendary')).toBe('legendary')
  })

  it('null/artifact/мусор → null (строка «Кастомная», НЕ common)', () => {
    expect(craftRarityKey(null)).toBeNull()
    expect(craftRarityKey(undefined)).toBeNull()
    expect(craftRarityKey('artifact')).toBeNull()
    expect(craftRarityKey('epic')).toBeNull()
    expect(craftRarityKey(3)).toBeNull()
  })
})

describe('schemaRarityForTarget (схема на ступень выше предмета)', () => {
  it('advances regular catalogue rarities by one step', () => {
    expect(schemaRarityForTarget('common')).toBe('uncommon')
    expect(schemaRarityForTarget('uncommon')).toBe('rare')
    expect(schemaRarityForTarget('rare')).toBe('very-rare')
    expect(schemaRarityForTarget('very-rare')).toBe('legendary')
  })

  it('uses the custom schema row when no next rarity exists', () => {
    expect(schemaRarityForTarget('legendary')).toBeNull()
    expect(schemaRarityForTarget('artifact')).toBeNull()
    expect(schemaRarityForTarget(null)).toBeNull()
  })
})

describe('craftProductName (имя изделия из тайтла схемы — «вплетено»)', () => {
  it('плоская схема «Схема: X» → «X» (без изменений поведения)', () => {
    expect(craftProductName('Схема: Кольцо защиты разума')).toBe('Кольцо защиты разума')
  })

  it('кастомный вариант сохраняет суффикс «(вплетено: …)»', () => {
    expect(
      craftProductName('Схема: Кольцо защиты разума (вплетено: невидимость + гипнотик паттерн)'),
    ).toBe('Кольцо защиты разума (вплетено: невидимость + гипнотик паттерн)')
  })

  it('префикс срезается без учёта регистра и лишних пробелов', () => {
    expect(craftProductName('схема:   Меч')).toBe('Меч')
    expect(craftProductName('СХЕМА: Щит')).toBe('Щит')
  })

  it('без префикса — тайтл как есть', () => {
    expect(craftProductName('Зелье лечения')).toBe('Зелье лечения')
  })

  it('пустой/только-префикс → fallback (target/label)', () => {
    expect(craftProductName('Схема:', 'Кольцо')).toBe('Кольцо')
    expect(craftProductName('   ', 'Кольцо')).toBe('Кольцо')
    expect(craftProductName('Схема:')).toBe('')
  })
})
