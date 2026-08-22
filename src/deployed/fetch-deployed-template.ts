import { CloudFormationClient, GetTemplateCommand } from '@aws-sdk/client-cloudformation';

import { expectRecord } from '../util/json.js';

export type DeployedTemplateFetcher = (
  stackName: string,
  region: string | undefined,
) => Promise<Record<string, unknown> | undefined>;

/**
 * Fetch the currently deployed template — the only AWS call the tool makes,
 * and strictly read-only. Returns undefined when the stack does not exist
 * (first deployment). Uses the default TemplateStage (the template as
 * submitted), which keeps aws:cdk:path metadata intact.
 */
export const fetchDeployedTemplate: DeployedTemplateFetcher = async (stackName, region) => {
  const client = new CloudFormationClient(region === undefined ? {} : { region });
  try {
    const response = await client.send(new GetTemplateCommand({ StackName: stackName }));
    const body = response.TemplateBody;
    if (body === undefined) {
      throw new Error(`GetTemplate for stack "${stackName}" returned no template body`);
    }
    return parseTemplateBody(body, stackName);
  } catch (error) {
    if (isStackNotFound(error)) {
      return undefined;
    }
    throw error;
  } finally {
    client.destroy();
  }
};

function parseTemplateBody(body: string, stackName: string): Record<string, unknown> {
  try {
    return expectRecord(JSON.parse(body), `deployed template of ${stackName}`);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `The deployed template of stack "${stackName}" is not JSON (hand-written YAML ` +
          `templates are not supported in v0.1; CDK-deployed stacks are always JSON)`,
      );
    }
    throw error;
  }
}

function isStackNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'ValidationError' &&
    /does not exist/.test(error.message)
  );
}
