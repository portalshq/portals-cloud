/**
 * Content delivery and content rating.
 *
 * `rating` is required, not optional, on every ContentDescriptor --
 * enforced at the type level so a ContentDeliveryAdapter implementation
 * cannot compile without producing one. This is the engineering side of
 * "general audience, possibly including minors": the platform should be
 * structurally incapable of serving unrated content, not just discouraged
 * from it.
 *
 * This is NOT legal guidance. Actual age-verification, parental-consent,
 * and regulatory requirements (COPPA and equivalents) need real legal
 * review -- this only guarantees a rating can't be silently absent.
 */

import type { CapabilityContext } from "./capabilities.js";

export type AgeRating = "all-ages" | "teen" | "mature" | "unrated";

export interface ContentRating {
  rating: AgeRating;
  /** Platform-defined vocabulary, not free text, so parental-control
   *  filters can match reliably -- e.g. "violence", "language". */
  descriptors?: string[];
  /** Self-rated by the creator, or confirmed by platform review. A
   *  parental-control profile should be able to require "platform-reviewed"
   *  specifically, not just any declared rating. */
  source: "creator-declared" | "platform-reviewed";
}

/**
 * The seam between "what a channel produces" and "how a viewer receives
 * it." Text+image, video, and VR are all ContentDeliveryAdapters -- the
 * platform core never special-cases any one medium. `describe` returns a
 * generic envelope; it's deliberately NOT "render" -- this layer doesn't
 * assume a server-side rendering model, just a typed payload + media
 * references the client interprets per `contentType`.
 */
export interface ContentDescriptor {
  contentType: string;
  payload: unknown;
  mediaRefs?: string[];
  rating: ContentRating;
}

export interface ContentDeliveryAdapter<TContent = unknown, TConfig = unknown> {
  contentType: string;
  describe(ctx: CapabilityContext<TConfig>, content: TContent): Promise<ContentDescriptor>;
}
