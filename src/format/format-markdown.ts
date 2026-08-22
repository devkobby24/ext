import type { Finding } from '../classify/types.js';
import type { StackReport } from './types.js';

function findingItem(finding: Finding, acceptedReason?: string): string {
  const location = finding.constructPath ?? finding.logicalId;
  const certaintyLabel = finding.certainty === 'may' ? 'conditional' : 'certain';
  const lines = [
    `- **\`${location}\`** (\`${finding.resourceType}\`, logical ID \`${finding.logicalId}\`) — ` +
      `**${finding.severity}**, ${certaintyLabel}`,
    `  ${finding.detail} ([docs](${finding.justification}))`,
  ];
  if (acceptedReason !== undefined) {
    lines.push(`  Accepted because: ${acceptedReason}`);
  }
  return lines.join('\n');
}

/** PR-comment flavored Markdown. */
export function formatMarkdown(report: StackReport): string {
  const { verdict } = report;
  const blocked = verdict.violations.length > 0;
  const headline = blocked
    ? `🛑 destructive-diff: ${verdict.violations.length} destructive change(s) block this deploy`
    : `✅ destructive-diff: no blocking destructive changes`;

  const sections: string[] = [`## ${headline}`, `**Stack:** \`${report.stackName}\``];

  if (report.stackIsNew) {
    sections.push('_Stack is not deployed yet: every change is a creation._');
  }
  if (verdict.violations.length > 0) {
    sections.push(`### Violations\n\n${verdict.violations.map((finding) => findingItem(finding)).join('\n')}`);
  }
  if (verdict.warnings.length > 0) {
    sections.push(`### Warnings\n\n${verdict.warnings.map((finding) => findingItem(finding)).join('\n')}`);
  }
  if (verdict.accepted.length > 0) {
    sections.push(
      `### Accepted risks\n\n${verdict.accepted
        .map((acceptedFinding) => findingItem(acceptedFinding.finding, acceptedFinding.reason))
        .join('\n')}`,
    );
  }

  return sections.join('\n\n');
}
