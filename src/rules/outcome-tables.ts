import type { RemovalOutcome, Severity } from '../classify/types.js';
import type { DeclaredPolicyValue } from './types.js';

/**
 * What each effective policy does to the data when the resource leaves the
 * stack (deletion) or is swapped out (replacement).
 *
 * RetainExceptOnCreate maps to 'orphaned' deliberately: a resource being
 * removed from a deployed stack was created previously, so the policy behaves
 * like Retain. The upstream library gets this wrong (WILL_DESTROY); filed as
 * https://github.com/aws/aws-cdk-cli/issues/1882.
 */
export const OUTCOME_BY_EFFECTIVE_POLICY: Readonly<Record<DeclaredPolicyValue, RemovalOutcome>> = {
  Delete: 'data-loss',
  Retain: 'orphaned',
  RetainExceptOnCreate: 'orphaned',
  Snapshot: 'snapshot-recoverable',
};

/**
 * Severity is keyed on (detection, outcome), not outcome alone: an orphan on
 * replacement outranks an orphan on removal, because replacement detaches the
 * data while an empty successor keeps serving traffic, whereas removal with
 * Retain leaves the running resource behind deliberately.
 */
export const SEVERITY_BY_DETECTION_AND_OUTCOME: Readonly<
  Record<'stateful-replacement' | 'stateful-deletion', Readonly<Record<RemovalOutcome, Severity>>>
> = {
  'stateful-replacement': {
    'data-loss': 'data-loss',
    'orphaned': 'orphan-on-replacement',
    'snapshot-recoverable': 'snapshot-recoverable',
  },
  'stateful-deletion': {
    'data-loss': 'data-loss',
    'orphaned': 'orphan-on-removal',
    'snapshot-recoverable': 'snapshot-recoverable',
  },
};

/** Worst first; used to order findings in reports. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  'data-loss': 0,
  'orphan-on-replacement': 1,
  'orphan-on-removal': 2,
  'snapshot-recoverable': 3,
  'notice': 4,
};

export const DEFAULT_FAIL_ON: readonly Severity[] = ['data-loss', 'orphan-on-replacement'];

export const NESTED_STACK_RESOURCE_TYPE = 'AWS::CloudFormation::Stack';

export const NESTED_STACK_JUSTIFICATION =
  'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-nested-stacks.html';
