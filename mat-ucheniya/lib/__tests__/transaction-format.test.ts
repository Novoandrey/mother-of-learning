import { describe, it, expect } from 'vitest';
import { formatAmount, DENOM_SHORT } from '../transaction-format';

describe('formatAmount — single-denom', () => {
  it('collapses to bare aggregate: {gp:5} → "5 GP"', () => {
    expect(formatAmount({ cp: 0, sp: 0, gp: 5, pp: 0 })).toBe('5 GP');
  });

  it('negative single-denom uses typographic minus: {gp:-5} → "−5 GP"', () => {
    expect(formatAmount({ cp: 0, sp: 0, gp: -5, pp: 0 })).toBe('\u22125 GP');
  });

  it('pp-only: {pp:3} → "30 GP"', () => {
    expect(formatAmount({ cp: 0, sp: 0, gp: 0, pp: 3 })).toBe('30 GP');
  });

  it('cp-only: {cp:100} → "1 GP" (aggregate collapse, no breakdown)', () => {
    expect(formatAmount({ cp: 100, sp: 0, gp: 0, pp: 0 })).toBe('1 GP');
  });
});

describe('formatAmount — multi-denom breakdown', () => {
  it('positive mix: {cp:100,sp:20,gp:2} → "5 GP (2 g, 20 s, 100 c)"', () => {
    expect(formatAmount({ cp: 100, sp: 20, gp: 2, pp: 0 })).toBe('5 GP (2 g, 20 s, 100 c)');
  });

  it('negative mix: sign only on aggregate, abs in parens', () => {
    expect(formatAmount({ cp: -100, sp: -20, gp: -2, pp: 0 })).toBe(
      '\u22125 GP (2 g, 20 s, 100 c)',
    );
  });

  it('breakdown order is largest → smallest', () => {
    // Input gives us cp + pp; output should be pp first, then cp
    expect(formatAmount({ cp: 100, sp: 0, gp: 0, pp: 1 })).toBe('11 GP (1 p, 100 c)');
  });

  it('fractional aggregate: {cp:99,sp:9} → "1.89 GP (9 s, 99 c)"', () => {
    expect(formatAmount({ cp: 99, sp: 9, gp: 0, pp: 0 })).toBe('1.89 GP (9 s, 99 c)');
  });
});

describe('formatAmount — zero', () => {
  it('all zeros → em dash', () => {
    expect(formatAmount({ cp: 0, sp: 0, gp: 0, pp: 0 })).toBe('\u2014');
  });
});

describe('DENOM_SHORT', () => {
  it('matches spec convention', () => {
    expect(DENOM_SHORT).toEqual({ cp: 'c', sp: 's', gp: 'g', pp: 'p' });
  });
});
