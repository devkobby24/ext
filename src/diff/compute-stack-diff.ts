import { fullDiff, type TemplateDiff } from '@aws-cdk/cloudformation-diff';

/**
 * The CDK analytics resource. Its payload hash churns on unrelated changes
 * (CDK version bumps, construct additions elsewhere), so it would show up in
 * nearly every diff without ever being a destructive change.
 */
const CDK_METADATA_RESOURCE_TYPE = 'AWS::CDK::Metadata';

/**
 * Compute the semantic diff between the deployed template and the freshly
 * synthesized one, with CDK bookkeeping noise removed.
 *
 * Replacement classification is service-spec based (no changeset), so
 * conditional replacements surface as MAY_REPLACE; that uncertainty is
 * preserved and reported, never guessed away.
 */
export function computeStackDiff(
  deployedTemplate: Record<string, unknown>,
  synthesizedTemplate: Record<string, unknown>,
): TemplateDiff {
  const diff = fullDiff(deployedTemplate, synthesizedTemplate);
  for (const logicalId of [...diff.resources.logicalIds]) {
    const change = diff.resources.get(logicalId);
    const oldType: unknown = change.oldValue?.Type;
    const newType: unknown = change.newValue?.Type;
    if (oldType === CDK_METADATA_RESOURCE_TYPE || newType === CDK_METADATA_RESOURCE_TYPE) {
      diff.resources.remove(logicalId);
    }
  }
  return diff;
}
