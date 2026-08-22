import { ResourceImpact, type ResourceDifference, type TemplateDiff } from '@aws-cdk/cloudformation-diff';

import { toDisplayConstructPath } from '../assembly/construct-map.js';
import {
  NESTED_STACK_JUSTIFICATION,
  NESTED_STACK_RESOURCE_TYPE,
  OUTCOME_BY_EFFECTIVE_POLICY,
  SEVERITY_BY_DETECTION_AND_OUTCOME,
  SEVERITY_RANK,
} from '../rules/outcome-tables.js';
import { findStatefulResourceRule } from '../rules/stateful-resources.js';
import type { StatefulResourceRule } from '../rules/types.js';
import { resolveDeletionPolicy, resolveUpdateReplacePolicy } from './effective-policy.js';
import { isRecord } from '../util/json.js';
import type { Certainty, Finding, RemovalOutcome } from './types.js';

export interface ClassifyStackDiffInput {
  readonly diff: TemplateDiff;
  /** Logical ID → construct path, from the cloud assembly (may be empty). */
  readonly constructPathsByLogicalId: ReadonlyMap<string, string>;
  readonly rules: readonly StatefulResourceRule[];
}

/**
 * Pure classification: no filesystem, no AWS, no process state. Returns
 * findings sorted worst-severity first, then by logical ID.
 */
export function classifyStackDiff(input: ClassifyStackDiffInput): readonly Finding[] {
  const findings: Finding[] = [];

  for (const logicalId of input.diff.resources.logicalIds) {
    const change = input.diff.resources.get(logicalId);
    if (!change.isDifferent) {
      continue;
    }

    const oldType = typeOf(change.oldValue);
    const newType = typeOf(change.newValue);

    if (oldType === NESTED_STACK_RESOURCE_TYPE || newType === NESTED_STACK_RESOURCE_TYPE) {
      // A brand-new nested stack contains no pre-existing state to destroy;
      // updates and removals can hide destructive changes inside.
      if (!change.isAddition) {
        findings.push(nestedStackFinding(logicalId, change, input.constructPathsByLogicalId));
      }
      continue;
    }

    if (change.isAddition) {
      continue;
    }

    const typeChanged = oldType !== undefined && newType !== undefined && oldType !== newType;

    if (change.isRemoval || typeChanged) {
      // A changed Type under the same logical ID destroys the old physical
      // resource exactly like a removal does, so both take the deletion path.
      const removalFinding = classifyRemoval(logicalId, change, oldType, input);
      if (removalFinding !== undefined) {
        findings.push(removalFinding);
      }
      continue;
    }

    const replacementFinding = classifyInPlaceChange(logicalId, change, newType, input);
    if (replacementFinding !== undefined) {
      findings.push(replacementFinding);
    }
  }

  return [...findings].sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.logicalId.localeCompare(right.logicalId),
  );
}

function classifyRemoval(
  logicalId: string,
  change: ResourceDifference,
  oldType: string | undefined,
  input: ClassifyStackDiffInput,
): Finding | undefined {
  if (oldType === undefined || change.oldValue === undefined) {
    return undefined;
  }
  const rule = findStatefulResourceRule(input.rules, oldType);
  if (rule === undefined) {
    return undefined;
  }
  const effective = resolveDeletionPolicy(change.oldValue, rule);
  const outcome = OUTCOME_BY_EFFECTIVE_POLICY[effective.policy];
  return {
    detection: 'stateful-deletion',
    severity: SEVERITY_BY_DETECTION_AND_OUTCOME['stateful-deletion'][outcome],
    certainty: 'will',
    logicalId,
    constructPath: resolveConstructPath(logicalId, change, input.constructPathsByLogicalId),
    resourceType: oldType,
    detail: `Resource is removed from the stack; ${removalOutcomeClause(outcome, rule)}. ${effective.explanation}.`,
    justification: rule.justification,
  };
}

