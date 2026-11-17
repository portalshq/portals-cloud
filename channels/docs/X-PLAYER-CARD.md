# Share a program on X

A program room link (`/<slug>`) posted on X renders as a Player Card: the room
plays inside the post. Nothing needs to be configured. Every app channel with a
poster gets the card, including links copied with the room's Share button.

## How it works

- **Share page: `/<slug>`.** The room page adds `twitter:card=player`,
  `twitter:player` (480×480), `twitter:image` (the app poster), and Open Graph
  tags. Its title and description stay as they are, and channels without an app
  or poster get no extra tags. Absolute URLs use the request's public host
  (`x-forwarded-host`/`host`, `x-forwarded-proto`). `lib/x-card.ts` throws on a
  host that is not a bare http(s) host.
- **Player: `/embed/<slug>`.** This is the same room through
  `ChannelsExperience embed`, with noindex set. The Rail keeps Follow and sound.
  It drops Back, Browse, and the account menu, and the `channels` label links
  to the full room in a new tab. The player URL carries
  `utm_source=x&utm_medium=player_card&utm_campaign=<slug>`, which the
  program's reminder signup records. The route returns 404 for channels that
  are not program apps.
- **Framing.** Only `/embed/:slug` sends
  `Content-Security-Policy: frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com`
  (`next.config.ts`). Always embed through Channels; standalone Bears sends
  `X-Frame-Options: DENY`.
- **Sign-in handoff (embed only).** Sign-in can't complete inside X's frame,
  so in embed mode the Rail answers `channels:open-account` (for example a
  signed-out Follow) by opening `/<slug>`. When framed it opens a new tab; when
  top-level (X's in-app browser on mobile) it uses the same tab. Normal rooms
  keep the in-page account dialog.

## Known limits

- **Forms are blocked in the desktop card.** X's reported iframe sandbox is
  `allow-scripts allow-same-origin allow-popups allow-presentation`, with no
  `allow-forms`. Under it, Chromium blocks `<form>` submissions ("Blocked form
  submission … 'allow-forms' permission is not set"), which covers program
  reminder signup, chat, and guides. The Rail's Follow button and sound use
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
