-- Migration: Tighten workout generator 1RM percentage rules
-- Ensures generated programs do not drop percentages for exercises with logged 1RMs.

UPDATE prompt_templates
SET template = replace(
  template,
  '- **Heavy accessory movements**: Front Squat, Romanian Deadlift, Incline Press, etc.
- Use percentages like [65, 70, 75] for 3 sets, or [70, 75, 80] for strength focus',
  '- **Heavy accessory movements**: Front Squat, Romanian Deadlift, Incline Press, Incline Dumbbell Press, Dumbbell Bench Press, etc.
- **Any exercise with a logged 1RM must receive a percentages array, never null.** This includes dumbbell variants when the athlete has a dedicated dumbbell 1RM.
- Use percentages like [65, 70, 75] for 3 sets, or [70, 75, 80] for strength focus'
)
WHERE name = 'multi_week_workout_generator';

UPDATE prompt_templates
SET template = replace(
  template,
  '- Incline Bench Press -> uses Bench Press 1RM (typically 80-85% of flat bench)
- Close-Grip Bench -> uses Bench Press 1RM (typically 85-90%)',
  '- Incline Bench Press -> uses Incline Bench Press 1RM if available, otherwise Bench Press 1RM (typically 80-85% of flat bench)
- Incline Dumbbell Press -> uses Incline Dumbbell Press 1RM if available; this is per-dumbbell, so prescribe per-dumbbell working weights
- Dumbbell Bench Press -> uses Dumbbell Bench Press 1RM if available; this is per-dumbbell
- Close-Grip Bench -> uses Bench Press 1RM (typically 85-90%)'
)
WHERE name = 'multi_week_workout_generator';
