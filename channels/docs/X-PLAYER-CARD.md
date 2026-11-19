# Share a program on X

A program room link (`/<slug>`) posted on X renders as a Player Card: the room
plays inside the post on supported X clients. Registered program apps get a
card, including links copied with the room's Share button. A public viewer-group
link (`/g/<code>`) gets a stable card whose player follows the group's current
program instead of baking one program into the post.

## How it works

- **Share page: `/<slug>`.** The room page adds `twitter:card=player`,
  `twitter:player` (480×480), `twitter:image` (the app poster), and Open Graph
  tags. Its title and description stay as they are. Apps without a poster
  use the Channels fallback image. Absolute URLs use the request's public host
  (`x-forwarded-host`/`host`, `x-forwarded-proto`). `lib/x-card.ts` throws on a
  host that is not a bare http(s) host.
- **Player: `/embed/<slug>`.** This is the same room through
  `ChannelsExperience` in embed mode, with noindex set. The Rail keeps Follow and sound.
  It drops Back, Browse, and the account menu, and the `channels` label links
  to the full room in a new tab. The player URL carries
  `utm_source=x&utm_medium=player_card&utm_campaign=<slug>`, which the
  program's reminder signup records. The route returns 404 for channels that
  are not program apps.
- **Framing.** `/embed/:slug` and `/embed/g/:code` send
  `Content-Security-Policy: frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com`
  (`proxy.ts`). Only `/embed/:slug?variant=preview` adds configured partner
  origins. Always embed through Channels; standalone Bears sends
  `X-Frame-Options: DENY`.
- **Sign-in (embed only).** A framed player opens hosted sign-in in a separate
  tab or window and polls for completion. If sign-in cannot start, the full
  room is the fallback. When the player itself is top-level, sign-in uses the
  full room in the same tab. Normal rooms keep the in-page account dialog.
- **Conversation.** Full program and group cards use the same program-scoped
  public chat as the standalone app and Channels room. Preview embeds show only
  a bounded read-only tail. An already-authorized group member also gets the
  Group/Public selector after signing in; the public watch link never grants
  membership.

## Known limits

- **Forms are blocked in the desktop card.** X's reported iframe sandbox is
  `allow-scripts allow-same-origin allow-popups allow-presentation`, with no
  `allow-forms`. Under it, Chromium blocks `<form>` submissions ("Blocked form
  submission … 'allow-forms' permission is not set"), which can affect program
  reminder signup and guides. Chat uses a button rather than native form submission.
  The Rail's Follow button and sound use
  plain buttons and work. On mobile, X opens the player in its in-app browser
  without a sandbox, so everything works there. Confirm the live sandbox
  attribute on a test post before changing program forms.
- **The card is a 480×480 frame, and X may scale it down.** Program layouts
  should be checked at 480 and 320 px.
- **X caches card metadata on first share.** Append `?v=2` (or any new query)
  to re-test.
- **Card art.** `twitter:image` uses the app poster. Square art (≥ 675×675)
  avoids cropping.

## Test

1. Locally, frame `/embed/<slug>` from a page on the Channels origin with
   `sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"`
   at 480×480 and 320×320. A different local origin is refused by
   `frame-ancestors`, as intended.
2. Deployed:
   - `curl -s https://<host>/<slug> | grep -E 'twitter:|og:'` lists the tags.
   - `curl -sI https://<host>/embed/<slug>` shows `frame-ancestors` and no
     `X-Frame-Options`.
3. Post from a protected test account. Check desktop web, iOS, and Android,
   and inspect the iframe's `sandbox`/`allow` attributes.

## Watch parties in X Spaces

This puts Channels inside the X Space experience; it does not put Space audio
inside Channels. X documents that a host, co-host, or speaker can use a post's
share menu to **Share to Space**, and that hosts or speakers can pin a post at
the top of a Space: [How to host an X Space](https://help.x.com/en/using-x/spaces-hosting).
Neither action requires the X developer API.

1. Start a group from a program room after signing in. The owner can tune the
   group to a station or directly to a program. A station follows its current
   scheduled slot, then shows the next session during a gap.
2. Under **Invite**, copy the group watch link or share it in a post on X.
   Within the Space, use the post's X-native **Share to Space** control and pin
   it when that control is available to the host.
3. The watch link opens the current program directly at `/g/<code>`. The
   Player Card uses `/embed/g/<code>` and follows the same tuning without a
   new post. Viewers can watch without signing in. The host issues a separate
   membership link for private group chat; joining requires verified sign-in.
4. X remains the audio host. The group card starts with its stage muted and
   selects the first program caption track when the source provides one. A viewer
   may opt into stage sound; Channels never starts it automatically in the
   group card.
5. Before rollout, verify that each target X client opens the card inline and
   retains Space audio through a station transition, including desktop web,
   iOS, and Android. X's help page establishes the post-sharing and pinning
   workflow, not inline Player Card playback or mobile audio-focus behavior.
   When X chooses not to render the card inline, the watch link still opens the
   current program. Do not claim uninterrupted Space audio until this matrix
   passes against a real test post.

Channels does not use the X API, scrape Space state, discover active Spaces, or
import Space audio. The group tuning endpoint is a cacheable public snapshot,
so a large Space audience follows one pointer without creating group membership
or exposing the private thread.

Reverse discovery, such as showing an active Space link on Channels, is a
possible future feature and is not implemented here.
