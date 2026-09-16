CREATE TABLE fantasy_squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  club TEXT NOT NULL,
  position TEXT NOT NULL,
  price NUMERIC(5,1) NOT NULL,
  is_captain BOOLEAN NOT NULL DEFAULT false,
  is_vice BOOLEAN NOT NULL DEFAULT false,
  is_bench BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)