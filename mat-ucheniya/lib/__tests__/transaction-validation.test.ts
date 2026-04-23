import { describe, it, expect } from 'vitest';
import {
  validateAmountSign,
  validateDayInLoop,
  validateTransfer,
  validateCoinSet,
} from '../transaction-validation';
import type { CoinSet } from '../transactions';

describe('validateAmountSign', () => {
  it('accepts positive', () => {
    expect(validateAmountSign(5)).toBeNull();
  });

  it('accepts negative', () => {
    expect(validateAmountSign(-5)).toBeNull();
  });

  it('rejects zero', () => {
    expect(validateAmountSign(0)).toMatch(/нулём/);
  });

  it('rejects null / undefined', () => {
    expect(validateAmountSign(null)).toMatch(/Укажите/);
    expect(validateAmountSign(undefined)).toMatch(/Укажите/);
  });

  it('rejects NaN / Infinity', () => {
    expect(validateAmountSign(NaN)).toMatch(/числом/);
    expect(validateAmountSign(Infinity)).toMatch(/числом/);
  });
});

describe('validateDayInLoop', () => {
  it('accepts day 1 and day loopLength', () => {
    expect(validateDayInLoop(1, 30)).toBeNull();
    expect(validateDayInLoop(30, 30)).toBeNull();
  });

  it('rejects day 0', () => {
    expect(validateDayInLoop(0, 30)).toMatch(/от 1 до 30/);
  });

  it('rejects day > loopLength', () => {
    expect(validateDayInLoop(31, 30)).toMatch(/от 1 до 30/);
  });

  it('rejects fractional day', () => {
    expect(validateDayInLoop(1.5, 30)).toMatch(/целым/);
  });
});

describe('validateTransfer', () => {
  it('accepts different PCs in same loop', () => {
    expect(validateTransfer('a', 'b', 3, 3)).toBeNull();
  });

  it('rejects self-transfer', () => {
    expect(validateTransfer('a', 'a', 3, 3)).toMatch(/самому себе/);
  });

  it('rejects cross-loop transfer', () => {
    expect(validateTransfer('a', 'b', 3, 4)).toMatch(/одной петли/);
  });

  it('rejects empty sender or recipient', () => {
    expect(validateTransfer('', 'b', 3, 3)).toMatch(/Выберите/);
    expect(validateTransfer('a', '', 3, 3)).toMatch(/Выберите/);
  });
});

describe('validateCoinSet', () => {
  it('accepts valid non-zero set', () => {
    const c: CoinSet = { cp: 100, sp: 0, gp: 2, pp: 0 };
    expect(validateCoinSet(c)).toBeNull();
  });

  it('rejects all-zero', () => {
    expect(validateCoinSet({ cp: 0, sp: 0, gp: 0, pp: 0 })).toMatch(/ненулевой/);
  });

  it('rejects fractional amounts', () => {
    expect(validateCoinSet({ cp: 1.5, sp: 0, gp: 0, pp: 0 })).toMatch(/целым/);
  });

  it('rejects negative-zero', () => {
    expect(validateCoinSet({ cp: -0, sp: 0, gp: 1, pp: 0 })).toMatch(/Отрицательный ноль/);
  });

  it('accepts negative values (spend rows)', () => {
    expect(validateCoinSet({ cp: -100, sp: 0, gp: -2, pp: 0 })).toBeNull();
  });
});
