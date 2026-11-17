import { describe, expect, it } from "vitest";
import { formatOccurrence, validateTimeZone, weeklyDeliveryKey } from "./schedule.js";

describe("recipient local schedule", () => {
  it("recognizes Monday noon across standard and daylight time", () => {
    expect(weeklyDeliveryKey(new Date("2026-01-05T17:00:00Z"), "America/New_York")).toBe("2026-01-05");
    expect(weeklyDeliveryKey(new Date("2026-07-06T16:00:00Z"), "America/New_York")).toBe("2026-07-06");
    expect(weeklyDeliveryKey(new Date("2026-07-06T17:00:00Z"), "America/New_York")).toBe("2026-07-06");
    expect(weeklyDeliveryKey(new Date("2026-07-06T15:59:00Z"), "America/New_York")).toBeNull();
    expect(weeklyDeliveryKey(new Date("2026-07-06T02:00:00Z"), "Asia/Tokyo")).toBeNull();
  });

  it("rejects invalid zones and displays the recipient's zone", () => {
    expect(() => validateTimeZone("not/a-zone")).toThrow();
    expect(formatOccurrence(new Date("2026-07-06T16:00:00Z"), "America/New_York")).toContain("12:00 PM EDT");
  });
});
