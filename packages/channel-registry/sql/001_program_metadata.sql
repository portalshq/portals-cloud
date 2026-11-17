-- Public program metadata lives on the central program record.
ALTER TABLE programs ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS page_title text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS social_site_name text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS default_share_image text;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS theme_color text;
