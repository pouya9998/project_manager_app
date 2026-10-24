/**
 * Suggest billable hours from changed lines.
 * Heuristic: ~80 changed lines ≈ 1 hour, rounded to 0.25h, clamped to [0.25, 8].
 * Shown to ADMIN only; users never see this (salary claim is independent).
 * Swap to AI via EffortJudgeService later (judgeSource=AI).
 */
export function suggestHoursFromLines(linesChanged: number): number | null {
  if (!linesChanged || linesChanged <= 0) return null;
  const raw = linesChanged / 80;
  const rounded = Math.round(raw * 4) / 4;
  return Math.min(8, Math.max(0.25, rounded));
}

export function suggestHoursFromCommit(commit: {
  additions?: number | null;
  deletions?: number | null;
}): number | null {
  return suggestHoursFromLines((commit.additions ?? 0) + (commit.deletions ?? 0));
}

export function linesChangedFromCommits(
  commits: { additions?: number | null; deletions?: number | null }[],
): number {
  return commits.reduce((sum, c) => sum + (c.additions ?? 0) + (c.deletions ?? 0), 0);
}
