/**
 * Valid DeletionPolicy values. UpdateReplacePolicy accepts only a subset
 * (Delete | Retain | Snapshot); the resolver enforces that difference.
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html
 */
export const DELETION_POLICY_VALUES = ['Delete', 'Retain', 'RetainExceptOnCreate', 'Snapshot'] as const;
export type DeclaredPolicyValue = (typeof DELETION_POLICY_VALUES)[number];

export const UPDATE_REPLACE_POLICY_VALUES = ['Delete', 'Retain', 'Snapshot'] as const;

/**
 * How to resolve DeletionPolicy when the template does not declare one.
 * 'snapshot-unless-property-present' encodes CloudFormation's documented RDS
 * exception: the default is Snapshot unless the named property is set.
 */
export type DefaultDeletionPolicyRule =
  | { readonly kind: 'fixed'; readonly policy: 'Delete' | 'Snapshot' }
  | { readonly kind: 'snapshot-unless-property-present'; readonly propertyName: string };

export interface StatefulResourceRule {
  readonly resourceType: string;
  /** Plain-language description of the data at risk, used verbatim in findings. */
  readonly stateDescription: string;
  /** Documentation URL justifying why replacement/deletion of this type is destructive. */
  readonly justification: string;
  /** Default DeletionPolicy CloudFormation applies when the template declares none. */
  readonly defaultDeletionPolicy: DefaultDeletionPolicyRule;
  /** Documentation URL for the default policy and snapshot-support facts. */
  readonly defaultPolicyJustification: string;
  /**
   * Whether CloudFormation honors a Snapshot policy for this type. A declared
   * Snapshot on an unsupported type silently reverts to Delete (per the
   * DeletionPolicy/UpdateReplacePolicy attribute docs), which is data loss.
   */
  readonly supportsSnapshotPolicy: boolean;
}
