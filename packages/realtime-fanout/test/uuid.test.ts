import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateUUID } from "../src/uuid.js";

describe("generateUUID", () => {
  beforeEach(() => {
    // Reset crypto spy before each test
    vi.restoreAllMocks();
  });

  it("should generate a valid UUID v4 format", () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should generate unique UUIDs", () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    expect(uuid1).not.toBe(uuid2);
  });

  it("should use native crypto.randomUUID when available", () => {
    const mockUUID = "mock-uuid-1234-5678-90abcdef1234";
    vi.spyOn(globalThis, "crypto", "get").mockReturnValue({
      randomUUID: () => mockUUID,
    } as any);

    const uuid = generateUUID();
    expect(uuid).toBe(mockUUID);
  });

  it("should use fallback when crypto.randomUUID is not available", () => {
    // Mock crypto to not have randomUUID
    vi.spyOn(globalThis, "crypto", "get").mockReturnValue({
      // @ts-ignore - deliberately removing randomUUID
    } as any);

    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should use fallback when crypto is undefined", () => {
    // Mock crypto to be undefined
    vi.spyOn(globalThis, "crypto", "get").mockReturnValue(undefined as any);

    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("should generate valid v4 UUIDs with fallback", () => {
    // Force fallback by removing crypto.randomUUID
    vi.spyOn(globalThis, "crypto", "get").mockReturnValue(undefined as any);

    const uuids = Array.from({ length: 100 }, () => generateUUID());

    // All should be valid UUID v4 format
    uuids.forEach(uuid => {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    // All should be unique
    const uniqueUuids = new Set(uuids);
    expect(uniqueUuids.size).toBe(100);
  });

  it("should have correct version bits (4) in fallback", () => {
    vi.spyOn(globalThis, "crypto", "get").mockReturnValue(undefined as any);

    const uuid = generateUUID();
    const parts = uuid.split('-');
    // Version is the first character of the third part
    expect(parts[2][0]).toBe('4');
  });

  it("should have correct variant bits (RFC 4122) in fallback", () => {
    vi.spyOn(globalThis, "crypto", "get").mockReturnValue(undefined as any);

    const uuid = generateUUID();
    const parts = uuid.split('-');
    // Variant is the first character of the fourth part (should be 8, 9, a, or b)
    const variantChar = parts[3][0].toLowerCase();
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });
});
