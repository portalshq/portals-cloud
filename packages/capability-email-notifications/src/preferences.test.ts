import { describe, expect, it, vi } from "vitest";
import { NotificationPreferencesStore } from "./preferences.js";

describe("notification preferences", () => {
  it("saves both independent choices and queues CRM data atomically", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "outbox" }] });
    await new NotificationPreferencesStore({ query }).setProgram({ recipientId: "r", programId: "p",
      episode: true, weekly: true, consentSource: "show", attribution: { utmCampaign: "launch" } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("INSERT INTO notification_crm_outbox");
    expect(query.mock.calls[0][1].slice(0, 5)).toEqual(["r", "p", true, true, "show"]);
    expect(JSON.parse(query.mock.calls[0][1][5])).toMatchObject({ programId: "p", utmCampaign: "launch" });
  });

  it("validates a time zone before writing", async () => {
    const query = vi.fn();
    await expect(new NotificationPreferencesStore({ query }).setTimeZone("r", "Invalid/Zone")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
