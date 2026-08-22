import type { Detection, Severity } from '../classify/types.js';

/**
 * One accepted risk from destructive-diff.yml. Matches a finding by detection plus
 * either construct path or logical ID (logical ID exists for the cases where
 * path metadata is disabled and findings degrade to logical IDs).
 */
export interface AcceptedRisk {
  readonly constructPath?: string;
  readonly logicalId?: string;
  readonly detection: Detection;
  /** Mandatory: why this risk is acceptable. Enforced non-empty. */
  readonly reason: string;
}

export interface DestructiveDiffConfig {
  /** Severities that produce exit code 2. */
  readonly failOn: readonly Severity[];
  readonly acceptedRisks: readonly AcceptedRisk[];
}
