import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FAIL_ON,
  evaluateVerdict,
  type DriftguardConfig,
  type Finding,
} from '../src/index.js';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    detection: 'stateful-replacement',
    severity: 'data-loss',
    certainty: 'will',
    logicalId: 'OrdersTable315BB997',
    constructPath: 'DemoStack/OrdersTable',
    resourceType: 'AWS::DynamoDB::Table',
    detail: 'test finding',
    justification: 'https://example.com',
    ...overrides,
  };
}

function configWith(overrides: Partial<DriftguardConfig>): DriftguardConfig {
  return { failOn: DEFAULT_FAIL_ON, acceptedRisks: [], ...overrides };
}

describe('evaluateVerdict with the default fail_on', () => {
  it('fails on certain data loss', () => {
    const verdict = evaluateVerdict([makeFinding({})], configWith({}));
    expect(verdict.violations).toHaveLength(1);
    expect(verdict.warnings).toHaveLength(0);
  });

  it('fails on a certain orphan-on-replacement', () => {
    const verdict = evaluateVerdict(
      [makeFinding({ severity: 'orphan-on-replacement' })],
      configWith({}),
    );
    expect(verdict.violations).toHaveLength(1);
  });

  it('warns on orphan-on-removal (not in the default fail_on)', () => {
    const verdict = evaluateVerdict(
      [makeFinding({ detection: 'stateful-deletion', severity: 'orphan-on-removal' })],
      configWith({}),
    );
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.warnings).toHaveLength(1);
  });

  it('downgrades an uncertain non-data-loss finding to a warning', () => {
    const verdict = evaluateVerdict(
      [makeFinding({ severity: 'orphan-on-replacement', certainty: 'may' })],
      configWith({}),
    );
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.warnings).toHaveLength(1);
  });

  it('does not downgrade uncertain data loss', () => {
    const verdict = evaluateVerdict([makeFinding({ certainty: 'may' })], configWith({}));
    expect(verdict.violations).toHaveLength(1);
  });
});

describe('accepted risks', () => {
  it('accepts by construct path with the stated reason', () => {
    const verdict = evaluateVerdict(
      [makeFinding({})],
      configWith({
        acceptedRisks: [
          {
            constructPath: 'DemoStack/OrdersTable',
            detection: 'stateful-replacement',
            reason: 'Key schema migration; data backfilled from S3 export (TICKET-123)',
          },
        ],
      }),
    );
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.accepted).toHaveLength(1);
    expect(verdict.accepted[0]?.reason).toContain('TICKET-123');
  });

  it('accepts by logical ID when no construct path is available', () => {
    const verdict = evaluateVerdict(
      [makeFinding({ constructPath: undefined })],
      configWith({
        acceptedRisks: [
          {
            logicalId: 'OrdersTable315BB997',
            detection: 'stateful-replacement',
            reason: 'Intentional replacement',
          },
        ],
      }),
    );
    expect(verdict.accepted).toHaveLength(1);
  });

  it('does not accept when the detection differs', () => {
    const verdict = evaluateVerdict(
      [makeFinding({})],
      configWith({
        acceptedRisks: [
          {
            constructPath: 'DemoStack/OrdersTable',
            detection: 'stateful-deletion',
            reason: 'Only accepted for deletion',
          },
        ],
      }),
    );
    expect(verdict.violations).toHaveLength(1);
    expect(verdict.accepted).toHaveLength(0);
  });

  it('throws when a risk names neither construct path nor logical ID', () => {
    expect(() =>
      evaluateVerdict(
        [],
        configWith({ acceptedRisks: [{ detection: 'stateful-replacement', reason: 'x' }] }),
      ),
    ).toThrow(/construct_path or logical_id/);
  });

  it('throws on an empty reason', () => {
    expect(() =>
      evaluateVerdict(
        [],
        configWith({
          acceptedRisks: [
            { constructPath: 'DemoStack/OrdersTable', detection: 'stateful-replacement', reason: '  ' },
          ],
        }),
      ),
    ).toThrow(/reason is mandatory/);
  });
});
