import { createWebVtt, normalizeCaptionTracks, type CaptionTrack } from "./captions.js";
import type { HlsPlaybackSession } from "./live-session.js";

export * from "./live-captions.js";

export interface MountedCaptionTracks {
  /** The exact native elements added to the player. */
  readonly elements: readonly HTMLTrackElement[];
  /** Removes only the tracks added by this mount operation. */
  remove(): void;
}

/**
 * Adds sidecar captions to a browser media element. This deliberately uses
 * native HTML track rendering, so captions stay selectable and never become
 * part of the encoded HLS stream.
 */
export function mountCaptionTracks(
  player: HTMLMediaElement,
  tracks: readonly CaptionTrack[],
): MountedCaptionTracks {
  const normalizedTracks = normalizeCaptionTracks(tracks);
  const document = player.ownerDocument;
  if (!document) throw new TypeError("player must belong to a document");
  const objectUrls: string[] = [];
  let removed = false;

  const elements = normalizedTracks.map((caption) => {
    const element = document.createElement("track");
    element.setAttribute("data-video-delivery-caption", caption.id);
    element.kind = caption.kind ?? "captions";
    if (caption.src !== undefined) {
      element.src = caption.src;
    } else {
      const objectUrl = URL.createObjectURL(new Blob([createWebVtt(caption.cues)], { type: "text/vtt" }));
      objectUrls.push(objectUrl);
      element.src = objectUrl;
    }
    element.srclang = caption.language;
    element.label = caption.label;
    element.default = caption.default ?? false;
    player.append(element);
    return element;
  });

  return {
    elements,
    remove: () => {
      if (removed) return;
      removed = true;
      elements.forEach((element) => element.remove());
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    },
  };
}

/** Mounts every caption track declared by a `LiveDelivery` playback session. */
export function mountPlaybackCaptions(
  player: HTMLMediaElement,
  playback: Pick<HlsPlaybackSession, "captionTracks">,
): MountedCaptionTracks {
  return mountCaptionTracks(player, playback.captionTracks ?? []);
}
