import type { Request, Response, NextFunction } from "express";

/**
 * Anything that can answer "what's live right now, in priority order" can
 * back the redirect. Today there's at most one live channel, so order is
 * moot -- but this is deliberately the same shape a future ranked feed
 * (the "scroll between channels" experience) would implement, so wiring
 * that in later doesn't require touching this middleware at all.
 */
export interface LiveChannelRegistry {
  /** Live channel ids, most-preferred first. Empty array if nothing is live. */
  listLive(): string[];
}

/**
 * Minimal in-memory implementation of LiveChannelRegistry. Intended to be
 * driven directly by your RealtimeEngine's onActivate/onTick/onDeactivate
 * callbacks (markLive when a session starts, markEnded when it ends) --
 * see the integration guide. Swappable later for a ranked-feed
 * implementation without changing any caller.
 */
export class InMemoryLiveChannelRegistry implements LiveChannelRegistry {
  private live = new Set<string>();

  markLive(channelId: string): void {
    this.live.add(channelId);
  }

  markEnded(channelId: string): void {
    this.live.delete(channelId);
  }

  listLive(): string[] {
    return [...this.live];
  }
}

export interface InstantRedirectOptions {
  registry: LiveChannelRegistry;
  /** Default: (id) => `/channel/${id}` */
  channelPath?: (channelId: string) => string;
  /** Default: "/upcoming" */
  fallbackPath?: string;
  /** Which incoming path triggers the redirect check. Default "/" */
  matchPath?: string;
}

/**
 * Express middleware that redirects GET "/" straight to a live channel
 * (or "/upcoming" if nothing's live) using only an in-memory lookup --
 * no DB query, no client JS needs to run first. Mount this BEFORE your
 * static/SPA-catch-all handlers.
 */
export function createInstantRedirectMiddleware(opts: InstantRedirectOptions) {
  const channelPath = opts.channelPath ?? ((id: string) => `/channel/${id}`);
  const fallbackPath = opts.fallbackPath ?? "/upcoming";
  const matchPath = opts.matchPath ?? "/";

  return function instantRedirect(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== "GET" || req.path !== matchPath) {
      next();
      return;
    }

    const [preferredChannelId] = opts.registry.listLive();
    const destination = preferredChannelId ? channelPath(preferredChannelId) : fallbackPath;
    res.redirect(302, destination);
  };
}
