import { Resend } from "resend";

export type NotificationMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  scheduledAt?: string;
  attachments?: readonly { filename: string; content: string | Buffer; contentType?: string }[];
};

export type DeliveryResult = { messageId?: string };
export type Notifications = { send(message: NotificationMessage): Promise<DeliveryResult> };

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
      });
      if (error) throw new Error(`Email delivery failed: ${error.message}`);
      return { messageId: data?.id };
    },
  };
}
