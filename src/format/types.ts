import type { Verdict } from '../verdict/evaluate-verdict.js';

export const OUTPUT_FORMATS = ['human', 'json', 'markdown'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface StackReport {
  readonly stackName: string;
  /** True when no deployed template exists yet (first deployment). */
  readonly stackIsNew: boolean;
  readonly verdict: Verdict;
}
