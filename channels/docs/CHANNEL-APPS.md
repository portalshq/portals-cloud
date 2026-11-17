# Register a channel app

Channel app registrations are central database records. When an app publishes
`app_origin` on its central `programs` row — the 25th Chapter sync sets it
from `PORTALS_APP_ORIGIN` — the Channels registry mounts that app on every
channel the program is bound to. `app_origin` is the trusted backend origin
serving `/api/channel` and the app bundle. An optional `app_config` jsonb
column carries the same presentation fields `CHANNELS_APPS` accepts (`name`,
`by`, `theme`, `heading`, `backdrop`, `poster`, `publicAssets`); code-owned
per-slug defaults in `lib/channel-apps.ts` fill anything `app_config` omits.

`CHANNELS_APPS` remains as a local-server fallback. The JSON object
maps a channel slug to a trusted backend origin and optional presentation
settings. The slug is the room URL and the key used to merge central catalog
metadata. A central `app_origin` record always wins over a `CHANNELS_APPS`
entry for the same slug.

Program descriptions and taglines are stored on the central `programs` row,
not in `CHANNELS_APPS`. In Channels admin, use **Edit program details** and
select the intended program when a channel has multiple bindings. Empty fields
clear the corresponding copy. The feed and browse view read the selected
program; a compatible app may expose the same public fields from `/api/channel`
to keep its room and the active feed in sync. The preview includes only the
program id, description, and tagline, never the app's guest token or private data.
The existing room-page description metadata is unchanged.

```dotenv
CHANNELS_APPS='{"garden":{"origin":"https://garden.example","name":"Garden","backdrop":true,"poster":"images/garden.webp","publicAssets":["images/background.png"]}}'
```

`name` is the channel title used until the central catalog supplies a program
name. An optional `by` sets the owner/credit line independently of the title —
for example `"by":"Massively Social"` keeps "25th Chapter" as the title while
crediting the publisher. `by` falls back to `name`.

An optional `heading` object sets `fontFamily` and/or `fontWeight` for
the channel's feed title, browse card, and detail title. For example,
`"heading":{"fontFamily":"Georgia, serif","fontWeight":700}`. Each omitted
property keeps the default for that heading. Add `fontFile` with a relative WOFF or WOFF2 path served by the source app
to load a font on demand. Channels proxies that file through the same origin
and lets the browser cache it for seven days. Use a versioned filename when
changing a font. Bears serves its Baloo 2 file from the Bears backend.
Set `heading.fontUrl` to an absolute public HTTP(S) font URL to use it
directly. When both fields are set, the browser tries the proxy first and
the direct URL second. Use HTTPS for HTTPS Channels deployments and configure
the font server to allow cross-origin font requests from Channels. Direct
downloads follow the source server's cache headers. If neither source loads,
the browser uses the configured font family stack.

Embedded apps receive `--channel-heading-family` and
`--channel-heading-weight` on their mount element. The corresponding
`data-channel-heading-family` and `data-channel-heading-weight` attributes
indicate which overrides are set. Channels applies them to headings in
the page DOM. Apps with a shadow root can use the same values for heading
longhands in their own stylesheet, as Bears does.

Every program room mount element has `data-channel-program-theme` and
inherits Channels' current CSS custom properties by their existing names,
including `--color-surface`, `--color-fg`, and `--color-accent`. Both regular
DOM and shadow DOM content can read them. A shadow app that defines its own
standalone defaults on `:host` can inherit the shared names explicitly:

```css
:host([data-channel-program-theme]) {
  --color-surface: inherit;
  --color-fg: inherit;
}
```

Define standalone defaults for the program's own tokens. Channels defaults
to dark and uses its light palette when `data-theme="light"` is set on
`<html>`. Changes to the palette reach a mounted room through CSS inheritance.
An app may set `"theme":"light"` in `CHANNELS_APPS` to use the light palette
in its room. Bears defaults to light; set `"theme":"inherit"` on its entry to
follow the Channels theme instead.

A registered app provides the following interfaces:

- `/channel-app/watch.js` exports `mountChannel(host, viewer)`. Mount into
  the supplied element and return a cleanup function. The viewer provides
  `getSnapshot`, `subscribe`, `fetch`, and `requestSignIn` for the shared
  Channels session. Use `/api/channels/<slug>/...` for app API requests.
  The optional third argument provides room controls. Export
  `supportsRoomSound = true` and subscribe to `controls.sound` to let the
  rail mute or unmute the room. Apps can publish a balance and an optional
  invite action through `controls.onAccountChange` for the central account dialog.
- `/api/channel` returns `playback` and optionally
  `nextSession.startsAt`. Playback may be null, progressive video
  (`{kind:"video",url}`), HLS (`{playbackManifestUrl}`), or a Reactor
  descriptor (`{kind:"reactor"}`). The public preview returns only playback
  and scheduling fields. A null playback marks the channel off-air: its feed
  panel carries the program's off-air content — title, off-air line, and the
  next-session card with the follow action — instead of a preview, and the
  room URL hands off to that panel until playback returns.
- If `backdrop` is true, `/channel-app/backdrop.js` exports
  `mountBackdrop(host)` and returns a cleanup function. The optional
  `poster` and `publicAssets` paths are served by the app at its root and
  proxied under `/channel-apps/<slug>/public/`.

Channels proxies the app's bundle and compiled assets under
`/channel-apps/<slug>/`. The audience proxy forwards the shared public
channel API routes, including chat and interaction streams, and rejects
unknown slugs and privileged routes. The registry is server configuration.
Register only apps you trust to execute JavaScript on the Channels origin.

`BEARS_API_BASE_URL` still registers the existing Bears defaults. A
`CHANNELS_APPS` entry for `bears` overrides those settings. The `25th-chapter`
slug likewise merges built-in defaults — the 25th Chapter title, "Massively
Social" owner credit, Playfair Display heading font, and the `/preview` splash
poster — so its entry only needs an `origin`. Channels also
accepts the older Bears bundle's `mountBears` export during rollout. Bears
production controls still use their existing admin configuration.

A registered app with a `poster` is also shareable on X as a Player Card; see
[Share a program on X](./X-PLAYER-CARD.md).
