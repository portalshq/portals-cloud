# @portalshq/billing

Server-only Stripe platform billing for Portals. The package maps each channel to a Stripe Customer and a Stripe Connect account, creates destination-charge Checkout Sessions, processes signed webhooks transactionally, and emits durable settlement events through an injected outbox.

Applications provide authorization, catalog configuration, persistence, and URLs. They never provide authoritative prices, fees, or destination account ids from a browser.

Pass a stable application order id as `purchaseId` when creating a channel Checkout Session. Retrying that id returns the existing Stripe Checkout Session; reusing it for different purchase data is rejected.

Refund webhooks are applied as cumulative Stripe state and ledger only the new
delta. To recover owner funds after a dispute, provide
`reverseTransferForDispute`; an approved reversal uses the recorded Connect
transfer and a stable Stripe idempotency key. Webhook effects and outbox writes
commit in one `BillingStore` transaction.
