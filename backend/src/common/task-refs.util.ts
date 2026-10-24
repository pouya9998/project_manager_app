/** Extract task ids from commit/MR/branch text: #123 or TASK-123 / TASK_123 */
export function extractTaskRefs(text: string): number[] {
  if (!text) return [];
  const ids = new Set<number>();
  for (const m of text.matchAll(/#(\d{1,8})\b/g)) ids.add(Number(m[1]));
  for (const m of text.matchAll(/\bTASK[_-]?(\d{1,8})\b/gi)) ids.add(Number(m[1]));
  for (const m of text.matchAll(/\b([A-Z]{2,10})-(\d{1,8})\b/g)) {
    // PROJ-123 style — use numeric part as task id when no separate mapping
    ids.add(Number(m[2]));
  }
  return [...ids];
}
