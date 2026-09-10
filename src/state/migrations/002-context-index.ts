export const CONTEXT_INDEX_MIGRATION_SQL = `
CREATE TABLE context_items (
  context_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  logical_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'module_summary', 'source_pointer', 'test_pointer', 'decision_pointer',
      'history_pointer', 'pitfall', 'dependency_pointer'
    )
  ),
  scope TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  source_hash TEXT,
  git_sha TEXT,
  verified_at TEXT NOT NULL,
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
  replaces_context_id TEXT REFERENCES context_items(context_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_context_logical_version
  ON context_items(project_id, logical_key, ifnull(source_hash, ''));
CREATE INDEX idx_context_project_stale_updated
  ON context_items(project_id, stale, updated_at DESC);
CREATE INDEX idx_context_project_scope
  ON context_items(project_id, scope);
CREATE INDEX idx_context_project_source
  ON context_items(project_id, source_uri);
`;
