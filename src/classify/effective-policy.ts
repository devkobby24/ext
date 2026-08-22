import {
  DELETION_POLICY_VALUES,
  UPDATE_REPLACE_POLICY_VALUES,
  type DeclaredPolicyValue,
  type StatefulResourceRule,
} from '../rules/types.js';
import { isRecord } from '../util/json.js';

export type PolicySource =
  | 'declared'
  | 'inferred-default'
  /** UpdateReplacePolicy: Snapshot on a type without snapshot support; documented reversion to Delete. */
  | 'declared-snapshot-reverted'
  /** DeletionPolicy: Snapshot on a type without snapshot support; behavior is undocumented. */
  | 'declared-snapshot-undocumented';

export interface EffectivePolicy {
  readonly policy: DeclaredPolicyValue;
  readonly source: PolicySource;
  /** One clause explaining how the policy was resolved; embedded in Finding.detail. */
  readonly explanation: string;
}

/** The template resource shape we read policies from (a subset of a CloudFormation resource). */
export interface TemplateResource {
  readonly Type?: unknown;
  readonly Properties?: unknown;
  readonly DeletionPolicy?: unknown;
  readonly UpdateReplacePolicy?: unknown;
}

function readDeclaredPolicy(
  declaredValue: unknown,
  attributeName: 'DeletionPolicy' | 'UpdateReplacePolicy',
  allowedValues: readonly string[],
  resourceType: string,
): DeclaredPolicyValue | undefined {
  if (declaredValue === undefined) {
    return undefined;
  }
  if (typeof declaredValue !== 'string' || !allowedValues.includes(declaredValue)) {
    throw new Error(
      `Invalid ${attributeName} ${JSON.stringify(declaredValue)} on ${resourceType}; ` +
        `expected one of: ${allowedValues.join(', ')}`,
    );
  }
  // The includes() check above proves membership in the DeclaredPolicyValue
  // union (allowedValues is always a subset of DELETION_POLICY_VALUES).
  return declaredValue as DeclaredPolicyValue;
}

function hasProperty(resource: TemplateResource, propertyName: string): boolean {
  return isRecord(resource.Properties) && resource.Properties[propertyName] !== undefined;
}

/**
 * Resolve the DeletionPolicy that governs a resource being removed from the
 * stack, honoring CloudFormation's per-type defaults and the documented
 * snapshot-support reversion.
 */
export function resolveDeletionPolicy(
  resource: TemplateResource,
  rule: StatefulResourceRule,
): EffectivePolicy {
  const declared = readDeclaredPolicy(
    resource.DeletionPolicy,
    'DeletionPolicy',
    DELETION_POLICY_VALUES,
    rule.resourceType,
  );
  if (declared !== undefined) {
    if (declared === 'Snapshot' && !rule.supportsSnapshotPolicy) {
      // The DeletionPolicy documentation lists which resource types support
      // snapshots but — unlike UpdateReplacePolicy — defines no behavior for a
      // Snapshot policy declared on any other type (verified 2026-08-22: the
      // page contains no reversion statement). The outcome is therefore
      // inferred, not documented: reported as warning-level snapshot recovery
      // with the uncertainty stated, never as guaranteed recovery and never
      // silently as data loss.
      // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html
      return {
        policy: 'Snapshot',
        source: 'declared-snapshot-undocumented',
        explanation:
          `DeletionPolicy: Snapshot (declared), but ${rule.resourceType} is not in CloudFormation's ` +
          `snapshot-capable list and the documentation does not define this combination's behavior — ` +
          `snapshot recovery is inferred, not guaranteed; verify before relying on it`,
      };
    }
    return {
      policy: declared,
      source: 'declared',
      explanation: `DeletionPolicy: ${declared} (declared)`,
    };
  }

  const defaultRule = rule.defaultDeletionPolicy;
  if (defaultRule.kind === 'fixed') {
    return {
      policy: defaultRule.policy,
      source: 'inferred-default',
      explanation:
        `DeletionPolicy: ${defaultRule.policy} (inferred default; none declared for ${rule.resourceType})`,
    };
  }
  if (hasProperty(resource, defaultRule.propertyName)) {
    return {
      policy: 'Delete',
      source: 'inferred-default',
      explanation:
        `DeletionPolicy: Delete (inferred default; none declared, and ${rule.resourceType} ` +
        `with ${defaultRule.propertyName} set defaults to Delete)`,
    };
  }
  return {
    policy: 'Snapshot',
    source: 'inferred-default',
    explanation:
      `DeletionPolicy: Snapshot (inferred default; none declared, and ${rule.resourceType} ` +
      `without ${defaultRule.propertyName} defaults to Snapshot)`,
  };
}

/**
 * Resolve the UpdateReplacePolicy that governs the old resource during a
 * replacement. Unlike DeletionPolicy: the absent-policy default is always
 * Delete (no per-type exceptions), and RetainExceptOnCreate is not a valid
 * value.
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html
 */
export function resolveUpdateReplacePolicy(
  resource: TemplateResource,
  rule: StatefulResourceRule,
): EffectivePolicy {
  const declared = readDeclaredPolicy(
    resource.UpdateReplacePolicy,
    'UpdateReplacePolicy',
    UPDATE_REPLACE_POLICY_VALUES,
    rule.resourceType,
  );
  if (declared !== undefined) {
    if (declared === 'Snapshot' && !rule.supportsSnapshotPolicy) {
      // Documented: "If you specify the Snapshot option in the
      // UpdateReplacePolicy for a resource that doesn't support snapshots,
      // CloudFormation reverts to the default option, which is Delete."
      // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html
      return {
        policy: 'Delete',
        source: 'declared-snapshot-reverted',
        explanation:
          `UpdateReplacePolicy: Snapshot (declared), but ${rule.resourceType} does not support ` +
          `snapshot policies, so CloudFormation reverts to Delete`,
      };
    }
    return {
      policy: declared,
      source: 'declared',
      explanation: `UpdateReplacePolicy: ${declared} (declared)`,
    };
  }
  return {
    policy: 'Delete',
    source: 'inferred-default',
    explanation: `UpdateReplacePolicy: Delete (inferred default; none declared)`,
  };
}
