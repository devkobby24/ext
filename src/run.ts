import { readFileSync } from 'node:fs';

import { loadConstructPathMap } from './assembly/construct-map.js';
import {
  listStackArtifacts,
  readSynthesizedTemplate,
  regionFromEnvironment,
  selectStackArtifact,
} from './assembly/read-assembly.js';
import { classifyStackDiff } from './classify/classify-stack-diff.js';
import { loadConfig } from './config/load-config.js';
import { computeStackDiff } from './diff/compute-stack-diff.js';
import type { DeployedTemplateFetcher } from './deployed/fetch-deployed-template.js';
import { EXIT_CLEAN, EXIT_POLICY_VIOLATION } from './exit-codes.js';
import { formatReport } from './format/format.js';
import type { OutputFormat } from './format/types.js';
import { STATEFUL_RESOURCE_RULES } from './rules/stateful-resources.js';
import { expectRecord } from './util/json.js';
import { evaluateVerdict } from './verdict/evaluate-verdict.js';

export interface RunOptions {
  readonly assemblyDirectory: string;
  readonly stackName: string | undefined;
  readonly configPath: string | undefined;
  readonly configSearchDirectory: string;
  readonly format: OutputFormat;
  readonly region: string | undefined;
  /**
   * Offline mode: read the "deployed" template from a file instead of
   * CloudFormation. For CI without AWS credentials and for demos.
   */
  readonly deployedTemplatePath: string | undefined;
}

export interface RunDependencies {
  readonly fetchDeployedTemplate: DeployedTemplateFetcher;
}

export interface RunResult {
  readonly exitCode: typeof EXIT_CLEAN | typeof EXIT_POLICY_VIOLATION;
  readonly output: string;
}

export async function run(options: RunOptions, dependencies: RunDependencies): Promise<RunResult> {
  const config = loadConfig(options.configPath, options.configSearchDirectory);

  const artifacts = listStackArtifacts(options.assemblyDirectory);
  const artifact = selectStackArtifact(artifacts, options.stackName ?? config.stack);

  const synthesizedTemplate = readSynthesizedTemplate(options.assemblyDirectory, artifact);
  const deployedTemplate =
    options.deployedTemplatePath !== undefined
      ? expectRecord(
          JSON.parse(readFileSync(options.deployedTemplatePath, 'utf8')),
          options.deployedTemplatePath,
        )
      : await dependencies.fetchDeployedTemplate(
          artifact.stackName,
          options.region ?? regionFromEnvironment(artifact.environment),
        );

  const stackIsNew = deployedTemplate === undefined;
  const diff = computeStackDiff(deployedTemplate ?? { Resources: {} }, synthesizedTemplate);

  const findings = classifyStackDiff({
    diff,
    constructPathsByLogicalId: loadConstructPathMap(options.assemblyDirectory, artifact.stackName),
    rules: [...STATEFUL_RESOURCE_RULES, ...config.extraStatefulResources],
  });

  const verdict = evaluateVerdict(findings, config);
  const output = formatReport({ stackName: artifact.stackName, stackIsNew, verdict }, options.format);

  return {
    exitCode: verdict.violations.length > 0 ? EXIT_POLICY_VIOLATION : EXIT_CLEAN,
    output,
  };
}
