import Stripe from "stripe";

export interface FindOrCreateCustomerInput {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

/** Shared Stripe-platform operations for non-channel B2B billing flows. */
export class StripePlatformBilling {
  constructor(private readonly stripe: Stripe) {}

  async findOrCreateCustomer(input: FindOrCreateCustomerInput): Promise<{ customer: Stripe.Customer; created: boolean }> {
    const email = input.email?.trim();
    if (email) {
      const existing = await this.stripe.customers.list({ email, limit: 1 });
      const customer = existing.data[0];
      if (customer) return { customer, created: false };
    }
    const customer = await this.stripe.customers.create({
      ...(email ? { email } : {}),
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      metadata: input.metadata ?? {},
    });
    return { customer, created: true };
  }

  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    request?: string | Stripe.RequestOptions,
  ): Promise<Stripe.Checkout.Session> {
    const options = typeof request === "string" ? { idempotencyKey: request } : request;
    return this.stripe.checkout.sessions.create(params, options);
  }

  createCustomerPortalSession(params: Stripe.BillingPortal.SessionCreateParams): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create(params);
  }

  constructWebhookEvent(rawBody: string | Buffer, signature: string, secret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}

export function createStripePlatformBilling(secretKey: string): StripePlatformBilling {
  return new StripePlatformBilling(createStripePlatformClient(secretKey));
}

export function createStripePlatformClient(secretKey: string): Stripe {
  const normalized = secretKey.trim();
  if (!normalized) throw new TypeError("Stripe secret key is required");
  return new Stripe(normalized);
}
