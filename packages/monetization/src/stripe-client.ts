import Stripe from "stripe";

/**
 * Minimal Stripe client factory.
 *
 * `platform-billing` carries its own equivalent for the platform B2B paths.
 * The duplication is deliberate: it is three validated lines, and sharing it
 * would force one of the two sibling packages to depend on the other.
 */
export function createStripePlatformClient(secretKey: string): Stripe {
  const normalized = secretKey.trim();
  if (!normalized) throw new TypeError("Stripe secret key is required");
  return new Stripe(normalized);
}
