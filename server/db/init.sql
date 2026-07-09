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
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

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

CREATE TABLE IF NOT EXISTS tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE datasets ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_datasets_tenant ON datasets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connections_tenant ON connections(tenant_id);

CREATE TABLE IF NOT EXISTS invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  token       text NOT NULL UNIQUE,
  invited_by  uuid NOT NULL REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);

CREATE TABLE IF NOT EXISTS password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

CREATE TABLE IF NOT EXISTS dashboard_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text,
  definition   jsonb NOT NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_versions_dashboard ON dashboard_versions(dashboard_id);

CREATE TABLE IF NOT EXISTS dashboard_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  definition  jsonb NOT NULL,
  dataset_id  uuid REFERENCES datasets(id) ON DELETE SET NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_templates_tenant ON dashboard_templates(tenant_id);

CREATE TABLE IF NOT EXISTS alerts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset_id             uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  column_name            text NOT NULL,
  aggregation            text NOT NULL CHECK (aggregation IN ('sum','mean','count','max','min')),
  operator               text NOT NULL CHECK (operator IN ('gt','gte','lt','lte','eq')),
  threshold              numeric NOT NULL,
  recipients             text[] NOT NULL,
  renotify_after_minutes integer,
  active                 boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_dataset ON alerts(dataset_id);

CREATE TABLE IF NOT EXISTS alert_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id     uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  value        numeric NOT NULL,
  notified_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON alert_events(alert_id);
-- Um único evento "aberto" (resolved_at IS NULL) por alerta de cada vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_open ON alert_events(alert_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dashboard_id   uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  name           text NOT NULL,
  metrics        jsonb NOT NULL, -- [{ "label": "Vendas totais", "column": "revenue", "aggregation": "sum" }]
  recipients     text[] NOT NULL,
  cron           text NOT NULL,
  next_run_at    timestamptz NOT NULL,
  last_run_at    timestamptz,
  last_run_error text,
  active         boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_tenant ON scheduled_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_dashboard ON scheduled_reports(dashboard_id);
