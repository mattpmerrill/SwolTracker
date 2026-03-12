-- ============================================
-- MISSED DAYS TABLE
-- ============================================
-- Tracks when users intentionally skip a workout day.
-- Differentiates "not logged yet" from "intentionally skipped"
-- so adaptive program gen knows why a day was missed.

CREATE TABLE IF NOT EXISTS missed_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  day_name TEXT NOT NULL,
  reason TEXT DEFAULT NULL,  -- 'injury', 'travel', 'rest', 'illness', 'life' or free text
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, gym_id, week_number, day_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_missed_days_user ON missed_days(user_id);
CREATE INDEX IF NOT EXISTS idx_missed_days_gym_week ON missed_days(gym_id, week_number);

-- RLS
ALTER TABLE missed_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own missed days" ON missed_days
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users view gym missed days" ON missed_days
  FOR SELECT USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users manage own missed days" ON missed_days
  FOR ALL USING (user_id = auth.uid());
