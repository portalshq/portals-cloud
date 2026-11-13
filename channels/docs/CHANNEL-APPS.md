# Register a channel app

Set `CHANNELS_APPS` in the Channels server environment. The JSON object
maps a channel slug to a trusted backend origin and optional presentation
settings. The slug is the room URL and the key used to merge central catalog
metadata.

```dotenv
CHANNELS_APPS='{"garden":{"origin":"https://garden.example","name":"Garden","backdrop":true,"poster":"images/garden.webp","publicAssets":["images/background.png"]}}'
```

A registered app provides the following interfaces:

- `/channel-app/watch.js` exports `mountChannel(host, viewer)`. Mount into
  the supplied element and return a cleanup function. The viewer provides
  `getSnapshot`, `subscribe`, `fetch`, and `requestSignIn` for the shared
  Channels session. Use `/api/channels/<slug>/...` for app API requests.
- `/api/channel` returns `playback` and optionally
  `nextSession.startsAt`. Playback may be null, progressive video
  (`{kind:"video",url}`), HLS (`{playbackManifestUrl}`), or a Reactor
  descriptor (`{kind:"reactor"}`). The public preview returns only playback
  and scheduling fields.
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
`CHANNELS_APPS` entry for `bears` overrides those settings. Channels also
accepts the older Bears bundle's `mountBears` export during rollout. Bears
production controls still use their existing admin configuration.
