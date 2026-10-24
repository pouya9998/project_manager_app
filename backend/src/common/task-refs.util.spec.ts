import { extractTaskRefs } from './task-refs.util';

describe('extractTaskRefs', () => {
  it('finds #id and TASK-id and PROJ-id', () => {
    expect(extractTaskRefs('fix #12 and TASK-34 and ABC-99')).toEqual(
      expect.arrayContaining([12, 34, 99]),
    );
  });

  it('returns empty for blank', () => {
    expect(extractTaskRefs('')).toEqual([]);
  });
});
