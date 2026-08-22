import type { Finding } from '../classify/types.js';
import type { AcceptedRisk, DriftguardConfig } from '../config/types.js';

export interface AcceptedFinding {
  readonly finding: Finding;
  readonly reason: string;
}

export interface Verdict {
  readonly violations: readonly Finding[];
  readonly warnings: readonly Finding[];
  readonly accepted: readonly AcceptedFinding[];
}

/**
 * Sort findings into violations (exit 2), warnings (reported, exit 0), and
 * accepted risks (matched by config, reported with their reason).
 *
 * MAY_REPLACE rule: a 'may' certainty downgrades a would-be violation to a
 * warning unless the outcome is actual data loss — an uncertain replacement
 * whose worst case is recoverable does not block, an uncertain one whose
 * worst case destroys data does.
 */
export function evaluateVerdict(findings: readonly Finding[], config: DriftguardConfig): Verdict {
  for (const risk of config.acceptedRisks) {
    assertValidAcceptedRisk(risk);
  }

  const violations: Finding[] = [];
  const warnings: Finding[] = [];
  const accepted: AcceptedFinding[] = [];

  for (const finding of findings) {
    const matchingRisk = config.acceptedRisks.find((risk) => riskMatchesFinding(risk, finding));
    if (matchingRisk !== undefined) {
      accepted.push({ finding, reason: matchingRisk.reason });
      continue;
    }
    const inFailOn = config.failOn.includes(finding.severity);
    const blockedByCertainty = finding.certainty === 'may' && finding.severity !== 'data-loss';
    if (inFailOn && !blockedByCertainty) {
      violations.push(finding);
    } else {
      warnings.push(finding);
    }
  }

  return { violations, warnings, accepted };
}

function riskMatchesFinding(risk: AcceptedRisk, finding: Finding): boolean {
  if (risk.detection !== finding.detection) {
    return false;
  }
  if (risk.constructPath !== undefined && risk.constructPath === finding.constructPath) {
    return true;
  }
  return risk.logicalId !== undefined && risk.logicalId === finding.logicalId;
}

function assertValidAcceptedRisk(risk: AcceptedRisk): void {
  if (risk.constructPath === undefined && risk.logicalId === undefined) {
    throw new Error(
      `accepted_risks entry for detection "${risk.detection}" must set construct_path or logical_id`,
    );
  }
  if (risk.reason.trim() === '') {
    throw new Error(
      `accepted_risks entry for ${risk.constructPath ?? risk.logicalId} has an empty reason; a reason is mandatory`,
    );
  }
}
