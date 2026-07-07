/**
 * Tenant trust and resource quotas.
 *
 * At a few dozen developers, manually reviewing each one before granting
 * access is a reasonable process. At 100,000 tenants, "manual review" isn't
 * a process -- it's a queue that never empties. `standard` is the only
 * tier a new signup can reach with no human in the loop. Everything more
 * privileged is an explicit, optional upgrade; everything less privileged
 * is an automated demotion (a quota/abuse signal), not a ban.
 */

export type TrustLevel = "platform" | "reviewed" | "standard" | "restricted";

export interface ResourceQuota {
  maxConcurrentExecutions: number;
  maxExecutionDurationMs: number;
  maxMemoryMb: number;
  /** Rolling 30-day compute budget. The metering/enforcement hook lives in
   *  the execution plane (Lambda/Fargate reservations, billing alarms) --
   *  this is just the declared ceiling a tenant is told about. */
  maxMonthlyComputeMs: number;
}

export interface TenantContext {
  tenantId: string;
  trustLevel: TrustLevel;
  quota: ResourceQuota;
}

/**
 * Starting points to tune against real usage, not load-bearing numbers.
 * The point being enforced is structural: every tier has an explicit,
 * finite ceiling -- including `platform`, which should get a real quota
 * before this goes to production rather than staying "unlimited."
 */
export const DEFAULT_QUOTAS: Record<TrustLevel, ResourceQuota> = {
  platform: {
    maxConcurrentExecutions: 10_000,
    maxExecutionDurationMs: 15 * 60_000,
    maxMemoryMb: 3008,
    maxMonthlyComputeMs: Number.MAX_SAFE_INTEGER,
  },
  reviewed: {
    maxConcurrentExecutions: 200,
    maxExecutionDurationMs: 60_000,
    maxMemoryMb: 1024,
    maxMonthlyComputeMs: 50 * 60 * 60_000, // 50 compute-hours / month
  },
  standard: {
    maxConcurrentExecutions: 10,
    maxExecutionDurationMs: 10_000,
    maxMemoryMb: 256,
    maxMonthlyComputeMs: 2 * 60 * 60_000, // 2 compute-hours / month
  },
  restricted: {
    maxConcurrentExecutions: 1,
    maxExecutionDurationMs: 5_000,
    maxMemoryMb: 128,
    maxMonthlyComputeMs: 10 * 60_000, // 10 compute-minutes / month
  },
};

/**
 * Every new tenant starts here, automatically, with no human in the loop --
 * this is what makes 100,000 tenants onboardable at all. Upgrades to
 * `reviewed` or `platform` are explicit, out-of-band actions (an admin
 * decision, or an automated reputation system built later); downgrades to
 * `restricted` are an automated response to abuse/quota-violation signals,
 * also built later. This function only governs the Day 0 default.
 */
export function assignInitialTrust(tenantId: string): TenantContext {
  return {
    tenantId,
    trustLevel: "standard",
    quota: DEFAULT_QUOTAS.standard,
  };
}
