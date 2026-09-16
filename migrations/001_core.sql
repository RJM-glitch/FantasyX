CREATE TABLE fantasy_profiles (
  user_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL DEFAULT 'My XI',
  budget NUMERIC(6,1) NOT NULL DEFAULT 100.0,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)