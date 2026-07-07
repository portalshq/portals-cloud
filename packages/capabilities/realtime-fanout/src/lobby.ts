import { FanoutBus } from "./fanout-bus";

/** Pre-session/in-session audience controls: capacity, entry gating, host actions. */
export interface LobbyState {
  sessionId: string;
  capacity: number;
  currentCount: number;
  status: "waiting" | "open" | "closed";
}

export class Lobby {
  constructor(private bus: FanoutBus) {}

  async setStatus(sessionId: string, status: LobbyState["status"]): Promise<void> {
    await this.bus.publish(`lobby:${sessionId}:status`, { sessionId, status });
  }

  async onStateChange(sessionId: string, handler: (s: LobbyState) => void): Promise<() => void> {
    return this.bus.subscribe(`lobby:${sessionId}:status`, handler as (s: unknown) => void);
  }
}
