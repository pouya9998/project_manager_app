import { suggestHoursFromCommit, suggestHoursFromLines } from './effort-suggest.util';

describe('suggestHoursFromLines', () => {
  it('returns null when no lines', () => {
    expect(suggestHoursFromLines(0)).toBeNull();
  });

  it('suggests quarter hours from LOC', () => {
    expect(suggestHoursFromLines(40)).toBe(0.5);
    expect(suggestHoursFromLines(80)).toBe(1);
    // ~36 lines ≈ 0.45 raw → rounds to 0.5
    expect(suggestHoursFromLines(36)).toBe(0.5);
  });

  it('clamps to 0.25..8', () => {
    expect(suggestHoursFromLines(1)).toBe(0.25);
    expect(suggestHoursFromLines(10000)).toBe(8);
  });
});

describe('suggestHoursFromCommit', () => {
  it('uses additions+deletions', () => {
    expect(suggestHoursFromCommit({ additions: 40, deletions: 0 })).toBe(0.5);
    expect(suggestHoursFromCommit({})).toBeNull();
  });
});
