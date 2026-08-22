import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expectRecord, expectString, isRecord } from '../util/json.js';

const STACK_ARTIFACT_TYPE = 'aws:cloudformation:stack';

export interface StackArtifact {
  readonly stackName: string;
  readonly templateFile: string;
  /** e.g. "aws://123456789012/eu-west-1" or "aws://unknown-account/unknown-region". */
  readonly environment: string;
}

export function listStackArtifacts(assemblyDirectory: string): readonly StackArtifact[] {
  const manifest = expectRecord(
    readJsonFile(join(assemblyDirectory, 'manifest.json')),
    `${assemblyDirectory}/manifest.json`,
  );
  const artifacts = expectRecord(manifest['artifacts'], 'manifest.json artifacts');

  const stacks: StackArtifact[] = [];
  for (const [artifactName, artifactValue] of Object.entries(artifacts)) {
    if (!isRecord(artifactValue) || artifactValue['type'] !== STACK_ARTIFACT_TYPE) {
      continue;
    }
    const properties = expectRecord(artifactValue['properties'], `artifact ${artifactName} properties`);
    stacks.push({
      stackName: artifactName,
      templateFile: expectString(properties['templateFile'], `artifact ${artifactName} templateFile`),
      environment: expectString(artifactValue['environment'], `artifact ${artifactName} environment`),
    });
  }
  if (stacks.length === 0) {
    throw new Error(
      `No CloudFormation stacks found in ${assemblyDirectory}/manifest.json — ` +
        `run "cdk synth" first, or point --app at the correct cdk.out directory`,
    );
  }
  return stacks;
}

/** v0.1 analyzes a single stack: the named one, or the only one in the assembly. */
export function selectStackArtifact(
  artifacts: readonly StackArtifact[],
  requestedStackName: string | undefined,
): StackArtifact {
  if (requestedStackName !== undefined) {
    const match = artifacts.find((artifact) => artifact.stackName === requestedStackName);
    if (match === undefined) {
      throw new Error(
        `Stack "${requestedStackName}" not found in the assembly; ` +
          `available: ${artifacts.map((artifact) => artifact.stackName).join(', ')}`,
      );
    }
    return match;
  }
  if (artifacts.length === 1) {
    // Length check above guarantees the element exists.
    return artifacts[0]!;
  }
  throw new Error(
    `The assembly contains ${artifacts.length} stacks; pick one with --stack or the ` +
      `"stack" config key. Available: ${artifacts.map((artifact) => artifact.stackName).join(', ')}`,
  );
}

export function readSynthesizedTemplate(
  assemblyDirectory: string,
  artifact: StackArtifact,
): Record<string, unknown> {
  return expectRecord(
    readJsonFile(join(assemblyDirectory, artifact.templateFile)),
    artifact.templateFile,
  );
}

/** Returns undefined for environment-agnostic stacks, letting the SDK's default chain decide. */
export function regionFromEnvironment(environment: string): string | undefined {
  const match = /^aws:\/\/[^/]+\/(.+)$/.exec(environment);
  const region = match?.[1];
  return region === undefined || region === 'unknown-region' ? undefined : region;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
