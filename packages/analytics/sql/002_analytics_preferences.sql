-- Optional cross-application preference store. Apply to the central database
-- through migrateAnalyticsPreferences; browser-only visitors remain local.
CREATE TABLE IF NOT EXISTS portals_analytics_preferences (
  user_id text PRIMARY KEY,
  suppressed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
