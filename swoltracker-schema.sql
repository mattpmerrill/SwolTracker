-- SwolTracker Database Schema for Supabase
-- Run this in Supabase SQL Editor after creating your project

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '💪',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    '💪'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- GYMS (for gym buddy groups)
-- ============================================
CREATE TABLE gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GYM MEMBERS (many-to-many)
-- ============================================
CREATE TABLE gym_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, user_id)
);

-- ============================================
-- GYM EQUIPMENT
-- ============================================
CREATE TABLE gym_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, name)
);

-- Default equipment for new gyms
CREATE OR REPLACE FUNCTION add_default_equipment()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gym_equipment (gym_id, name) VALUES
    (NEW.id, 'Dumbbells'),
    (NEW.id, 'Barbells'),
    (NEW.id, 'Squat Rack'),
    (NEW.id, 'Bench'),
    (NEW.id, 'Incline Bench'),
    (NEW.id, 'Pull-up Bar'),
    (NEW.id, 'Cable Machine'),
    (NEW.id, 'Treadmill'),
    (NEW.id, 'Rower'),
    (NEW.id, 'Kettlebells');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_gym_created
  AFTER INSERT ON gyms
  FOR EACH ROW EXECUTE FUNCTION add_default_equipment();

-- ============================================
-- EXERCISES (master list)
-- ============================================
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  muscle_groups TEXT,
  is_compound BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common exercises
INSERT INTO exercises (name, muscle_groups, is_compound) VALUES
  ('Bench Press', 'Chest, Triceps, Shoulders', true),
  ('Back Squat', 'Quads, Glutes, Core', true),
  ('Deadlift', 'Back, Hamstrings, Glutes', true),
  ('Overhead Press', 'Shoulders, Triceps', true),
  ('Barbell Rows', 'Back, Biceps', true),
  ('Pull-Ups', 'Back, Biceps', true),
  ('Front Squat', 'Quads, Core', true),
  ('Romanian Deadlift', 'Hamstrings, Glutes, Back', true),
  ('Push Press', 'Shoulders, Triceps, Legs', true),
  ('Power Clean', 'Full Body', true),
  ('Incline Bench Press', 'Upper Chest, Shoulders', true),
  ('Close-Grip Bench Press', 'Triceps, Chest', true),
  ('Dips', 'Chest, Triceps', true),
  ('Lunges', 'Quads, Glutes', true),
  ('Kettlebell Swings', 'Hips, Core, Posterior Chain', true);

-- ============================================
-- USER MAXES (1RM history with tracking)
-- ============================================
CREATE TABLE user_maxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  weight_lbs NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Index for fast lookups
CREATE INDEX idx_user_maxes_user_exercise ON user_maxes(user_id, exercise_name, recorded_at DESC);

-- View for current maxes (most recent per exercise)
CREATE VIEW current_user_maxes AS
SELECT DISTINCT ON (user_id, exercise_name)
  user_id,
  exercise_name,
  weight_lbs,
  recorded_at
FROM user_maxes
ORDER BY user_id, exercise_name, recorded_at DESC;

-- ============================================
-- WORKOUT PROGRAMS (AI generated or manual)
-- ============================================
CREATE TABLE workout_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  week_number INT NOT NULL,
  program_data JSONB NOT NULL, -- Full week structure
  ai_generated BOOLEAN DEFAULT false,
  ai_notes TEXT, -- User's notes when generating
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, week_number)
);

-- Index for fast week lookups
CREATE INDEX idx_programs_gym_week ON workout_programs(gym_id, week_number);

-- ============================================
-- WORKOUT LOGS (individual set completions)
-- ============================================
CREATE TABLE workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
  program_id UUID REFERENCES workout_programs(id) ON DELETE SET NULL,
  week_number INT NOT NULL,
  day_name TEXT NOT NULL,
  exercise_index INT NOT NULL,
  set_index INT NOT NULL,
  exercise_name TEXT NOT NULL,
  prescribed_weight NUMERIC,
  prescribed_reps TEXT,
  actual_weight NUMERIC,
  actual_reps INT,
  completed BOOLEAN DEFAULT true,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, gym_id, week_number, day_name, exercise_index, set_index)
);

-- Indexes for performance
CREATE INDEX idx_logs_user_week ON workout_logs(user_id, week_number, day_name);
CREATE INDEX idx_logs_gym_week ON workout_logs(gym_id, week_number);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_maxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all profiles, but only update their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Gyms: Members can see their gyms
CREATE POLICY "Gym members can view their gyms" ON gyms
  FOR SELECT USING (
    id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create gyms" ON gyms
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Gym Members: Can see members of your gyms
CREATE POLICY "View gym members" ON gym_members
  FOR SELECT USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can manage members" ON gym_members
  FOR ALL USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY "Users can join gyms" ON gym_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Equipment: Gym members can view/manage
CREATE POLICY "Gym members can view equipment" ON gym_equipment
  FOR SELECT USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Gym members can manage equipment" ON gym_equipment
  FOR ALL USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

-- User Maxes: Users see their own, gym buddies can see each other
CREATE POLICY "View own maxes" ON user_maxes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "View gym buddy maxes" ON user_maxes
  FOR SELECT USING (
    user_id IN (
      SELECT gm2.user_id FROM gym_members gm1
      JOIN gym_members gm2 ON gm1.gym_id = gm2.gym_id
      WHERE gm1.user_id = auth.uid()
    )
  );

CREATE POLICY "Users manage own maxes" ON user_maxes
  FOR ALL USING (user_id = auth.uid());

-- Workout Programs: Gym members can view/create
CREATE POLICY "Gym members view programs" ON workout_programs
  FOR SELECT USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Gym members create programs" ON workout_programs
  FOR INSERT WITH CHECK (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

-- Workout Logs: View own and gym buddies
CREATE POLICY "View own logs" ON workout_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "View gym buddy logs" ON workout_logs
  FOR SELECT USING (
    gym_id IN (SELECT gym_id FROM gym_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users manage own logs" ON workout_logs
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- USEFUL VIEWS
-- ============================================

-- User's workout completion stats
CREATE VIEW user_workout_stats AS
SELECT 
  user_id,
  week_number,
  day_name,
  COUNT(*) as total_sets,
  COUNT(*) FILTER (WHERE completed) as completed_sets,
  ROUND(COUNT(*) FILTER (WHERE completed)::numeric / COUNT(*)::numeric * 100, 1) as completion_pct
FROM workout_logs
GROUP BY user_id, week_number, day_name;

-- 1RM Progress over time
CREATE VIEW max_progress AS
SELECT 
  user_id,
  exercise_name,
  weight_lbs,
  recorded_at,
  weight_lbs - LAG(weight_lbs) OVER (PARTITION BY user_id, exercise_name ORDER BY recorded_at) as change_lbs
FROM user_maxes
ORDER BY user_id, exercise_name, recorded_at;
