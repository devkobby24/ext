import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  classifyStackDiff,
  computeStackDiff,
  STATEFUL_RESOURCE_RULES,
  type Finding,
} from '../src/index.js';

interface ExpectedFinding {
  readonly detection: string;
  readonly severity: string;
  readonly certainty: string;
  readonly logicalId: string;
  readonly constructPath: string | null;
  readonly resourceType: string;
  readonly detailIncludes?: readonly string[];
}

const fixturesDirectory = fileURLToPath(new URL('./fixtures/classify', import.meta.url));

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function comparableFields(finding: Finding) {
  return {
    detection: finding.detection,
    severity: finding.severity,
    certainty: finding.certainty,
    logicalId: finding.logicalId,
    constructPath: finding.constructPath ?? null,
    resourceType: finding.resourceType,
  };
}

function expectedFields(expected: ExpectedFinding) {
  return {
    detection: expected.detection,
    severity: expected.severity,
    certainty: expected.certainty,
    logicalId: expected.logicalId,
    constructPath: expected.constructPath,
    resourceType: expected.resourceType,
  };
}

describe('classifyStackDiff against fixture templates', () => {
  for (const fixtureName of readdirSync(fixturesDirectory).sort()) {
    it(fixtureName, () => {
      const fixtureDirectory = join(fixturesDirectory, fixtureName);
      const beforeTemplate = readJsonFile(join(fixtureDirectory, 'before.json')) as Record<string, unknown>;
      const afterTemplate = readJsonFile(join(fixtureDirectory, 'after.json')) as Record<string, unknown>;
      const expectedFindings = readJsonFile(join(fixtureDirectory, 'expected.json')) as ExpectedFinding[];

      const diff = computeStackDiff(beforeTemplate, afterTemplate);
      const findings = classifyStackDiff({
        diff,
        constructPathsByLogicalId: new Map(),
        rules: STATEFUL_RESOURCE_RULES,
      });

      expect(findings.map(comparableFields)).toEqual(expectedFindings.map(expectedFields));

      expectedFindings.forEach((expectedFinding, index) => {
        for (const fragment of expectedFinding.detailIncludes ?? []) {
          expect(findings[index]?.detail).toContain(fragment);
        }
      });

      for (const finding of findings) {
        expect(finding.justification).toMatch(/^https:\/\//);
      }
    });
  }
});
