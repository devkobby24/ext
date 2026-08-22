import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_FAIL_ON, loadConfig } from '../src/index.js';

const configFixturesDirectory = fileURLToPath(new URL('./fixtures/config', import.meta.url));

function fixture(name: string): string {
  return join(configFixturesDirectory, name);
}

describe('loadConfig', () => {
  it('parses a full config with both accepted-risk key styles', () => {
    const config = loadConfig(fixture('valid.yml'), configFixturesDirectory);
    expect(config.stack).toBe('PaymentsStack');
    expect(config.failOn).toEqual(['data-loss', 'orphan-on-replacement', 'orphan-on-removal']);
    expect(config.acceptedRisks).toHaveLength(2);
    expect(config.acceptedRisks[0]?.constructPath).toBe('PaymentsStack/OrdersTable');
    expect(config.acceptedRisks[1]?.logicalId).toBe('LegacyQueueDEADBEEF');
    expect(config.extraStatefulResources).toHaveLength(1);
    expect(config.extraStatefulResources[0]).toMatchObject({
      resourceType: 'AWS::Timestream::Table',
      // Conservative semantics for user-supplied types: absent policy means
      // Delete and a declared Snapshot is not trusted.
      defaultDeletionPolicy: { kind: 'fixed', policy: 'Delete' },
      supportsSnapshotPolicy: false,
    });
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(undefined, join(configFixturesDirectory, 'no-such-directory'));
    expect(config.failOn).toEqual(DEFAULT_FAIL_ON);
    expect(config.acceptedRisks).toEqual([]);
    expect(config.stack).toBeUndefined();
  });

  it('throws when an explicit path does not exist', () => {
    expect(() => loadConfig(fixture('missing.yml'), configFixturesDirectory)).toThrow(/not found/);
  });

  it('rejects unknown top-level keys so typos cannot disable the gate', () => {
    expect(() => loadConfig(fixture('unknown-key.yml'), configFixturesDirectory)).toThrow(/fail_om/);
  });

  it('rejects unknown severities in fail_on', () => {
    expect(() => loadConfig(fixture('bad-severity.yml'), configFixturesDirectory)).toThrow(
      /catastrophic/,
    );
  });

  it('rejects accepted risks without a reason', () => {
    expect(() => loadConfig(fixture('missing-reason.yml'), configFixturesDirectory)).toThrow(
      /reason is mandatory/,
    );
  });

  it('requires version: 1', () => {
    expect(() => loadConfig(fixture('missing-version.yml'), configFixturesDirectory)).toThrow(
      /"version: 1" is required/,
    );
  });
});
