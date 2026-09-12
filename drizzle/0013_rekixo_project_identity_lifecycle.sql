-- Phase 2: explicit project identity, membership foundation, recoverable lifecycle.
ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE projects ADD COLUMN deleted_at TEXT;

UPDATE projects
SET kind='geo_lab'
WHERE id IN (
  SELECT project_id
  FROM settings
  WHERE key='geoLabMode' AND value='1'
);

CREATE INDEX IF NOT EXISTS idx_projects_kind_status
ON projects(kind,status);

CREATE TABLE IF NOT EXISTS project_memberships (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client_admin',
  status TEXT NOT NULL DEFAULT 'active',
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,project_id),
  FOREIGN KEY(user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_project_status
ON project_memberships(project_id,status);

INSERT OR IGNORE INTO project_memberships
(user_id,project_id,role,status,is_primary,created_at,updated_at)
SELECT id,project_id,role,status,1,created_at,updated_at
FROM admin_users;
