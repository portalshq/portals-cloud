/** A token-free HLS source that an application can hand to its player. */
export interface HlsPlaybackSession {
  sessionId: string;
  playbackManifestUrl: string;
}

/**
 * Live broadcast delivery. Origin -> edge -> audience. Origin packaging is
 * intentionally separate from playback so the same player can consume a
 * queue-broadcast origin, an external platform, or a future CDN origin.
 */
export interface LiveSessionHandle extends HlsPlaybackSession {
  ingestUrl: string; // where a traditional live broadcaster pushes
}

export class LiveDelivery {
  async start(sessionId: string): Promise<LiveSessionHandle> {
    throw new Error("LiveDelivery.start: not yet wired to origin/Akamai config");
  }
  async stop(sessionId: string): Promise<void> {
    throw new Error("LiveDelivery.stop: not yet implemented");
  }
}
