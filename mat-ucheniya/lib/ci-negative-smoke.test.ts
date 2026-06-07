// TEMPORARY — spec-028 T013 negative smoke. This test fails on purpose so the CI
// gate (vitest) goes red and the `deploy` job is skipped, proving broken code
// never reaches prod. Removed immediately after the run is verified.
import { describe, it, expect } from 'vitest';

describe('spec-028 T013 negative smoke (temporary)', () => {
  it('fails intentionally to prove the gate blocks deploy', () => {
    expect(1).toBe(2);
  });
});
