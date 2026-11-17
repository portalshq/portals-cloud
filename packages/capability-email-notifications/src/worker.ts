import pg from "pg";
import { createResendNotifications } from "./index.js";
import { enqueueDueNotifications } from "./enqueue.js";
import { deliverOneNotification } from "./delivery.js";
import { deliverOneCrmEvent } from "./crm-outbox.js";
import { notificationWorkerConfig } from "./worker-config.js";

async function main(): Promise<void> {
  const { databaseUrl, apiKey, from, publicBaseUrl, unsubscribeSecret, postalAddress, allowPrivateHttp, crm } = notificationWorkerConfig(process.env);
  const db = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  const notifications = createResendNotifications({ apiKey, from });
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    while (!stopped) {
      try {
        await db.query("DELETE FROM notification_rate_limits WHERE expires_at < now() - interval '1 day'");
        await db.query("DELETE FROM notification_email_verifications WHERE expires_at < now() - interval '7 days'");
        await enqueueDueNotifications(db, new Date());
        for (let i = 0; i < 100 && !stopped; i++) {
          if (!await deliverOneNotification({ db, notifications, publicBaseUrl, unsubscribeSecret, postalAddress, allowPrivateHttp })) break;
        }
      } catch (error) { console.error("[notification worker] delivery failed", error); }
      if (crm) try {
        for (let i = 0; i < 100 && !stopped; i++) {
          if (!await deliverOneCrmEvent({ db, endpoint: crm.endpoint, secret: crm.secret })) break;
        }
      } catch (error) { console.error("[notification worker] CRM delivery failed", error); }
      if (!stopped) await new Promise<void>(resolve => setTimeout(resolve, 30_000));
    }
  } finally { await db.end(); }
}

main().catch(error => { console.error("[notification worker] startup failed", error); process.exitCode = 1; });
