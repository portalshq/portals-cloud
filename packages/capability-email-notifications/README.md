# @portalshq/capability-email-notifications

Delivers notification messages through Resend with a small `send(message)` interface.

Messages may include an `idempotencyKey` for safe retries and custom `headers`
for provider-supported email metadata, including unsubscribe headers. The
caller remains responsible for durable delivery records and preference checks.

## Show reminders

The shared central database stores mailbox proof, independent program follows
and email choices, the delivery ledger, and the CRM outbox. Apply the shared
SQL files in `sql/` after the central identity and station schemas, or apply the
equivalent Bears central migrations through `0008_notification_subscriptions.sql`, before
starting the service. Existing calendar-invite records are retained and are
not converted to recurring email consent.

Build the package and run `npm run worker` as a supervised long-running
process. It is disabled unless `NOTIFICATIONS_WORKER_ENABLED=true`, and refuses
to run when `DRY_RUN` is set. It needs `CENTRAL_DATABASE_URL`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `NOTIFICATIONS_PUBLIC_URL` (the Channels origin), and
`NOTIFICATIONS_UNSUBSCRIBE_SECRET` (at least 32 bytes). HTTPS is the default;
set `NOTIFICATIONS_ALLOW_PRIVATE_HTTP=true` on both Channels and the worker to
allow loopback or Tailscale HTTP. `NOTIFICATIONS_POSTAL_ADDRESS` is optional.
CRM delivery is disabled by default and is not needed for reminders. To enable
it separately, set `NOTIFICATIONS_CRM_ENABLED=true`,
`CONSUMER_CRM_INTAKE_URL` and `CONSUMER_CRM_INGEST_SECRET`.

The Channels service needs the central database (`ADMIN_CENTRAL_DATABASE_URL`),
Resend credentials, the public URL and unsubscribe secret above, and the auth
gateway settings. Set `NOTIFICATIONS_TRUSTED_CLIENT_IP_HEADER` only to a
header overwritten by the trusted edge; without it verification requests use
a shared safety limit. Configure `RESEND_WEBHOOK_SECRET` and point the Resend
webhook to `/api/notifications/webhook` for bounces and complaints. Configure
the provider's signed webhook in addition to the application route.

The reminder dialog detects the viewer's time zone and offers episode reminders
and a weekly followed-show schedule. Existing general-schedule subscriptions
are preserved; the dialog does not create new ones. Signed-in viewers use their
verified notification address, or confirm the account email before activation.
The current gateway does not expose an email address: if the central user has
no email on record, the viewer must add and verify one in notification settings
once. A later signup reuses the verified address.

The worker polls every 30 seconds and claims database jobs with leases. It
sends episode reminders six minutes ahead and separately opted-in weekly
emails after Monday noon in the recipient's time zone. An expired 23-hour
retry window is marked failed rather than risking a duplicate beyond Resend's
idempotency retention. Monitor failed deliveries, pending outbox age, and
worker health. Unsubscribe links are signed and require a stable secret; rotate
the secret only with a plan for previously sent links.

The Mac-hosted deployment includes a launchd template at
`infra/mac-bootstrap/launchd/com.portals.notifications.plist` and an environment
template at `infra/mac-bootstrap/templates/notifications.env.example`. Install
the launchd job only after the release, migrations, credentials, sender domain,
and signed webhook have been configured and verified; the template itself does
not start the worker.
