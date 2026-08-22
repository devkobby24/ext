export const DETECTIONS = [
  'stateful-replacement',
  'stateful-deletion',
  'nested-stack-not-analyzed',
] as const;

export type Detection = (typeof DETECTIONS)[number];

export const SEVERITIES = [
  'data-loss',
  'orphan-on-replacement',
  'orphan-on-removal',
  'snapshot-recoverable',
  'notice',
] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * 'will' mirrors WILL_REPLACE (spec says the property always forces replacement);
 * 'may' mirrors MAY_REPLACE (spec says conditionally). Deletions are always 'will'.
 */
export type Certainty = 'will' | 'may';

/** What happens to the data when a stateful resource leaves the stack or is replaced. */
export type RemovalOutcome = 'data-loss' | 'orphaned' | 'snapshot-recoverable';

export interface Finding {
  readonly detection: Detection;
  readonly severity: Severity;
  readonly certainty: Certainty;
  readonly logicalId: string;
  /** Construct path the user wrote (trailing /Resource trimmed); undefined when no path source exists. */
  readonly constructPath: string | undefined;
  readonly resourceType: string;
  /** Human sentence: what changes, what happens to the data, and how the policy was resolved. */
  readonly detail: string;
  /** AWS or CDK documentation URL justifying this finding's classification. */
  readonly justification: string;
}
