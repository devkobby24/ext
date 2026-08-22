import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { DETECTIONS, SEVERITIES, type Detection, type Severity } from '../classify/types.js';
import { DEFAULT_FAIL_ON } from '../rules/outcome-tables.js';
import type { StatefulResourceRule } from '../rules/types.js';
import { isRecord } from '../util/json.js';
import type { AcceptedRisk, DestructiveDiffConfig } from './types.js';

export const CONFIG_FILE_NAMES = ['destructive-diff.yml', 'destructive-diff.yaml'] as const;

const DELETION_POLICY_DOC =
  'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html';

const DEFAULT_CONFIG: DestructiveDiffConfig = {
  stack: undefined,
  failOn: DEFAULT_FAIL_ON,
  acceptedRisks: [],
  extraStatefulResources: [],
};

/**
 * Load destructive-diff.yml. An explicit path must exist; otherwise the
 * search directory is checked and a missing file yields the defaults.
 * Validation is strict — unknown keys are errors, not silently ignored,
 * because a typo like fail_om would otherwise disable the gate.
 */
export function loadConfig(
  explicitPath: string | undefined,
  searchDirectory: string,
): DestructiveDiffConfig {
  const configPath = explicitPath ?? findConfigFile(searchDirectory);
  if (configPath === undefined) {
    return DEFAULT_CONFIG;
  }
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const parsed: unknown = parseYaml(readFileSync(configPath, 'utf8'));
  if (parsed === null || parsed === undefined) {
    return DEFAULT_CONFIG;
  }
  if (!isRecord(parsed)) {
    throw new Error(`${configPath} must contain a YAML mapping at the top level`);
  }
  return validateConfig(parsed, configPath);
}

function findConfigFile(searchDirectory: string): string | undefined {
  for (const fileName of CONFIG_FILE_NAMES) {
    const candidate = join(searchDirectory, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function validateConfig(raw: Record<string, unknown>, configPath: string): DestructiveDiffConfig {
  rejectUnknownKeys(raw, ['version', 'stack', 'fail_on', 'accepted_risks', 'extra_stateful_resources'], configPath);

  if (raw['version'] !== 1) {
    throw new Error(`${configPath}: "version: 1" is required, got ${JSON.stringify(raw['version'])}`);
  }

  const stack = raw['stack'];
  if (stack !== undefined && typeof stack !== 'string') {
    throw new Error(`${configPath}: "stack" must be a string`);
  }

  return {
    stack,
    failOn: raw['fail_on'] === undefined ? DEFAULT_FAIL_ON : validateFailOn(raw['fail_on'], configPath),
    acceptedRisks: validateList(raw['accepted_risks'], configPath, 'accepted_risks', validateAcceptedRisk),
    extraStatefulResources: validateList(
      raw['extra_stateful_resources'],
      configPath,
      'extra_stateful_resources',
      validateExtraStatefulResource,
    ),
  };
}

function validateFailOn(value: unknown, configPath: string): readonly Severity[] {
  if (!Array.isArray(value)) {
    throw new Error(`${configPath}: "fail_on" must be a list of severities`);
  }
  return value.map((entry) => {
    if (typeof entry !== 'string' || !(SEVERITIES as readonly string[]).includes(entry)) {
      throw new Error(
        `${configPath}: unknown fail_on severity ${JSON.stringify(entry)}; expected one of: ${SEVERITIES.join(', ')}`,
      );
    }
    // The includes() check above proves membership in the Severity union.
    return entry as Severity;
  });
}

function validateList<T>(
  value: unknown,
  configPath: string,
  keyName: string,
  validateEntry: (entry: Record<string, unknown>, configPath: string, keyName: string) => T,
): readonly T[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${configPath}: "${keyName}" must be a list`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${configPath}: ${keyName}[${index}] must be a mapping`);
    }
    return validateEntry(entry, configPath, `${keyName}[${index}]`);
  });
}

function validateAcceptedRisk(
  entry: Record<string, unknown>,
  configPath: string,
  keyName: string,
): AcceptedRisk {
  rejectUnknownKeys(entry, ['construct_path', 'logical_id', 'detection', 'reason'], configPath, keyName);

  const constructPath = optionalString(entry['construct_path'], configPath, `${keyName}.construct_path`);
  const logicalId = optionalString(entry['logical_id'], configPath, `${keyName}.logical_id`);
  if (constructPath === undefined && logicalId === undefined) {
    throw new Error(`${configPath}: ${keyName} must set construct_path or logical_id`);
  }

  const detection = entry['detection'];
  if (typeof detection !== 'string' || !(DETECTIONS as readonly string[]).includes(detection)) {
    throw new Error(
      `${configPath}: ${keyName}.detection must be one of: ${DETECTIONS.join(', ')}`,
    );
  }

  const reason = entry['reason'];
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error(`${configPath}: ${keyName}.reason is mandatory and must be a non-empty string`);
  }

  return {
    constructPath,
    logicalId,
    // The includes() check above proves membership in the Detection union.
    detection: detection as Detection,
    reason,
  };
}

function validateExtraStatefulResource(
  entry: Record<string, unknown>,
  configPath: string,
  keyName: string,
): StatefulResourceRule {
  rejectUnknownKeys(entry, ['resource_type', 'state_description', 'justification'], configPath, keyName);

  const resourceType = entry['resource_type'];
  if (typeof resourceType !== 'string' || !/^[A-Za-z0-9]+::[A-Za-z0-9]+::[A-Za-z0-9]+$/.test(resourceType)) {
    throw new Error(
      `${configPath}: ${keyName}.resource_type must be a CloudFormation type like AWS::Timestream::Table`,
    );
  }
  const stateDescription = entry['state_description'];
  if (typeof stateDescription !== 'string' || stateDescription.trim() === '') {
    throw new Error(`${configPath}: ${keyName}.state_description is mandatory`);
  }
  const justification = optionalString(entry['justification'], configPath, `${keyName}.justification`);

  // User-supplied types get conservative policy semantics: absent policy means
  // Delete, and a declared Snapshot is not trusted (CloudFormation honors
  // Snapshot only for its documented list, which excludes arbitrary types).
  return {
    resourceType,
    stateDescription,
    justification: justification ?? DELETION_POLICY_DOC,
    defaultDeletionPolicy: { kind: 'fixed', policy: 'Delete' },
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  };
}

function optionalString(value: unknown, configPath: string, description: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${configPath}: ${description} must be a string`);
  }
  return value;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  configPath: string,
  context?: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `${configPath}: unknown key "${context === undefined ? key : `${context}.${key}`}"; ` +
          `allowed keys: ${allowedKeys.join(', ')}`,
      );
    }
  }
}
