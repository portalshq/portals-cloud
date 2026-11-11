-- Cosmetic display names are user-chosen only. Names previously derived from
-- IdP profile data (or falling back to email / login name) were account data
-- and must not surface in chat, so they are cleared for user principals.
-- Chosen names are written exclusively by SetUserDisplayName, which stamps
-- display_name_chosen_at; service-account principals are operator-set and
-- unaffected. All statements are restart-safe.
ALTER TABLE auth_gateway_sessions ADD COLUMN IF NOT EXISTS post_login_redirect_uri VARCHAR(512);
ALTER TABLE auth_principals ADD COLUMN IF NOT EXISTS display_name_chosen_at TIMESTAMPTZ;
UPDATE auth_principals SET display_name = '' WHERE subject_type = 'user' AND display_name_chosen_at IS NULL;
