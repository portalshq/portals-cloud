-- A program row doubles as the channel app registration record: when the app
-- publishes its public origin on the program bound to a channel_id, Channels
-- mounts it as a registered channel app. `app_config` carries optional
-- presentation overrides ({name, by, theme, heading, backdrop, poster,
-- publicAssets}) validated by the Channels registry; code-owned defaults in
-- `lib/channel-apps.ts` fill the gaps.
ALTER TABLE programs ADD COLUMN IF NOT EXISTS app_origin text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS app_config jsonb NOT NULL DEFAULT '{}'::jsonb;
