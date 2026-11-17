import { describe, expect, it, vi } from 'vitest';
import { randomId } from '../src/random-id.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  it('returns RFC 4122 v4 identifiers', () => {
    expect(randomId()).toMatch(V4);
    expect(randomId()).not.toBe(randomId());
  });

  it('falls back to getRandomValues on insecure origins where randomUUID is absent', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(undefined as never);
    try { expect(randomId()).toMatch(V4); } finally { uuid.mockRestore(); }
  });
});
