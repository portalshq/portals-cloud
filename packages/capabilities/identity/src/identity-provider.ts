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
}

export interface ChannelHistoryEntry {
  channelId: string;
  sessionId: string;
  lastInteractionAt: string;
}

export class IdentityProvider {
  async getIdentity(userId: string): Promise<AudienceIdentity> {
    throw new Error("IdentityProvider.getIdentity: not yet implemented");
  }
  async recordInteraction(entry: ChannelHistoryEntry): Promise<void> {
    throw new Error("IdentityProvider.recordInteraction: not yet implemented");
  }
  async getHistory(userId: string): Promise<ChannelHistoryEntry[]> {
    throw new Error("IdentityProvider.getHistory: not yet implemented");
  }
}
