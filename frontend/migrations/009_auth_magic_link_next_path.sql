ALTER TABLE auth_magic_links
  ADD COLUMN IF NOT EXISTS next_path text;
