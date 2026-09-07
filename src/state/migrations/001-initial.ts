export const INITIAL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL,
  repo_key TEXT NOT NULL UNIQUE,
  repo_fingerprint TEXT NOT NULL,
  remote_url TEXT,
  default_branch TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1)
) STRICT;

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  objective TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('active', 'paused', 'blocked', 'completed', 'cancelled')
  ),
  durable INTEGER NOT NULL CHECK (durable IN (0, 1)),
  primary_thread_id TEXT,
  repo_head_at_start TEXT,
  last_observed_repo_head TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1)
) STRICT;

CREATE TABLE work_items (
  work_item_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'ready', 'running', 'verifying', 'needs_decision', 'needs_review',
      'blocked', 'done', 'cancelled'
    )
  ),
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  owner_role TEXT CHECK (
    owner_role IS NULL OR owner_role IN (
      'context_companion', 'investigator', 'executor', 'senior_executor', 'verifier'
    )
  ),
  native_thread_id TEXT,
  worktree_ref TEXT,
  acceptance_json TEXT NOT NULL,
  readiness_level TEXT NOT NULL CHECK (
    readiness_level IN (
      'implemented', 'validated_local', 'validated_target', 'released', 'accepted'
    )
  ),
  readiness_evidence_json TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE decisions (
  decision_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  work_item_id TEXT REFERENCES work_items(work_item_id),
  question TEXT NOT NULL,
  alternatives_json TEXT,
  recommendation TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'resolved', 'superseded')),
  authority TEXT NOT NULL CHECK (authority IN ('main', 'user')),
  resolution TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  work_item_id TEXT REFERENCES work_items(work_item_id),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'test', 'build', 'lint', 'review', 'git', 'artifact', 'source', 'manual',
      'target_observation'
    )
  ),
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'partial', 'unknown')),
  source_uri TEXT,
  command TEXT,
  exit_code INTEGER,
  git_sha TEXT,
  artifact_id TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  media_type TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  preview TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE resources (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  work_item_id TEXT REFERENCES work_items(work_item_id),
  type TEXT NOT NULL CHECK (
    type IN (
      'agent_thread', 'worktree', 'temporary_branch', 'tool_session', 'test_run', 'other'
    )
  ),
  control TEXT NOT NULL CHECK (control IN ('coordinated', 'observed')),
  owner TEXT NOT NULL,
  native_ref TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'intent_recorded', 'observed', 'attached', 'running', 'completed', 'failed', 'cleaned'
    )
  ),
  cleanup_required INTEGER NOT NULL CHECK (cleanup_required IN (0, 1)),
  last_error TEXT,
  evidence_id TEXT REFERENCES evidence(evidence_id),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE workflow_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('run', 'work_item', 'decision', 'evidence', 'resource', 'artifact')
  ),
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  command_id TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE command_receipts (
  command_id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  run_id TEXT REFERENCES runs(run_id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_runs_project_updated ON runs(project_id, updated_at DESC);
CREATE INDEX idx_work_items_run_state ON work_items(run_id, state);
CREATE INDEX idx_decisions_run_status ON decisions(run_id, status);
CREATE INDEX idx_decisions_work_status ON decisions(work_item_id, status);
CREATE INDEX idx_evidence_work ON evidence(work_item_id, created_at);
CREATE INDEX idx_resources_run_cleanup ON resources(run_id, cleanup_required, status);
CREATE INDEX idx_events_run_sequence ON workflow_events(run_id, sequence);
`;
