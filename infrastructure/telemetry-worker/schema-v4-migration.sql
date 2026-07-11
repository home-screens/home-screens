-- Migrate an existing beacons table to v4 (installed-plugin reporting).
-- Run once against an existing D1 database:
--
--   wrangler d1 execute telemetry --remote --file=schema-v4-migration.sql
--
-- Fresh installs get this column from schema.sql directly — only run this
-- file on a database that was created before the plugins beacon field was
-- introduced. Re-running emits a "duplicate column name" error; that's
-- harmless.
--
-- NULL means "beacon predates v4" (unknown), while '[]' means "v4 install
-- with no plugins" — dashboards should filter plugin-adoption queries on
-- plugins IS NOT NULL (or beacon_version >= 4) so old installs don't read
-- as zero-plugin installs.

ALTER TABLE beacons ADD COLUMN plugins TEXT;
