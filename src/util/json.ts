/** Narrowing helpers for values parsed from JSON (templates, manifests, tree files). */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function expectRecord(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${description} to be an object, got ${JSON.stringify(value)?.slice(0, 100)}`);
  }
  return value;
}

export function expectString(value: unknown, description: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${description} to be a string, got ${JSON.stringify(value)?.slice(0, 100)}`);
  }
  return value;
}
