# Register a channel app

Channel app registrations are central database records. When an app publishes
`app_origin` on its central `programs` row — the 25th Chapter sync sets it
from `PORTALS_APP_ORIGIN` — the Channels registry mounts that app at its
published `programs.slug`, independent of any schedule. `programs.tenant_id`
identifies the creator channel. One creator can register multiple programs.
`app_origin` is the trusted backend origin
serving `/api/channel` and the app bundle. An optional `app_config` jsonb
column carries the same presentation fields `CHANNELS_APPS` accepts (`name`,
`by`, `theme`, `heading`, `backdrop`, `poster`, `publicAssets`); code-owned
per-slug defaults in `lib/channel-apps.ts` fill anything `app_config` omits.

`CHANNELS_APPS` remains as a local-server fallback. The JSON object
maps a program slug to a trusted backend origin and optional presentation
settings. The slug is the room URL and the key used to merge central catalog
metadata. A central `app_origin` record always wins over a `CHANNELS_APPS`
entry for the same slug.

Apply central migration `0011` before publishing new slugs. It reserves route
names, preserves published slugs and rejects station-slot overlaps. The known
default program IDs retain `/bears` and `/25th-chapter`; reconcile custom
program IDs explicitly. The registry supports unambiguous legacy bindings
while operators populate slugs. Do not use a shared creator identifier as a
public program slug.

## Preview and chat

`mountChannel` receives `controls.variant === 'preview'` in the active feed
panel and the preview embed. A compatible bundle exports `supportsPreview =
true`, renders only stage/backdrop and schedule, and doesn't open full-chat,
reaction, account, write or reminder connections. The host renders the public
chat overlay once, including for old bundles with a read-only fallback. Set
`chatMessages` to an integer from 0 to 10 in the app configuration; omitted
defaults to 3. `data-channel-room-variant="preview"` is a layout hook, not a
substitute for suppressing interactive elements.

The shared host contract is `controls.elements`:

```ts
type RoomElements = {
  chatMessages?: number
  input?: boolean
  reactions?: boolean
  forms?: boolean
  actions?: boolean
}
```

Omitted fields preserve the program's normal behavior. The `preview` preset is
`{ chatMessages: 3, input: false, reactions: false, forms: false, actions:
false }`; a validated host override may change the message count without
re-enabling writes. Preview-capable bundles render the program's real stage or
off-air lobby. Channels owns the bounded chat overlay, so the same contract is
used in the feed and `/embed/<slug>?variant=preview` without a second player.

After central migrations `0012` and `0013`, set `CHANNELS_CHAT_ORIGIN` on Bears and the
25th Chapter to the Channels origin. Set the same server-only
`CHANNELS_CHAT_SERVICE_TOKEN` on those servers and Channels. Configure the two
apps together so standalone and framed viewers use the same public chat.
Each adapter reads and writes `/api/programs/<program-id>/chat`; the durable
thread is shared by every surface of that program and isolated from every other
program. Legacy app histories and external or paid chat feeds are not
republished into it.
`CHANNELS_CHAT_BLOCKED_TERMS` adds comma-separated shared blocked terms.
Groups use the same chat window for public and private scopes and require
separate membership authorization. Bundles can export `supportsShellChat =
true` and honor `controls.shellChat` to suppress their own window in group
rooms.

Migration `0013` deliberately does not guess which program owns an older
unscoped public row. Those rows remain stored with `program_id IS NULL` but are
not returned by any program thread. Backfill only rows with trustworthy
provenance; otherwise retain them for audit or remove them under the normal
data-retention policy before validating the scope constraint.

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

- `/channel-app/watch.js` exports `mountChannel(host, viewer, controls)`. Mount into
  the supplied element and return a cleanup function. The viewer provides
  `getSnapshot`, `subscribe`, `fetch`, and `requestSignIn` for the shared
  Channels session. Use `/api/channels/<slug>/...` for app API requests.
  The optional third argument provides room controls. Export
  `supportsRoomSound = true` and subscribe to `controls.sound` to let the
  rail mute or unmute the room. Apps can publish a balance and an optional
  invite action through `controls.onAccountChange` for the central account dialog.
  A room that renders its own branded follow dialog can register an opener
  with `controls.onFollowDialog(open)` — call it again with `null` to retract
  — and report the outcome with
  `controls.onFollowSettled('succeeded' | 'cancelled' | 'failed')`. When a
  preview registers, the feed's Follow button opens the room's styled dialog
  instead of the channels default reminders prompt, and the host syncs the
  bell and follow analytics from the reported outcome (`succeeded` means the
  follow committed; dismissed or failed dialogs write nothing). Unfollow
  stays a single immediate write. `controls.submitFollow({ email? })` performs
  the standard reminders submission and follow settlement (using the real
  viewer session even from a read-only preview) and returns
  `{ ok, verified?, error?, settingsUrl? }`, so a styled dialog can reuse the
  host's write path. `controls.programName` and `controls.programId` carry
  the catalog (database-sourced) program identity for the mounted room; use
  them to populate follow dialogs and room copy without hard-coded values.
  Rooms that register nothing keep the channels default.
- `/api/channel` returns `playback` and optionally
  `nextSession.startsAt`. Playback may be null, progressive video
  (`{kind:"video",url}`), HLS (`{playbackManifestUrl}`), or a Reactor
  descriptor (`{kind:"reactor"}`). The public preview returns only playback
  and scheduling fields. A null playback keeps the preview in the program's
  read-only off-air lobby, including its next-session information. The
  canonical room URL remains `/<program-slug>` before, during, and after air.
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
