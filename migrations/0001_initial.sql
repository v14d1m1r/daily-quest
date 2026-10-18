CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Belgrade',
  water_goal_ml INTEGER NOT NULL DEFAULT 2000 CHECK (water_goal_ml BETWEEN 100 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE water_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL CHECK (amount_ml BETWEEN 1 AND 10000),
  consumed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX water_entries_user_time ON water_entries(user_id, consumed_at);
CREATE INDEX sessions_expires ON sessions(expires_at);
