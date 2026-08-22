import { describe, expect, it } from 'vitest';

import { formatReport, type Finding, type StackReport } from '../src/index.js';

const violationFinding: Finding = {
  detection: 'stateful-replacement',
  severity: 'data-loss',
  certainty: 'will',
  logicalId: 'OrdersTable315BB997',
  constructPath: 'PaymentsStack/OrdersTable',
  resourceType: 'AWS::DynamoDB::Table',
  detail: 'Change to KeySchema forces replacement; the old resource and its table items will be deleted.',
  justification: 'https://example.com/dynamodb',
};

const warningFinding: Finding = {
  detection: 'stateful-replacement',
  severity: 'snapshot-recoverable',
  certainty: 'may',
  logicalId: 'AnalyticsDbB7A15C22',
  constructPath: undefined,
  resourceType: 'AWS::RDS::DBInstance',
  detail: 'Change to StorageType may force replacement.',
  justification: 'https://example.com/rds',
};

const report: StackReport = {
  stackName: 'PaymentsStack',
  stackIsNew: false,
  verdict: {
    violations: [violationFinding],
    warnings: [warningFinding],
    accepted: [{ finding: { ...violationFinding, logicalId: 'AcceptedX' }, reason: 'TICKET-42' }],
  },
};

describe('formatReport', () => {
  it('human format shows locations, details, and the blocking outcome', () => {
    const output = formatReport(report, 'human');
    expect(output).toContain('PaymentsStack/OrdersTable');
    expect(output).toContain('data-loss');
    expect(output).toContain('BLOCKED (exit 2)');
    expect(output).toContain('accepted because: TICKET-42');
    // A finding without a construct path falls back to its logical ID.
    expect(output).toContain('AnalyticsDbB7A15C22');
    expect(output).toContain('conditional: may replace');
  });

  it('json format is parseable with stable counts and null for missing paths', () => {
    const parsed = JSON.parse(formatReport(report, 'json'));
    expect(parsed.tool).toBe('destructive-diff');
    expect(parsed.summary).toEqual({ violations: 1, warnings: 1, accepted: 1 });
    expect(parsed.warnings[0].constructPath).toBeNull();
    expect(parsed.accepted[0].acceptedReason).toBe('TICKET-42');
  });

  it('markdown format leads with the blocking headline and links the docs', () => {
    const output = formatReport(report, 'markdown');
    expect(output).toContain('🛑 destructive-diff: 1 destructive change(s) block this deploy');
    expect(output).toContain('### Violations');
    expect(output).toContain('[docs](https://example.com/dynamodb)');
    expect(output).toContain('Accepted because: TICKET-42');
  });

  it('markdown headline is green when nothing blocks', () => {
    const cleanReport: StackReport = {
      stackName: 'PaymentsStack',
      stackIsNew: true,
      verdict: { violations: [], warnings: [], accepted: [] },
    };
    const output = formatReport(cleanReport, 'markdown');
    expect(output).toContain('✅ destructive-diff: no blocking destructive changes');
    expect(output).toContain('not deployed yet');
  });
});
