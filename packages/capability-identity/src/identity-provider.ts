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

/** Must validate the credential and return an active application user ID. */
export type VerifyAccessToken = (accessToken: string) => Promise<string>;

export class IdentityProvider {
  constructor(
    private readonly verifyAccessToken: VerifyAccessToken,
    private readonly store: IdentityStore,
  ) {}

  async getIdentity(accessToken: string): Promise<AudienceIdentity> {
    const userId = await this.verifyAccessToken(accessToken);
    const identity = await this.store.getIdentity(userId);
    if (!identity) throw new Error(INACTIVE_ACCOUNT_ERROR);
    return identity;
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
   * @param userId - The user ID to sync
   */
  async syncFromAuthGateway(userId: string): Promise<void> {
    // TODO: Implement auth-gateway gRPC client and sync logic
    // This requires:
    // 1. TypeScript gRPC client generated from proto files
    // 2. Call GetUserInfo to fetch user data from auth-gateway
    // 3. Update local store with fetched data
    console.warn("[identity] syncFromAuthGateway not yet implemented - requires auth-gateway gRPC client");
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
   * @returns true if the key exists in the central database, false otherwise
   */
  async validateSoftKey(table: string, key: string): Promise<boolean> {
    // TODO: Implement soft key validation
    // This requires:
    // 1. Connection to central database
    // 2. Query to check if key exists in specified table
    // 3. Return boolean result
    console.warn("[identity] validateSoftKey not yet implemented - requires central database connection");
    return false;
  }
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
