# Pilot room — testing and deployment configuration

This file covers the paid-pilot approval room, the Stripe Checkout payment path, and the configuration needed to test and deploy them. The general intake stack (database, Attio, Resend, Mixpanel, Tally, outbox) is documented in `LEAD_OPERATIONS.md`.

The pilot flow is: pilot form → `/pilot/[id]` approval room → confirm scope → finalize → sign → Stripe Checkout → webhook marks `paid` → kickoff → activate. The one-call route requires a pilot terms review (`exception_review` → `resolve_exceptions`) before `finalize` is allowed.

## Environment variables

Everything below is already listed in `.env.example`.

### Required in every non-dry-run environment

| Variable | Purpose |
| --- | --- |
| `LEADS_DATABASE_URL` | PostgreSQL for `lead_pilots` and the outbox |
| `LEADS_HASH_KEY` | HMAC for profile cookies, rate limiting, internal auth |
| `LEADS_ENCRYPTION_KEY` | base64 32-byte AES key for encrypted answers |
| `LEADS_EMAIL_FROM`, `RESEND_API_KEY` | transactional email delivery |
| `LEADS_NOTIFICATION_EMAIL` | founder notifications |
| `PILOT_ROOM_SECRET` | HMAC secret for room links (`?t=` tokens). Missing in production → share/status emails and every room request fail closed |
| `PILOT_PRICE_AMOUNT` | fallback fee in USD when the proposal has no price |
| `PILOT_CALENDAR_URL` | kickoff / pilot-terms-review scheduling link |
| `NEXT_PUBLIC_SITE_URL` | base for room, email, and Checkout success/cancel URLs |
| `STRIPE_SECRET_KEY` | `sk_test_…` locally and on staging, `sk_live_…` in production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the Stripe CLI or dashboard |
| `CRON_SECRET` | bearer auth for the outbox retry route |

### Local development only

- `LEADS_DRY_RUN=true` is the supported no-integration mode: submissions, pilots, and payments are simulated in memory, nothing external is contacted, and responses are labeled as dry runs. In dry-run mode the checkout route records `payment.simulated = true` with a `sim_…` session id and moves the pilot to `paid` immediately; the webhook route no-ops.
- `NEXT_ALLOWED_DEV_ORIGINS` for local-network hostnames; `LEADS_ALLOWED_ORIGINS` for explicit preview origins.
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so email and Checkout URLs point at the local server.

## Local testing

### 1. Unit and document tests

```sh
LEADS_DRY_RUN=true node --import tsx --test src/lib/leads/*.test.ts   # 48 tests
npx tsc -p tsconfig.json --noEmit
npx next build
```

### 2. Real local end-to-end

1. Provision a local PostgreSQL and run `npm --workspace frontend run migrate:leads`.
2. Set the required variables from the table above, including Stripe **test** keys.
3. Start the Stripe CLI webhook forwarder in a separate terminal:
   ```sh
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the printed `whsec_…` value into `STRIPE_WEBHOOK_SECRET`.
4. Walk the funnel once per route:
   - zero-call: submit `/paid-pilot` → room → confirm scope → finalize → sign → pay → `stripe trigger checkout.session.completed` (or complete the hosted Checkout page with card `4242 4242 4242 4242`) → room flips to `paid` → kickoff → activate.
   - one-call: answers that raise an exception (custom integration, SSO, regulated data, >5 participants, …) → `request exception review` → `mark exceptions resolved` → confirm scope → finalize → sign → pay.
   - disqualified: no workflow / no owner / no approval path → `not_eligible` room with the revise CTA.
5. Open the PDF packet link from the confirmation email in a different browser or device; the tokenized `?t=` link must download the two-page plan ZIP without the profile cookie.
6. Complete a test payment and land back on the room URL carrying `session_id=…`; the room shows the processing banner and auto-refreshes (bounded to six attempts via `sessionStorage`) until the webhook lands.

### 3. Webhook checks

- `stripe trigger checkout.session.completed` with a session whose `payment_status` is not `paid` must **not** transition the pilot (the route guards on `payment_status === 'paid'`).
- Re-firing the same event is idempotent: `applyTransition(state, 'pay')` gates the second write, so no duplicate state change, history entry, or `paid` email.
- Retries: the checkout route persists `payment.sessionId` before returning the redirect, and the webhook looks the pilot up by `payment ->> 'sessionId'` before falling back to `metadata.pilotId`, so a retried event after an interrupted update still resolves.
- The manual `PATCH … {action: "pay"}` fallback remains available when Stripe is not configured.

## Deployment (Vercel)

1. Set every variable from the table above in production and staging environments. Use test keys on staging, live keys in production.
2. Stripe dashboard → Developers → Webhooks → **Add endpoint**:
   - URL: `https://portals.works/api/stripe/webhook`
   - Event: `checkout.session.completed`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET` (separate secret per environment).
3. Confirm the cron in `vercel.json` (`*/10 * * * *` → `/api/internal/leads/retry`) is enabled and that Vercel sends the `CRON_SECRET` bearer header; the route 401s without a matching hash.
4. Confirm the Sanity production dataset publishes the `paid-pilot` document and Studio price specs. The commercial snapshot synthesizes the $30,000 Studio annual option when specs are missing, but real specs should be preferred.
5. Sanity check the production config gate: `productionConfigurationError` in `app/api/leads/route.ts` responds 503 with the list of missing variables until the environment is complete.

## Post-deploy verification

- Submit a pilot on staging, complete a test-card payment through hosted Checkout, and confirm the webhook flips the room to `paid` and the `paid` status email is enqueued.
- Confirm the `ready_sign` and default packet emails include the tokenized `?t=` packet link and room link.
- Confirm the internal retry endpoint processes any interrupted outbox rows (`lead_outbox.last_error` inspection and replay instructions are in `LEAD_OPERATIONS.md`).
- Confirm a second click on the pay button returns the existing Checkout session (idempotency key `pilot-checkout-<id>-<signedAt>`) instead of creating a duplicate charge.
