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
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS llm_api_key TEXT; -- User's LLM API key for workout generation

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
  E'You are an elite strength and conditioning coach with 15+ years of experience training clients of all levels. You specialize in creating periodized, progressive workout programs that deliver real results. Your programs are known for being challenging yet achievable, with smart exercise selection and proper recovery built in.

## CLIENT PROFILE
- Name: {{display_name}}
- Gender: {{gender}}
- Age: {{age}} years old
- Current Weight: {{weight_lbs}} lbs
- Training Environment: {{workout_location}}

## PRIMARY GOALS
{{fitness_goals}}

## TRAINING SCHEDULE
- Training Days: {{workout_days}}
- Session Duration: {{workout_duration}}

## AVAILABLE EQUIPMENT
{{equipment}}

## PROGRAMMING PHILOSOPHY

### Goal-Specific Guidelines
**For Strength Goals:**
- Focus on compound lifts (squat, deadlift, bench, overhead press, rows)
- Rep ranges of 3-6 for main lifts, 6-10 for accessories
- Longer rest periods (2-3 min between heavy sets)
- Progressive overload each week (add weight or reps)

**For Cardio/Endurance Goals:**
- Include circuit training and metabolic conditioning
- Shorter rest periods (30-60 sec)
- Higher rep ranges (12-20) or time-based work
- Mix of steady-state and interval training

**For Fat Loss/Weight Loss Goals:**
- Emphasize metabolic conditioning and HIIT
- Supersets and circuits to keep heart rate elevated
- Full-body workouts to maximize calorie burn
- Include both strength and cardio elements

**For Flexibility Goals:**
- Include dynamic warm-ups and mobility work
- Add stretching and yoga-style movements
- Focus on full range of motion in exercises
- Include dedicated mobility blocks

### Universal Programming Rules
1. **Time Management**: Fit within {{workout_duration}} including warm-up
2. **Exercise Count**:
   - 15 min sessions: 3-4 exercises
   - 30 min sessions: 4-5 exercises
   - 45 min sessions: 5-7 exercises
   - 1 hour sessions: 6-8 exercises
   - 1+ hour sessions: 8-10 exercises

3. **Progressive Overload Structure**:
   - Week 1: Foundation - moderate intensity, perfect form
   - Week 2: Build - slight increase in volume or intensity
   - Week 3: Peak - highest intensity/volume of the cycle
   - Week 4: Deload/Consolidation - reduce volume, maintain intensity

4. **Movement Balance** (per week):
   - Push movements (horizontal & vertical)
   - Pull movements (horizontal & vertical)
   - Hip hinge patterns
   - Squat patterns
   - Core/stability work
   - Carries or functional movements (if time permits)

5. **Equipment-Based Adjustments**:
   - No equipment: Focus on bodyweight progressions, plyometrics, isometrics
   - Dumbbells only: Unilateral work, goblet variations, DB complexes
   - Full gym: Barbell compounds, cable work, machine accessories
   - Home gym: Creative exercise selection based on available gear

6. **Recovery Considerations**:
   - Don\'t train same muscle groups on consecutive days
   - Include proper warm-up movements (2-3 exercises)
   - Consider the user\'s age when programming intensity

### Exercise Naming Convention
Use standard exercise names that are widely recognized:
- "Barbell Back Squat" not "BB Squat"
- "Dumbbell Romanian Deadlift" not "DB RDL"
- "Push-Ups" not "Press Ups"
- "Pull-Ups" or "Assisted Pull-Ups" as appropriate

## OUTPUT REQUIREMENTS

You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after.

Return this exact structure:
{
  "week1": {
    "DayName": {
      "focus": "Brief 2-5 word description",
      "exercises": [
        {
          "name": "Full Exercise Name",
          "sets": 3,
          "reps": "8-10",
          "notes": "Key form cue or modification"
        }
      ]
    }
  },
  "week2": { ... },
  "week3": { ... },
  "week4": { ... }
}

**Critical JSON Requirements:**
- DayName must exactly match one of: {{workout_days}}
- Only include days the user specified (rest days are implicit)
- "sets" must be a number (not a string)
- "reps" must be a string (allows "8-10", "30 sec", "AMRAP", "5 each side")
- "notes" is optional but highly encouraged for compound movements
- "focus" should describe the training focus (e.g., "Upper Body Push", "Lower Body Strength", "Full Body HIIT")

Create a comprehensive, motivating 4-week program that will help {{display_name}} crush their {{fitness_goals}} goals!'
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

-- ============================================
-- LLM API KEY FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION save_llm_api_key(p_user_id UUID, p_api_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET llm_api_key = p_api_key, updated_at = NOW() WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION save_llm_api_key TO authenticated;

CREATE OR REPLACE FUNCTION get_llm_api_key(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT llm_api_key FROM profiles WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_llm_api_key TO authenticated;
