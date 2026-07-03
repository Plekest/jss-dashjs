CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS datasets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  source_type text NOT NULL,
  columns     jsonb NOT NULL DEFAULT '[]',
  data        jsonb NOT NULL DEFAULT '[]',
  -- Pro-mode only: raw formulas + multi-tab layout, so the rich /sheets
  -- editor can reopen with fórmulas intact. `columns`/`data` above always
  -- hold the first worksheet's calculated values (dashboards keep reading
  -- them exactly as before, licensed or not).
  meta        jsonb NOT NULL DEFAULT '{}',
  row_count   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Idempotent: also applies the column to a database created before this
-- field existed (docker-entrypoint-initdb.d only runs init.sql once).
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS dashboards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  definition  jsonb NOT NULL,
  dataset_id  uuid REFERENCES datasets(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE TABLE IF NOT EXISTS connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  type        text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}',
  credentials text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Scheduled refresh: only datasets ingested from a connection (BigQuery
-- today) carry a source query to re-run; CSV/upload datasets never get
-- these columns populated.
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES connections(id) ON DELETE SET NULL;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS source_sql text;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS refresh_interval_minutes integer;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS next_refresh_at timestamptz;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS last_refresh_error text;
