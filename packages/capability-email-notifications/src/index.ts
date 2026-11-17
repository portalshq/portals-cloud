import { Resend } from "resend";
export * from "./schedule.js";
export * from "./preferences.js";
export * from "./verification.js";
export * from "./enqueue.js";
export * from "./unsubscribe.js";
export * from "./delivery.js";
export * from "./crm-outbox.js";
export * from "./origin.js";

export type NotificationMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  scheduledAt?: string;
  attachments?: readonly { filename: string; content: string | Buffer; contentType?: string }[];
  /** Stable key for retries of the same delivery. Resend retains it for 24 hours. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

export type DeliveryResult = { messageId?: string };
export type Notifications = { send(message: NotificationMessage): Promise<DeliveryResult> };

/** Verify provider signatures before consuming delivery events. */
export function verifyResendEvent(payload: string, headers: { id: string; timestamp: string; signature: string }, webhookSecret: string) {
  return new Resend("webhook-verification").webhooks.verify({ payload, headers, webhookSecret });
}

export function createResendNotifications(options: { apiKey: string; from: string }): Notifications {
  if (!options.apiKey) throw new Error("Resend requires an API key.");
  if (!options.from) throw new Error("Resend requires a sender address.");
  const client = new Resend(options.apiKey);

  return {
    async send(message) {
      const { data, error } = await client.emails.send({
        from: options.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? message.text.replace(/\n/g, "<br>"),
        scheduledAt: message.scheduledAt,
        attachments: message.attachments?.map((attachment) => ({ ...attachment })),
        headers: message.headers,
      }, message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined);
      if (error) throw new Error(`Email delivery failed: ${error.message}`);
      return { messageId: data?.id };
    },
  };
}
