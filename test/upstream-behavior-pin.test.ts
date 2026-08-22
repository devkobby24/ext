import { fullDiff, ResourceImpact } from '@aws-cdk/cloudformation-diff';
import { describe, expect, it } from 'vitest';

/**
 * Pins the exact @aws-cdk/cloudformation-diff behaviors this tool relies on.
 * The package is not a stable public API and is pinned to an exact version;
 * when a dependency upgrade changes any of these behaviors, this file fails
 * loudly so the classifier can be re-validated instead of silently drifting.
 *
 * One pin FAILS BY DESIGN when upstream ships a fix: the RetainExceptOnCreate
 * and Snapshot removal misclassification we reported as
 * https://github.com/aws/aws-cdk-cli/issues/1882. If that test fails after an
 * upgrade, upstream fixed the bug — re-check the assumptions in
 * OUTCOME_BY_EFFECTIVE_POLICY, update this pin, and record the change in
 * NOTES.md.
 */

function removalImpact(deletionPolicy: string | undefined): ResourceImpact {
  const resource: Record<string, unknown> = { Type: 'AWS::RDS::DBInstance' };
  if (deletionPolicy !== undefined) {
    resource['DeletionPolicy'] = deletionPolicy;
  }
  const diff = fullDiff({ Resources: { Db: resource } }, { Resources: {} });
  return diff.resources.get('Db').changeImpact;
}

describe('upstream removal impact classification', () => {
  it('classifies Delete removals as WILL_DESTROY and Retain removals as WILL_ORPHAN', () => {
    expect(removalImpact('Delete')).toBe(ResourceImpact.WILL_DESTROY);
    expect(removalImpact('Retain')).toBe(ResourceImpact.WILL_ORPHAN);
  });

  it('still misclassifies RetainExceptOnCreate and Snapshot as WILL_DESTROY', () => {
    // Known upstream bug, filed as https://github.com/aws/aws-cdk-cli/issues/1882.
    // driftguard resolves policies itself and does not depend on these values;
    // if this test fails after an upgrade, upstream fixed the classification —
    // re-check OUTCOME_BY_EFFECTIVE_POLICY assumptions and update NOTES.md.
    expect(removalImpact('RetainExceptOnCreate')).toBe(ResourceImpact.WILL_DESTROY);
    expect(removalImpact('Snapshot')).toBe(ResourceImpact.WILL_DESTROY);
  });
});

describe('upstream replacement impact classification', () => {
  it('reports WILL_REPLACE for an Always-replacement property (DynamoDB KeySchema)', () => {
    const diff = fullDiff(
      {
        Resources: {
          T: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }] },
          },
        },
      },
      {
        Resources: {
          T: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }] },
          },
        },
      },
    );
    expect(diff.resources.get('T').changeImpact).toBe(ResourceImpact.WILL_REPLACE);
  });

  it('reports MAY_REPLACE for a Conditionally-replacement property (RDS StorageType)', () => {
    const diff = fullDiff(
      { Resources: { Db: { Type: 'AWS::RDS::DBInstance', Properties: { StorageType: 'gp2' } } } },
      { Resources: { Db: { Type: 'AWS::RDS::DBInstance', Properties: { StorageType: 'io1' } } } },
    );
    expect(diff.resources.get('Db').changeImpact).toBe(ResourceImpact.MAY_REPLACE);
  });
});

describe('DifferenceCollection.remove', () => {
  it('removes a tracked logical ID (used by the CDK metadata noise filter)', () => {
    const diff = fullDiff(
      { Resources: { M: { Type: 'AWS::CDK::Metadata', Properties: { Analytics: 'a' } } } },
      { Resources: { M: { Type: 'AWS::CDK::Metadata', Properties: { Analytics: 'b' } } } },
    );
    expect(diff.resources.logicalIds).toContain('M');
    diff.resources.remove('M');
    expect(diff.resources.logicalIds).not.toContain('M');
  });
});
