-- ============================================
-- ONBOARDING SCHEMA UPDATES
-- ============================================

-- Add onboarding fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_lbs NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fitness_goals TEXT[]; -- Array of goals
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS workout_days TEXT[]; -- Array of days
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS workout_duration TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS workout_location TEXT CHECK (workout_location IN ('home', 'gym'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- ============================================
-- PROMPT TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can read prompt templates
CREATE POLICY "prompt_templates_select" ON prompt_templates
  FOR SELECT USING (true);

-- Only service role can insert/update (we'll do this via SQL)
CREATE POLICY "prompt_templates_insert" ON prompt_templates
  FOR INSERT WITH CHECK (false);

-- ============================================
-- INSERT DEFAULT ONBOARDING WORKOUT PROMPT
-- ============================================
INSERT INTO prompt_templates (name, description, template)
VALUES (
  'onboarding_workout_generator',
  'Generates a personalized 4-week workout program for new users based on their onboarding data',
  E'You are an experienced strength and fitness coach with expertise in creating personalized workout programs. Your task is to create an amazing 4-week workout program customized to this user\'s specific profile and goals.

## USER PROFILE
- Name: {{display_name}}
- Gender: {{gender}}
- Age: {{age}} years old
- Current Weight: {{weight_lbs}} lbs
- Workout Location: {{workout_location}}

## FITNESS GOALS
{{fitness_goals}}

## SCHEDULE
- Available Days: {{workout_days}}
- Workout Duration: {{workout_duration}}

## AVAILABLE EQUIPMENT
{{equipment}}

## PROGRAMMING GUIDELINES
1. Create workouts that can be completed within the user\'s specified time limit
2. Never program too many movements - quality over quantity
3. Incorporate a mix of:
   - Free weight movements (if equipment available)
   - HIIT challenges for cardio/fat burn goals
   - CrossFit-style metabolic conditioning
   - Olympic lifts (if user has barbell and appropriate equipment)
   - Bodyweight exercises for flexibility and accessibility
4. Progressive overload - each week should build on the previous
5. Include proper warm-up movements
6. Balance push/pull/legs throughout the week
7. Consider recovery between sessions

## OUTPUT FORMAT
You MUST respond with valid JSON only. No markdown, no explanations, just the JSON object.

Return a JSON object with this exact structure:
{
  "weekX": {
    "DayName": {
      "focus": "Brief description of workout focus",
      "exercises": [
        {
          "name": "Exercise Name",
          "sets": 3,
          "reps": "8-10",
          "notes": "Optional form cues or modifications"
        }
      ]
    }
  }
}

Where X is 1-4 for each week, and DayName matches the user\'s available days.
Each day should have 4-8 exercises appropriate for the time limit.
Use "reps" as a string to allow for ranges like "8-10" or time-based like "30 sec".

Generate an engaging, challenging, and achievable 4-week program that will motivate this user to reach their fitness goals!'
) ON CONFLICT (name) DO UPDATE SET
  template = EXCLUDED.template,
  updated_at = NOW();

-- ============================================
-- FUNCTION TO UPDATE PROFILE WITH ONBOARDING DATA
-- ============================================
CREATE OR REPLACE FUNCTION complete_onboarding(
  p_user_id UUID,
  p_display_name TEXT,
  p_gender TEXT,
  p_age INTEGER,
  p_weight_lbs NUMERIC,
  p_fitness_goals TEXT[],
  p_workout_days TEXT[],
  p_workout_duration TEXT,
  p_workout_location TEXT,
  p_equipment TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gym_id_var UUID;
BEGIN
  -- Update profile with onboarding data
  UPDATE profiles SET
    display_name = p_display_name,
    gender = p_gender,
    age = p_age,
    weight_lbs = p_weight_lbs,
    fitness_goals = p_fitness_goals,
    workout_days = p_workout_days,
    workout_duration = p_workout_duration,
    workout_location = p_workout_location,
    onboarding_completed = TRUE,
    onboarding_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Get user's gym
  SELECT gym_id INTO gym_id_var
  FROM gym_members
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Update gym equipment if gym exists
  IF gym_id_var IS NOT NULL THEN
    -- Clear existing equipment
    DELETE FROM gym_equipment WHERE gym_id = gym_id_var;

    -- Insert new equipment
    INSERT INTO gym_equipment (gym_id, name)
    SELECT gym_id_var, unnest(p_equipment);
  END IF;

  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION complete_onboarding TO authenticated;

-- ============================================
-- FUNCTION TO GET PROMPT TEMPLATE
-- ============================================
CREATE OR REPLACE FUNCTION get_prompt_template(template_name TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT template FROM prompt_templates WHERE name = template_name;
$$;

GRANT EXECUTE ON FUNCTION get_prompt_template TO authenticated;
