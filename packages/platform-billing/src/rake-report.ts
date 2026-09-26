import { calculateRake, type TransactionType } from "@portalshq/policy";

/**
 * Rake reporting for the tenant-invoicing side.
 *
 * A tenant's marketplace gross volume is not something the tenant is billed for
 * — it is the basis on which the platform earns rake. This reports what the
 * platform earned from a tenant, using the same rate table the payout side
 * charges, so the two can never disagree about a rate.
 *
 * `platform-billing` depends on `@portalshq/policy` for this reason. It does not
 * settle payments; `@portalshq/monetization` does.
 */

export interface TenantRakeReport {
  tenantId: string;
  grossAmountCents: number;
  platformRakeCents: number;
  platformNetCents: number;
  providerNetCents: number;
  stripeFeeCents: number;
  platformRakeRate: number;
}

export function reportTenantRake(
  tenantId: string,
  grossAmountCents: number,
  type: TransactionType,
  currency = "usd",
): TenantRakeReport {
  if (!Number.isInteger(grossAmountCents) || grossAmountCents < 0) {
    throw new TypeError("grossAmountCents must be a non-negative integer");
  }
  const result = calculateRake(grossAmountCents, type, currency);
  return { tenantId, ...result };
}
