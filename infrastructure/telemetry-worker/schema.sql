-- Telemetry beacon storage (Cloudflare D1 / SQLite)
-- Each install upserts its latest beacon; first_seen_at is preserved.

CREATE TABLE IF NOT EXISTS beacons (
  install_id       TEXT PRIMARY KEY,
  first_seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at     TEXT NOT NULL DEFAULT (datetime('now')),

  -- App
  app_version      TEXT,
  beacon_version   INTEGER,

  -- Platform
  platform         TEXT,
  arch             TEXT,
  node_version     TEXT,

  -- Display
  display_width    INTEGER,
  display_height   INTEGER,
  display_transform TEXT,

  -- Usage
  screen_count     INTEGER,
  module_count     INTEGER,
  module_types     TEXT,  -- JSON object {"clock": 2, "weather": 1}
  profile_count    INTEGER,

  -- Feature adoption
  weather_provider   TEXT,
  transition_effect  TEXT,
  sleep_enabled      INTEGER,  -- 0/1, v2+: true when any rendered surface will actually sleep
  alerts_enabled     INTEGER,  -- 0/1, v2+: true when any rendered surface will actually show alerts
  auth_enabled       INTEGER,
  has_google_calendar INTEGER,
  has_ical_sources   INTEGER,
  plugin_count       INTEGER,

  -- Multi-display (beacon v2+; NULL on v1 rows)
  display_count          INTEGER,  -- 0 = legacy single-display mode, else # of registered displays
  displays               TEXT,     -- JSON array of {w,h,transform,screenCount,moduleCount,...}
  has_owned_screens      INTEGER,  -- 0/1, any display uses owned `screens`
  has_legacy_screen_ids  INTEGER,  -- 0/1, any display still uses deprecated `screenIds` pool
  has_owned_profiles     INTEGER,  -- 0/1, any display uses owned `profiles`
  has_settings_override  INTEGER,  -- 0/1, any display carries a non-empty `settings` override block

  -- Installed plugins (beacon v4+; NULL on pre-v4 rows — "unknown", not "none")
  plugins          TEXT,  -- JSON array of {id,version,enabled}; side-loaded plugins arrive anonymized as id 'external'

  -- Raw payload for forward compatibility
  raw_payload      TEXT
);

-- Index for aggregate queries
CREATE INDEX IF NOT EXISTS idx_beacons_last_seen ON beacons(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_beacons_app_version ON beacons(app_version);
CREATE INDEX IF NOT EXISTS idx_beacons_display_count ON beacons(display_count);

-- Upgrading an existing deployment? See `schema-v2-migration.sql` and
-- `schema-v4-migration.sql` for the ALTER TABLE statements that bring an
-- older `beacons` table in line with the column list above.
