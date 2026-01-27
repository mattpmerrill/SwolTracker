-- ============================================
-- WORKOUT COMPLETIONS TABLE
-- ============================================
-- Tracks when users mark entire workouts as complete

CREATE TABLE workout_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  day_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, gym_id, week_number, day_name)
);

-- Index for fast lookups
CREATE INDEX idx_workout_completions_user ON workout_completions(user_id);
CREATE INDEX idx_workout_completions_gym ON workout_completions(gym_id, week_number);

-- Enable RLS
ALTER TABLE workout_completions ENABLE ROW LEVEL SECURITY;

-- Users can view their own completions
CREATE POLICY "View own completions" ON workout_completions
  FOR SELECT USING (user_id = auth.uid());

-- Users can view gym members' completions
CREATE POLICY "View gym completions" ON workout_completions
  FOR SELECT USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

-- Users can manage their own completions
CREATE POLICY "Users manage own completions" ON workout_completions
  FOR ALL USING (user_id = auth.uid());