function classifyInPlaceChange(
  logicalId: string,
  change: ResourceDifference,
  newType: string | undefined,
  input: ClassifyStackDiffInput,
): Finding | undefined {
  const impact = change.changeImpact;
  if (impact !== ResourceImpact.WILL_REPLACE && impact !== ResourceImpact.MAY_REPLACE) {
    return undefined;
  }
  if (newType === undefined || change.newValue === undefined) {
    return undefined;
  }
  const rule = findStatefulResourceRule(input.rules, newType);
  if (rule === undefined) {
    return undefined;
  }
  // The policies of the updated (new) template govern what happens to the old
  // physical resource during replacement.
  const effective = resolveUpdateReplacePolicy(change.newValue, rule);
  const outcome = OUTCOME_BY_EFFECTIVE_POLICY[effective.policy];
  const certainty: Certainty = impact === ResourceImpact.MAY_REPLACE ? 'may' : 'will';
  const forcingProperties = replacementForcingProperties(change);
  return {
    detection: 'stateful-replacement',
    severity: SEVERITY_BY_DETECTION_AND_OUTCOME['stateful-replacement'][outcome],
    certainty,
    logicalId,
    constructPath: resolveConstructPath(logicalId, change, input.constructPathsByLogicalId),
    resourceType: newType,
    detail:
      `Change to ${forcingProperties.join(', ')} ${certainty === 'may' ? 'may force' : 'forces'} replacement; ` +
      `${replacementOutcomeClause(outcome, rule)}. ${effective.explanation}.`,
    justification: rule.justification,
  };
}

function nestedStackFinding(
  logicalId: string,
  change: ResourceDifference,
  constructPathsByLogicalId: ReadonlyMap<string, string>,
): Finding {
  const changeKind = change.isRemoval ? 'removed' : 'changed';
  return {
    detection: 'nested-stack-not-analyzed',
    severity: 'notice',
    certainty: 'will',
    logicalId,
    constructPath: resolveConstructPath(logicalId, change, constructPathsByLogicalId),
    resourceType: NESTED_STACK_RESOURCE_TYPE,
    detail:
      `Nested stack is ${changeKind}. driftguard v0.1 does not analyze nested stack templates; ` +
      `review the nested stack diff manually.`,
    justification: NESTED_STACK_JUSTIFICATION,
  };
}

function removalOutcomeClause(outcome: RemovalOutcome, rule: StatefulResourceRule): string {
  switch (outcome) {
    case 'data-loss':
      return `the ${rule.stateDescription} will be deleted`;
    case 'orphaned':
      return `the resource keeps running outside the stack with its ${rule.stateDescription} (manual cleanup required)`;
    case 'snapshot-recoverable':
      return `a final snapshot is taken before the resource and its ${rule.stateDescription} are deleted`;
  }
}

function replacementOutcomeClause(outcome: RemovalOutcome, rule: StatefulResourceRule): string {
  switch (outcome) {
    case 'data-loss':
      return `the old resource and its ${rule.stateDescription} will be deleted after an empty replacement takes over`;
    case 'orphaned':
      return `the old resource is detached and kept with its ${rule.stateDescription} while an empty replacement takes over`;
    case 'snapshot-recoverable':
      return `the old resource is snapshotted and deleted while an empty replacement takes over`;
  }
}

function replacementForcingProperties(change: ResourceDifference): readonly string[] {
  const forcing = Object.entries(change.propertyUpdates)
    .filter(
      ([, propertyDifference]) =>
        propertyDifference.changeImpact === ResourceImpact.WILL_REPLACE ||
        propertyDifference.changeImpact === ResourceImpact.MAY_REPLACE,
    )
    .map(([propertyName]) => propertyName)
    .sort();
  if (forcing.length === 0) {
    throw new Error('Replacement impact reported but no property carries a replacement impact');
  }
  return forcing;
}

function resolveConstructPath(
  logicalId: string,
  change: ResourceDifference,
  constructPathsByLogicalId: ReadonlyMap<string, string>,
): string | undefined {
  const fromAssembly = constructPathsByLogicalId.get(logicalId);
  // For resources that only exist in the deployed (old) template, the assembly
  // has no entry; the template's own aws:cdk:path metadata is the fallback.
  const fromTemplateMetadata =
    metadataPath(change.newValue) ?? metadataPath(change.oldValue);
  const rawPath = fromAssembly ?? fromTemplateMetadata;
  return rawPath === undefined ? undefined : toDisplayConstructPath(rawPath);
}

function metadataPath(resource: Record<string, unknown> | undefined): string | undefined {
  if (resource === undefined || !isRecord(resource['Metadata'])) {
    return undefined;
  }
  const path = resource['Metadata']['aws:cdk:path'];
  return typeof path === 'string' ? path : undefined;
}

function typeOf(resource: { Type: string } | undefined): string | undefined {
  return resource?.Type;
}
