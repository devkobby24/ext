import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EXIT_CLEAN,
  EXIT_POLICY_VIOLATION,
  run,
  type DeployedTemplateFetcher,
  type RunOptions,
} from '../src/index.js';

const fixturesDirectory = fileURLToPath(new URL('./fixtures', import.meta.url));
const assemblyDirectory = join(fixturesDirectory, 'assembly');
const deployedTemplatePath = join(fixturesDirectory, 'deployed', 'demo-stack-deployed.json');

function optionsWith(overrides: Partial<RunOptions>): RunOptions {
  return {
    assemblyDirectory,
    stackName: undefined,
    configPath: undefined,
    // A directory with no config file, so defaults apply unless a test says otherwise.
    configSearchDirectory: assemblyDirectory,
    format: 'json',
    region: undefined,
    deployedTemplatePath: undefined,
    ...overrides,
  };
}

const neverFetch: DeployedTemplateFetcher = () => {
  throw new Error('fetchDeployedTemplate must not be called in this test');
};

describe('run', () => {
  it('blocks a key-schema change against the deployed template (offline mode, no AWS call)', async () => {
    const result = await run(optionsWith({ deployedTemplatePath }), {
      fetchDeployedTemplate: neverFetch,
    });
    expect(result.exitCode).toBe(EXIT_POLICY_VIOLATION);
    const parsed = JSON.parse(result.output);
    expect(parsed.summary.violations).toBe(1);
    expect(parsed.violations[0]).toMatchObject({
      detection: 'stateful-replacement',
      severity: 'data-loss',
      logicalId: 'OrdersTable315BB997',
      constructPath: 'DemoStack/OrdersTable',
    });
  });

  it('passes the stack name and environment-derived region to the fetcher', async () => {
    const calls: Array<{ stackName: string; region: string | undefined }> = [];
    const recordingFetcher: DeployedTemplateFetcher = (stackName, region) => {
      calls.push({ stackName, region });
      return Promise.resolve(undefined);
    };
    await run(optionsWith({}), { fetchDeployedTemplate: recordingFetcher });
    // The fixture stack is environment-agnostic (unknown-region), so the
    // region must stay undefined for the SDK default chain to decide.
    expect(calls).toEqual([{ stackName: 'DemoStack', region: undefined }]);
  });

  it('treats a not-yet-deployed stack as clean', async () => {
    const result = await run(optionsWith({}), {
      fetchDeployedTemplate: () => Promise.resolve(undefined),
    });
    expect(result.exitCode).toBe(EXIT_CLEAN);
    const parsed = JSON.parse(result.output);
    expect(parsed.stackIsNew).toBe(true);
    expect(parsed.summary).toEqual({ violations: 0, warnings: 0, accepted: 0 });
  });

  it('reports clean when deployed and synthesized templates match', async () => {
    const result = await run(
      optionsWith({ deployedTemplatePath: join(assemblyDirectory, 'DemoStack.template.json') }),
      { fetchDeployedTemplate: neverFetch },
    );
    expect(result.exitCode).toBe(EXIT_CLEAN);
  });

  it('fails with the available stacks when the requested one is missing', async () => {
    await expect(
      run(optionsWith({ stackName: 'NoSuchStack' }), { fetchDeployedTemplate: neverFetch }),
    ).rejects.toThrow(/NoSuchStack.*DemoStack/s);
  });
});
