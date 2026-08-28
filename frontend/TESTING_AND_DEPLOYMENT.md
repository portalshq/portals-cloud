# Pilot room — testing and deployment configuration

This file covers the paid-pilot approval room, magic-link application accounts, the Stripe Checkout payment path, and the configuration needed to test and deploy them. The general intake stack (database, Apollo, Resend, Mixpanel, outbox) is documented in `LEAD_OPERATIONS.md`.

The pilot flow is: pilot form → `/paid-pilot/room/[id]` approval room → confirm scope → finalize → sign → Stripe Checkout → webhook marks `paid` → kickoff → activate. The one-call route requires a pilot terms review (`exception_review` → `resolve_exceptions`) before `finalize` is allowed.

## Environment variables

Everything below is already listed in `.env.example`.

### Required in every non-dry-run environment

| Variable | Purpose |
| --- | --- |
| `LEADS_DATABASE_URL` | PostgreSQL for `lead_pilots` and the outbox |
| `LEADS_HASH_KEY` | HMAC for profile cookies, rate limiting, internal auth |
| `LEADS_ENCRYPTION_KEY` | base64 32-byte AES key for encrypted answers |
| `LEADS_EMAIL_FROM`, `RESEND_API_KEY` | transactional email delivery |
| `LEADS_NOTIFICATION_EMAIL` | Portals-team review notifications and approval-room access |
| `APOLLO_API_KEY` | Master API key for Apollo list, custom-field, contact, account, and deal access. Field and deal-stage IDs are discovered automatically from the Apollo schema. |
| `APOLLO_CALLBACK_SECRET` | HMAC secret for signed Apollo workflow callbacks |
| `PILOT_PRICE_AMOUNT` | fallback fee in USD when the proposal has no price |
| `PILOT_CALENDAR_URL` | kickoff / pilot-terms-review scheduling link |
| `NEXT_PUBLIC_SITE_URL` | base for room, email, and Checkout success/cancel URLs |
| `STRIPE_SECRET_KEY` | `sk_test_…` locally and on staging, `sk_live_…` in production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the Stripe CLI or dashboard |
| `CRON_SECRET` | bearer auth for the outbox retry route |

Each exception-review request creates a high-priority Apollo task. It is assigned to the contact owner when one exists; otherwise, it is assigned to a randomly selected active Apollo user.

### Local development only

- `LEADS_DRY_RUN=true` is the supported no-integration mode: submissions, pilots, and payments are simulated in memory, nothing external is contacted, and responses are labeled as dry runs. In dry-run mode the checkout route records `payment.simulated = true` with a `sim_…` session id and moves the pilot to `paid` immediately; the webhook route no-ops.
- To test real emails locally with a personal inbox, set both `LEADS_ALLOW_PERSONAL_EMAILS_FOR_DEV=true` and `NEXT_PUBLIC_ALLOW_PERSONAL_EMAILS_FOR_DEV=true`. These flags work only under `next dev`; they permit Gmail/Googlemail and Outlook/Hotmail/Live addresses, while every other public or disposable provider remains blocked. A company website is still required so the usual Apollo account and deal path is exercised.
- `NEXT_ALLOWED_DEV_ORIGINS` for local-network hostnames; `LEADS_ALLOWED_ORIGINS` for explicit preview origins.
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so email and Checkout URLs point at the local server.

## Local testing

### 1. Unit and document tests

```sh
npm --workspace frontend run test:leads
npm --workspace frontend run typecheck
npm --workspace frontend run build
```

The URL parameter system includes comprehensive tests in `frontend/src/lib/leads/url-params.test.ts` and `frontend/src/lib/leads/build-url.test.ts`. These tests cover:
- URL parameter parsing and validation
- Enum normalization (lowercasing)
- Email domain validation
- Fallback defaults
- Field hiding logic
- URL building and encoding
- UTM parameter handling
- Error handling for malformed or invalid parameters

Run URL parameter tests specifically:
```sh
npx tsx --test src/lib/leads/url-params.test.ts src/lib/leads/build-url.test.ts
```

