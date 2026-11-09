import type { AuthGatewayClient } from "./auth-gateway-client.js";
import { guestActorIdFromHeaders } from "./guest-token.js";
import type { QueryRunner } from "./postgres-store.js";

/**
 * One identity per audience member, scoped to read across every channel
 * they've ever touched. This is the "Netflix history, but spanning every
 * developer-built channel" requirement — without this capability, every
 * channel re-implements its own login and the cross-channel marketplace
 * vision doesn't work.
 */
export interface AudienceIdentity {
  userId: string;
  displayName: string;
  email?: string;
  preferences?: Record<string, unknown>;
}

/** Soft cross-database key; the matching channel row may live elsewhere. */
export interface ChannelInteraction {
  channelId: string;
  sessionId: string;
}

export interface ChannelHistoryEntry extends ChannelInteraction {
  lastInteractionAt: string;
  metadata?: Record<string, unknown>;
}

/** Matches the identifier bounds in the platform migration. */
export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_HISTORY_ENTRIES = 500;
export const DEFAULT_HISTORY_ENTRIES = 100;

export const INACTIVE_ACCOUNT_ERROR =
  "The verified user is not linked to an active application account.";

export interface IdentityStore {
  getIdentity(userId: string): Promise<AudienceIdentity | undefined>;
  recordInteraction(userId: string, interaction: ChannelInteraction): Promise<void>;
  getHistory(userId: string, limit: number): Promise<readonly ChannelHistoryEntry[]>;
}

export interface SyncableIdentityStore extends IdentityStore {
  syncFromAuthGateway(userId: string, displayName: string): Promise<void>;
}

/** Must validate the credential and return its verified subject ID. */
export type VerifyAccessToken = (accessToken: string) => Promise<string>;

/** The actor behind a request: a verified Portals user or a signed guest. */
export type ResolvedActor =
  | { type: "user"; userId: string; displayName: string }
  | { type: "guest"; actorId: string };

export interface IdentityProviderOptions {
  /** When set, `resolveActor` also accepts HMAC-signed `X-Guest-Token`
   *  guest credentials — guest trials are opt-in per application. */
  guestTokenSecret?: string;
}

/** Minimal header surface `resolveActor` reads. */
export interface ActorRequestHeaders {
  authorization?: string | string[];
  "x-guest-token"?: string | string[];
}

export class IdentityProvider {
  constructor(
    private readonly verifyAccessToken: VerifyAccessToken,
    private readonly store: IdentityStore,
    private readonly options: IdentityProviderOptions = {},
  ) {}

  async getIdentity(accessToken: string): Promise<AudienceIdentity> {
    const userId = await this.verifyAccessToken(accessToken);
    const identity = await this.store.getIdentity(userId);
    if (!identity) throw new Error(INACTIVE_ACCOUNT_ERROR);
    return identity;
  }

  /**
   * Resolve the actor behind a request in one call: a verified `Bearer`
   * credential yields `{type:"user"}`; failing that, a signed `X-Guest-Token`
   * yields `{type:"guest"}` when `guestTokenSecret` is configured; otherwise
   * `null`. An invalid or expired Bearer falls through to the guest check —
   * the same catch-all the channel apps applied per-route, centralized here.
   */
  async resolveActor(headers: ActorRequestHeaders): Promise<ResolvedActor | null> {
    const bearer = bearerCredential(headers.authorization);
    if (bearer) {
      try {
        const identity = await this.getIdentity(bearer);
        return { type: "user", userId: identity.userId, displayName: identity.displayName };
      } catch {
        // Fall through: a bad user credential does not preclude a valid guest token.
      }
    }
    const guestActorId = guestActorIdFromHeaders(headers, this.options.guestTokenSecret);
    return guestActorId ? { type: "guest", actorId: guestActorId } : null;
  }

  /** Interaction time is the storage transaction's clock, never the caller's. */
  async recordInteraction(accessToken: string, interaction: ChannelInteraction): Promise<void> {
    assertIdentifier(interaction.channelId, "channelId");
    assertIdentifier(interaction.sessionId, "sessionId");
    const identity = await this.getIdentity(accessToken);
    await this.store.recordInteraction(identity.userId, interaction);
  }

  async getHistory(
    accessToken: string,
    limit: number = DEFAULT_HISTORY_ENTRIES,
  ): Promise<readonly ChannelHistoryEntry[]> {
    const identity = await this.getIdentity(accessToken);
    return this.store.getHistory(identity.userId, historyLimit(limit));
  }

  /**
   * On-demand sync from auth-gateway.
   *
   * Explicitly call this to sync user data from auth-gateway to the local store.
   * This is not called automatically on every request to avoid unnecessary network calls.
   *
   * Note: Auth-gateway UserInfo only contains user_id and display_name.
   * Email and preferences are not available from auth-gateway and must be managed
   * by the application itself.
   *
   * @param userId - The user ID to sync
   * @param authGatewayClient - Auth-gateway gRPC client
   * @param resourceId - The resource ID (application identifier)
   */
  async syncFromAuthGateway(
    userId: string,
    authGatewayClient: Pick<AuthGatewayClient, "getUserInfo">,
    resourceId: string,
  ): Promise<void> {
    assertIdentifier(userId, "userId");
    assertIdentifier(resourceId, "resourceId");
    if (!("syncFromAuthGateway" in this.store) || typeof this.store.syncFromAuthGateway !== "function") {
      throw new Error("Identity store does not support auth-gateway sync.");
    }
    const userInfo = await authGatewayClient.getUserInfo(resourceId, userId);
    if (userInfo.userId !== userId || typeof userInfo.displayName !== "string") {
      throw new Error("Auth-gateway returned an invalid or mismatched identity.");
    }
    await this.store.syncFromAuthGateway(userId, userInfo.displayName);
  }

  /**
   * Validate a soft key reference to a central database table.
   *
   * Used to validate cross-database references when databases are separate instances.
   * This is an application-level validation because PostgreSQL foreign keys don't
   * work across database instances.
   *
   * @param table - The table name to validate against (e.g., "users")
   * @param key - The key value to validate (e.g., user ID)
   * @param centralPool - PostgreSQL pool for central database connection
   * @returns true if the key exists in the central database, false otherwise
   */
  async validateSoftKey(
    table: string,
    key: string,
    centralPool: QueryRunner,
  ): Promise<boolean> {
    // Validate table name to prevent SQL injection
    const allowedTables = ["users", "channel_apps", "channel_schedules"];
    if (!allowedTables.includes(table)) {
      throw new Error(`Invalid table name for soft key validation: ${table}`);
    }

    try {
      const result = await centralPool.query(
        `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,
        [key],
      );
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error(`[identity] Failed to validate soft key in table ${table}:`, error);
      return false;
    }
  }
}

function bearerCredential(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const match = typeof value === "string" ? /^Bearer (.+)$/.exec(value.trim()) : null;
  return match?.[1]?.trim() || null;
}

function assertIdentifier(value: string, field: string): void {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_IDENTIFIER_LENGTH) {
    throw new TypeError(`${field} must be 1-${MAX_IDENTIFIER_LENGTH} characters.`);
  }
}

function historyLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("History limit must be a positive integer.");
  return Math.min(limit, MAX_HISTORY_ENTRIES);
}
