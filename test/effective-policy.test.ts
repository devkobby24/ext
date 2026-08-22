import { describe, expect, it } from 'vitest';

import {
  findStatefulResourceRule,
  resolveDeletionPolicy,
  resolveUpdateReplacePolicy,
  STATEFUL_RESOURCE_RULES,
  type StatefulResourceRule,
} from '../src/index.js';

function ruleFor(resourceType: string): StatefulResourceRule {
  const rule = findStatefulResourceRule(STATEFUL_RESOURCE_RULES, resourceType);
  if (rule === undefined) {
    throw new Error(`No rule for ${resourceType}`);
  }
  return rule;
}

describe('resolveDeletionPolicy', () => {
  it('uses a declared policy verbatim', () => {
    const resolved = resolveDeletionPolicy({ DeletionPolicy: 'Retain' }, ruleFor('AWS::S3::Bucket'));
    expect(resolved).toMatchObject({ policy: 'Retain', source: 'declared' });
  });

  it('treats RetainExceptOnCreate as a valid DeletionPolicy', () => {
    const resolved = resolveDeletionPolicy(
      { DeletionPolicy: 'RetainExceptOnCreate' },
      ruleFor('AWS::S3::Bucket'),
    );
    expect(resolved).toMatchObject({ policy: 'RetainExceptOnCreate', source: 'declared' });
  });

  it('throws on an invalid declared value', () => {
    expect(() =>
      resolveDeletionPolicy({ DeletionPolicy: 'Keep' }, ruleFor('AWS::S3::Bucket')),
    ).toThrow(/Invalid DeletionPolicy/);
  });

  it('infers Delete for types with a plain Delete default', () => {
    const resolved = resolveDeletionPolicy({}, ruleFor('AWS::DynamoDB::Table'));
    expect(resolved).toMatchObject({ policy: 'Delete', source: 'inferred-default' });
    expect(resolved.explanation).toContain('inferred default');
  });

  it('infers Snapshot for an RDS instance without DBClusterIdentifier', () => {
    const resolved = resolveDeletionPolicy(
      { Properties: { Engine: 'postgres' } },
      ruleFor('AWS::RDS::DBInstance'),
    );
    expect(resolved).toMatchObject({ policy: 'Snapshot', source: 'inferred-default' });
    expect(resolved.explanation).toContain('DBClusterIdentifier');
  });

  it('infers Delete for an RDS instance that is a cluster member', () => {
    const resolved = resolveDeletionPolicy(
      { Properties: { Engine: 'aurora-postgresql', DBClusterIdentifier: 'main' } },
      ruleFor('AWS::RDS::DBInstance'),
    );
    expect(resolved).toMatchObject({ policy: 'Delete', source: 'inferred-default' });
  });

  it('reverts a declared Snapshot to Delete on a type that does not support snapshots', () => {
    const resolved = resolveDeletionPolicy(
      { DeletionPolicy: 'Snapshot' },
      ruleFor('AWS::DynamoDB::Table'),
    );
    expect(resolved).toMatchObject({ policy: 'Delete', source: 'declared-snapshot-unsupported' });
    expect(resolved.explanation).toContain('does not support snapshot policies');
  });
});

describe('resolveUpdateReplacePolicy', () => {
  it('defaults to Delete with no per-type exception, even for RDS', () => {
    const resolved = resolveUpdateReplacePolicy(
      { Properties: { Engine: 'postgres' } },
      ruleFor('AWS::RDS::DBInstance'),
    );
    expect(resolved).toMatchObject({ policy: 'Delete', source: 'inferred-default' });
  });

  it('rejects RetainExceptOnCreate, which is not a valid UpdateReplacePolicy value', () => {
    expect(() =>
      resolveUpdateReplacePolicy(
        { UpdateReplacePolicy: 'RetainExceptOnCreate' },
        ruleFor('AWS::S3::Bucket'),
      ),
    ).toThrow(/Invalid UpdateReplacePolicy/);
  });

  it('honors a declared Snapshot on a snapshot-capable type', () => {
    const resolved = resolveUpdateReplacePolicy(
      { UpdateReplacePolicy: 'Snapshot' },
      ruleFor('AWS::RDS::DBInstance'),
    );
    expect(resolved).toMatchObject({ policy: 'Snapshot', source: 'declared' });
  });
});
