import { describe, expect, it } from "vitest";
import { notificationWorkerConfig } from "./worker-config.js";

const basic = {
  NOTIFICATIONS_WORKER_ENABLED: "true", CENTRAL_DATABASE_URL: "postgres://localhost/central",
  RESEND_API_KEY: "test", RESEND_FROM_EMAIL: "sender@example.test",
  NOTIFICATIONS_PUBLIC_URL: "http://100.125.2.45:4000", NOTIFICATIONS_ALLOW_PRIVATE_HTTP: "true",
  NOTIFICATIONS_UNSUBSCRIBE_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("reminder worker configuration", () => {
  it("runs email reminders without a postal address or customer-management integration", () => {
    expect(notificationWorkerConfig(basic)).toMatchObject({ publicBaseUrl: "http://100.125.2.45:4000", allowPrivateHttp: true });
    expect(notificationWorkerConfig(basic).crm).toBeUndefined();
    expect(notificationWorkerConfig(basic).postalAddress).toBeUndefined();
  });
  it("only allows explicitly enabled private HTTP and requires complete CRM settings when opted in", () => {
    expect(() => notificationWorkerConfig({ ...basic, NOTIFICATIONS_ALLOW_PRIVATE_HTTP: "false" })).toThrow();
    expect(() => notificationWorkerConfig({ ...basic, NOTIFICATIONS_PUBLIC_URL: "http://example.com" })).toThrow();
    expect(() => notificationWorkerConfig({ ...basic, NOTIFICATIONS_CRM_ENABLED: "true" })).toThrow("CONSUMER_CRM_INTAKE_URL");
    expect(notificationWorkerConfig({ ...basic, CONSUMER_CRM_INTAKE_URL: "https://crm.example.test" }).crm).toBeUndefined();
  });
});
