-- Nullable for compatibility with existing browser refresh families.
ALTER TABLE auth_refresh_sessions ADD COLUMN IF NOT EXISTS originating_key_id UUID
    REFERENCES service_account_api_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_refresh_originating_key ON auth_refresh_sessions(originating_key_id);
