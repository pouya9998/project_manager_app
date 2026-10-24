import { Injectable } from '@nestjs/common';
import { EffortJudgeSource } from '@prisma/client';
import { linesChangedFromCommits, suggestHoursFromLines } from './effort-suggest.util';

export type EffortJudgeInput = {
  claimedHours: number;
  commits: { additions?: number | null; deletions?: number | null; sha?: string }[];
  mergeRequest?: { mrIid: number; title: string } | null;
  taskTitle?: string;
};

export type EffortJudgeResult = {
  suggestedHours: number | null;
  judgeSource: EffortJudgeSource;
  adviceMeta: {
    method: string;
    linesChanged: number;
    formula: string;
    claimedHours: number;
    /** Reserved for future AI model name / prompt version */
    model?: string | null;
  };
};

/**
 * Produces admin-only salary advice.
 * Today: LOC heuristic. Later: call an AI model and set judgeSource=AI.
 */
@Injectable()
export class EffortJudgeService {
  async judge(input: EffortJudgeInput): Promise<EffortJudgeResult> {
    // --- Future: if (process.env.EFFORT_AI_ENABLED) return this.judgeWithAi(input);
    const linesChanged = linesChangedFromCommits(input.commits);
    const suggestedHours = suggestHoursFromLines(linesChanged);
    return {
      suggestedHours,
      judgeSource: suggestedHours != null ? EffortJudgeSource.HEURISTIC : EffortJudgeSource.NONE,
      adviceMeta: {
        method: 'loc_heuristic_v1',
        linesChanged,
        formula: '~80 changed lines ≈ 1h, clamp [0.25, 8], quarter hours',
        claimedHours: input.claimedHours,
        model: null,
      },
    };
  }
}