### Testing URL parameters locally

To test URL parameter auto-population:

1. Start the dev server:
```sh
npm --workspace frontend run dev
```

2. Navigate to a form with URL parameters:
```
http://localhost:3000/workflow/assessment?how_did_you_hear=linkedin&what_brought_you=workflow-problem&utm_source=linkedin&utm_medium=social
```

3. Verify:
- Fields are pre-filled with URL values
- Critical fields (email, company, role) remain visible
- Non-critical fields (howDidYouHearAboutPortals, whatBroughtYouHere) are hidden when pre-filled
- UTM parameters are captured in analytics
- Fallback defaults apply when parameters are missing

4. Test persistence across navigation:
- Land on a blog post with URL parameters
- Navigate to the assessment form
- Verify parameters persist via localStorage

5. Test error cases:
- Invalid enum values (should be ignored)
- Malformed emails (should be rejected)
- Overly long values (should be truncated)
- Missing parameters (should use fallbacks)

### 2. Real local end-to-end

1. Provision a local PostgreSQL and run `npm --workspace frontend run migrate:leads`.
2. Set the required variables from the table above: a local database, Apollo credentials, a Resend API key and `LEADS_EMAIL_FROM` value from a verified Resend sender, and Stripe **test** keys. Set `LEADS_DRY_RUN=false`. For a real-inbox personal-email run, also enable both development personal-email flags above and use a unique test company plus a non-production website/domain you control so the resulting Apollo records are easy to find and remove. Open the email on the same machine as the app, or first expose the app through an approved tunnel and set `NEXT_PUBLIC_SITE_URL` to that tunnel URL.
3. Start the Stripe CLI webhook forwarder in a separate terminal:
   ```sh
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the printed `whsec_…` value into `STRIPE_WEBHOOK_SECRET`.
4. Walk the funnel once per route:
   - zero-call: submit `/paid-pilot` → room → confirm scope → finalize → sign → pay → `stripe trigger checkout.session.completed` (or complete the hosted Checkout page with card `4242 4242 4242 4242`) → room flips to `paid` → kickoff → activate.
   - one-call: answers that raise an exception (custom integration, SSO, regulated data, >5 participants, …) → `request exception review` → `mark exceptions resolved` → confirm scope → finalize → sign → pay.
   - disqualified: no workflow / no owner / no approval path → `not_eligible` room with the revise CTA.
5. Open the room link from the confirmation email in a different browser or device; it must request a one-time magic-link sign-in and then grant only the invited account and pilot membership. Use personal aliases such as `you+owner@gmail.com` and `you+buyer@gmail.com` for distinct reviewers, or the same exact address for two reviewer roles to confirm only one invitation is delivered. Confirm the packet download works after that session is established.
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
3. Confirm the daily cron in `vercel.json` (`0 0 * * *` → `/api/internal/leads/retry`) is enabled and that Vercel sends the `CRON_SECRET` bearer header; the route 401s without a matching hash. New room events also request an in-process outbox run, while the daily cron remains the durable retry path for the free Vercel plan.
4. Confirm the Sanity production dataset publishes the `paid-pilot` document and Studio price specs. The commercial snapshot synthesizes the $30,000 Studio annual option when specs are missing, but real specs should be preferred.
5. Sanity check the production config gate: `productionConfigurationError` in `app/api/leads/route.ts` responds 503 with the list of missing variables until the environment is complete.

## Post-deploy verification

- Submit a pilot on staging, complete a test-card payment through hosted Checkout, and confirm the webhook flips the room to `paid` and the `paid` status email is enqueued.
- Confirm the `ready_sign` and default packet emails link to the magic-link sign-in flow, never a bearer token in the URL.
- Confirm the internal retry endpoint processes any interrupted outbox rows (`lead_outbox.last_error` inspection and replay instructions are in `LEAD_OPERATIONS.md`).
- Confirm a second click on the pay button returns the existing Checkout session (idempotency key `pilot-checkout-<id>-<signedAt>`) instead of creating a duplicate charge.
