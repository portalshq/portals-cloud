/**
 * Live broadcast delivery. Origin -> Akamai edge -> audience. This package
 * intentionally exposes only session lifecycle + manifest URL — codec,
 * bitrate ladder, and origin packaging are implementation details that can
 * change without breaking any channel that consumes this capability.
 */
export interface LiveSessionHandle {
  sessionId: string;
  ingestUrl: string;     // where the broadcaster pushes
  playbackManifestUrl: string; // HLS/LL-HLS manifest served from Akamai edge
}

export class LiveDelivery {
  async start(sessionId: string): Promise<LiveSessionHandle> {
    throw new Error("LiveDelivery.start: not yet wired to origin/Akamai config");
  }
  async stop(sessionId: string): Promise<void> {
    throw new Error("LiveDelivery.stop: not yet implemented");
  }
}
