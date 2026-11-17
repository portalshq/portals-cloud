import { notificationOrigin } from "./origin.js";

/** Only the email path is required. CRM delivery is a separate opt-in. */
export function notificationWorkerConfig(env: NodeJS.ProcessEnv) {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  if (env.NOTIFICATIONS_WORKER_ENABLED !== "true" || env.DRY_RUN) {
    throw new Error("Notification worker requires NOTIFICATIONS_WORKER_ENABLED=true and must not run in dry-run mode");
  }
  const allowPrivateHttp = env.NOTIFICATIONS_ALLOW_PRIVATE_HTTP === "true";
  const publicBaseUrl = notificationOrigin(required("NOTIFICATIONS_PUBLIC_URL"), allowPrivateHttp).origin;
  const unsubscribeSecret = required("NOTIFICATIONS_UNSUBSCRIBE_SECRET");
  if (Buffer.byteLength(unsubscribeSecret) < 32) throw new Error("Notification secret must be at least 32 bytes");
  const crm = env.NOTIFICATIONS_CRM_ENABLED === "true"
    ? { endpoint: required("CONSUMER_CRM_INTAKE_URL"), secret: required("CONSUMER_CRM_INGEST_SECRET") }
    : undefined;
  if (crm && (Buffer.byteLength(crm.secret) < 32 || /\s/.test(crm.secret))) throw new Error("CRM secret must be at least 32 bytes without whitespace");
  return {
    databaseUrl: required("CENTRAL_DATABASE_URL"), apiKey: required("RESEND_API_KEY"), from: required("RESEND_FROM_EMAIL"),
    publicBaseUrl, unsubscribeSecret, allowPrivateHttp, postalAddress: env.NOTIFICATIONS_POSTAL_ADDRESS?.trim(), crm,
  };
}
