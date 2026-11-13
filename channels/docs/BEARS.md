# Bears in Channels

See [Register a channel app](./CHANNEL-APPS.md) for the shared bundle and proxy contract.

See [Channel content by page](./CHANNEL-CONTENT.md) for the feed, browse, and room diagram.

Channels owns discovery, the rail, and the room URL. Enter channel opens
`/bears`, where the browser imports the independently built Bears watch
bundle and mounts it in a shadow root. Leaving the room unmounts the app.
The browse cards and feed use the same channel preview component. A channel
can declare a preview endpoint, poster, and optional backdrop module in its
catalog entry. The module exports `mountBackdrop(host)`, which mounts the
scene and returns a cleanup function. Bears builds its forest renderer as
`backdrop.js`, so the preview runs without mounting the watch app or
opening chat, interactions, or Reactor.

Browse animates one visible preview at a time and prioritizes the card being
hovered or focused. The feed uses muted HLS or progressive video when
available and the backdrop when no preview video is available. The poster
covers inactive cards and cases where the backdrop module cannot load.
An explicit response with no playback shows an off-air notice. A failed
request shows an unavailable notice. The reminder form lives in the room.

While a preview is active, Channels refreshes its descriptor every 15 seconds.
The Bears endpoint shares the server's short cache and returns playback
URLs, live status, and the next session's start time. In dry run, Bears
returns its configured demo video between episodes, and the feed loops it.
Entering the room uses the same playback, chat, and interactions as standalone Bears.

## Configure

1. Build and deploy Bears as usual with `npm run build`. It publishes
   `dist/index.html` for standalone and `dist/channel-app/` for Channels.
   Point Channels' `BEARS_API_BASE_URL` at the Bears server to register its default configuration. That origin
   serves the browser bundle through Channels as well as the audience API.
   The Bears `npm run dry-run` command builds the Channels bundle before
   starting its backend. Vite alone only serves the standalone frontend.
2. Configure Channels with `AUTH_GATEWAY_TCP_ADDRESS` and `AUTH_GATEWAY_TLS`
   for the same Portals gateway Bears uses. Set `CHANNELS_AUTH_ORIGINS`
   to the allowed Channels origins, such as
   `http://localhost:4000,http://100.125.2.45:4000`. Add those exact origins
   to `AUTH_LOGIN_REDIRECT_ALLOWLIST` in the gateway's `AUTH_ENV_FILE` and
   recreate the gateway container to apply the environment. Sign-in returns
   to Channels' `/auth/complete` and resumes the page where it started.
   Channels owns the account menu and viewer session for all mounted apps.
   Bears receives a session subscription and authenticated request function
   when mounted. Standalone Bears continues to manage its own session through
   the same gateway and account base. Each browser origin has its own session.
3. Set Channels' `ADMIN_CENTRAL_DATABASE_URL` to the migrated central
   platform database. Discovery reads channel bindings from schedule rules and published slots,
   including off-air channels. It joins program/station names and merges
   entries by channel ID with central entries replacing matching mocks.
   If the central DB contains private stations, configure
   `CHANNELS_CATALOG_STATION_ID` for the public station. The mock catalog
   remains available when the database is unavailable.

Channels forwards only audience routes at `/api/channels/bears/`. Media
segments and WebRTC flow directly from the delivery provider. Production
commands still use the protected admin routes. For deployment, preserve
streaming responses and make sure Bears sees the viewer IP for its rate
limits. Channels takes the IP from Vercel's edge header or from
`CHANNELS_TRUSTED_CLIENT_IP_HEADER` on a self-hosted ingress that overwrites
that header. Use a direct Bears origin for the proxy or configure the Bears
ingress to preserve the verified viewer IP for that trusted hop.

A standalone Bears deployment can omit `CHANNELS_APP_ORIGIN`. Its public
app and production process use their existing entry points.
