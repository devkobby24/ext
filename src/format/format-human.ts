import type { Finding } from '../classify/types.js';
import type { StackReport } from './types.js';

function findingLocation(finding: Finding): string {
  return finding.constructPath ?? finding.logicalId;
}

function findingBlock(marker: string, finding: Finding, acceptedReason?: string): string {
  const certaintyNote = finding.certainty === 'may' ? ' (conditional: may replace)' : '';
  const lines = [
    `${marker} ${finding.severity}${certaintyNote}  ${findingLocation(finding)}  [${finding.resourceType}]`,
    `    ${finding.detail}`,
    `    logical ID: ${finding.logicalId}`,
    `    docs: ${finding.justification}`,
  ];
  if (acceptedReason !== undefined) {
    lines.push(`    accepted because: ${acceptedReason}`);
  }
  return lines.join('\n');
}

export function formatHuman(report: StackReport): string {
  const { verdict } = report;
  const sections: string[] = [`destructive-diff — stack ${report.stackName}`];

  if (report.stackIsNew) {
    sections.push(
      'Stack is not deployed yet: every change is a creation, nothing existing can be destroyed.',
    );
  }

  for (const finding of verdict.violations) {
    sections.push(findingBlock('✖', finding));
  }
  for (const finding of verdict.warnings) {
    sections.push(findingBlock('⚠', finding));
  }
  for (const acceptedFinding of verdict.accepted) {
    sections.push(findingBlock('✓', acceptedFinding.finding, acceptedFinding.reason));
  }

  const summary =
    `${verdict.violations.length} violation(s), ${verdict.warnings.length} warning(s), ` +
    `${verdict.accepted.length} accepted`;
  const outcome = verdict.violations.length > 0 ? 'BLOCKED (exit 2)' : 'clean (exit 0)';
  sections.push(`${summary} — ${outcome}`);

  return sections.join('\n\n');
}
