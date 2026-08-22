import type { Finding } from '../classify/types.js';
import type { StackReport } from './types.js';

interface FindingJson {
  readonly detection: string;
  readonly severity: string;
  readonly certainty: string;
  readonly logicalId: string;
  readonly constructPath: string | null;
  readonly resourceType: string;
  readonly detail: string;
  readonly justification: string;
}

function findingToJson(finding: Finding): FindingJson {
  return {
    detection: finding.detection,
    severity: finding.severity,
    certainty: finding.certainty,
    logicalId: finding.logicalId,
    constructPath: finding.constructPath ?? null,
    resourceType: finding.resourceType,
    detail: finding.detail,
    justification: finding.justification,
  };
}

export function formatJson(report: StackReport): string {
  const { verdict } = report;
  return JSON.stringify(
    {
      tool: 'destructive-diff',
      stack: report.stackName,
      stackIsNew: report.stackIsNew,
      summary: {
        violations: verdict.violations.length,
        warnings: verdict.warnings.length,
        accepted: verdict.accepted.length,
      },
      violations: verdict.violations.map(findingToJson),
      warnings: verdict.warnings.map(findingToJson),
      accepted: verdict.accepted.map((acceptedFinding) => ({
        ...findingToJson(acceptedFinding.finding),
        acceptedReason: acceptedFinding.reason,
      })),
    },
    null,
    2,
  );
}
