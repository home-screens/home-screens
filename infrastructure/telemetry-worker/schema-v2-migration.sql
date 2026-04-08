-- Migrate an existing v1 beacons table to v2 (multi-display support).
-- Run once against an existing D1 database:
--
--   wrangler d1 execute telemetry --file=schema-v2-migration.sql
--
-- Fresh installs get these columns from schema.sql directly — only run this
-- file on a database that was created before the multi-display beacon fields
-- were introduced. Re-running is a no-op at the query level but will emit
-- "duplicate column name" errors for each ALTER; that's harmless.

ALTER TABLE beacons ADD COLUMN display_count INTEGER;
ALTER TABLE beacons ADD COLUMN displays TEXT;
ALTER TABLE beacons ADD COLUMN has_owned_screens INTEGER;
ALTER TABLE beacons ADD COLUMN has_legacy_screen_ids INTEGER;
ALTER TABLE beacons ADD COLUMN has_owned_profiles INTEGER;
ALTER TABLE beacons ADD COLUMN has_settings_override INTEGER;

CREATE INDEX IF NOT EXISTS idx_beacons_display_count ON beacons(display_count);
