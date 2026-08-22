import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadConstructPathMap, toDisplayConstructPath } from '../src/index.js';

const assemblyDirectory = fileURLToPath(new URL('./fixtures/assembly', import.meta.url));

describe('loadConstructPathMap on a real synthesized assembly', () => {
  it('maps hashed logical IDs to construct paths', () => {
    const paths = loadConstructPathMap(assemblyDirectory, 'DemoStack');
    expect(paths.get('OrdersTable315BB997')).toBe('DemoStack/OrdersTable/Resource');
    expect(paths.get('AssetsBucket5CB76180')).toBe('DemoStack/AssetsBucket/Resource');
  });

  it('throws with the available artifacts when the stack is unknown', () => {
    expect(() => loadConstructPathMap(assemblyDirectory, 'NoSuchStack')).toThrow(
      /Stack "NoSuchStack" not found.*DemoStack/,
    );
  });
});

describe('toDisplayConstructPath', () => {
  it('trims the synthesized L1 child from L2 construct paths', () => {
    expect(toDisplayConstructPath('DemoStack/OrdersTable/Resource')).toBe('DemoStack/OrdersTable');
    expect(toDisplayConstructPath('/DemoStack/CDKMetadata/Default')).toBe('DemoStack/CDKMetadata');
  });

  it('leaves paths without a synthesized child untouched', () => {
    expect(toDisplayConstructPath('DemoStack/RawTable')).toBe('DemoStack/RawTable');
  });
});
