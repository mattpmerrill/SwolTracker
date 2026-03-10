/**
 * Exercise name normalization.
 * Resolves user input (and variant names) to canonical exercise names
 * so that max records, PR tracking, and logs are consistent.
 */

/** Canonical name → list of accepted aliases (all lowercase) */
const EXERCISE_ALIASES: Record<string, string[]> = {
  // ── Chest ──────────────────────────────────────────────────────────────
  "Barbell Bench Press": [
    "bench press", "bench", "flat bench", "bb bench", "barbell bench",
    "flat barbell bench", "flat bench press",
  ],
  "Incline Barbell Bench Press": [
    "incline bench", "incline bench press", "incline barbell bench",
    "incline bb bench",
  ],
  "Dumbbell Bench Press": [
    "db bench", "dumbbell bench", "flat db bench press",
  ],
  "Incline Dumbbell Press": [
    "incline db press", "incline dumbbell bench", "incline db bench",
  ],
  "Chest Dips": [
    "dips", "chest dips", "weighted dips",
  ],

  // ── Back ───────────────────────────────────────────────────────────────
  "Barbell Row": [
    "bent over row", "barbell row", "bb row", "bent-over row",
    "bentover row", "pendlay row",
  ],
  "Dumbbell Row": [
    "db row", "dumbbell row", "one arm row", "single arm row",
    "1-arm db row",
  ],
  "Pull-Ups": [
    "pull up", "pull ups", "pullup", "pullups", "weighted pull up",
    "weighted pullup", "bw pull ups",
  ],
  "Chin-Ups": [
    "chin up", "chin ups", "chinup", "chinups", "weighted chin up",
  ],
  "Lat Pulldown": [
    "lat pulldown", "pulldown", "cable pulldown",
  ],
  "Cable Row": [
    "seated cable row", "seated row", "cable row",
  ],
  "T-Bar Row": [
    "t bar row", "t-bar row", "tbar row",
  ],

  // ── Shoulders ──────────────────────────────────────────────────────────
  "Overhead Press": [
    "ohp", "overhead press", "barbell ohp", "military press",
    "standing ohp", "shoulder press", "barbell press",
  ],
  "Dumbbell Shoulder Press": [
    "db shoulder press", "dumbbell press", "db ohp",
    "seated db press", "seated dumbbell press",
  ],
  "Lateral Raises": [
    "lateral raise", "lateral raises", "side raises", "side laterals",
    "db lateral raise",
  ],
  "Face Pulls": [
    "face pull", "face pulls", "cable face pull",
  ],

  // ── Legs ───────────────────────────────────────────────────────────────
  "Barbell Back Squat": [
    "squat", "squats", "back squat", "barbell squat", "bb squat",
    "high bar squat", "low bar squat",
  ],
  "Front Squat": [
    "front squat", "front squats", "barbell front squat",
  ],
  "Romanian Deadlift": [
    "rdl", "romanian deadlift", "romanian dl", "barbell rdl",
    "stiff leg deadlift", "stiff-leg deadlift",
  ],
  "Deadlift": [
    "deadlift", "deadlifts", "conventional deadlift", "barbell deadlift",
    "dl", "conv deadlift",
  ],
  "Leg Press": [
    "leg press", "45 degree leg press",
  ],
  "Hack Squat": [
    "hack squat", "machine hack squat",
  ],
  "Bulgarian Split Squat": [
    "bulgarian split squat", "split squat", "rear foot elevated split squat",
    "rfess",
  ],
  "Leg Curl": [
    "leg curl", "lying leg curl", "seated leg curl", "hamstring curl",
    "machine leg curl",
  ],
  "Leg Extension": [
    "leg extension", "leg extensions", "quad extension",
  ],
  "Hip Thrust": [
    "hip thrust", "hip thrusts", "barbell hip thrust", "glute bridge",
  ],
  "Calf Raises": [
    "calf raise", "calf raises", "standing calf raise", "seated calf raise",
  ],

  // ── Arms ───────────────────────────────────────────────────────────────
  "Barbell Curl": [
    "barbell curl", "bb curl", "ez bar curl", "straight bar curl",
    "curl", "curls",
  ],
  "Dumbbell Curl": [
    "db curl", "dumbbell curl", "alternating curl", "hammer curl",
  ],
  "Tricep Pushdown": [
    "tricep pushdown", "triceps pushdown", "cable pushdown",
    "rope pushdown", "v-bar pushdown",
  ],
  "Skull Crushers": [
    "skull crusher", "skull crushers", "lying tricep extension",
    "ez bar skull crusher",
  ],
  "Close Grip Bench Press": [
    "close grip bench", "cgbp", "close grip bench press",
  ],

  // ── Core ───────────────────────────────────────────────────────────────
  "Plank": [
    "plank", "forearm plank",
  ],
  "Ab Wheel": [
    "ab wheel", "ab rollout", "rollout",
  ],

  // ── Cardio / Conditioning ──────────────────────────────────────────────
  "Assault Bike": [
    "assault bike", "airdyne", "airbike", "air bike",
  ],
  "Assault Bike Finisher": [
    "assault bike finisher", "bike finisher",
  ],
  "Rower Finisher": [
    "rower finisher", "rowing finisher", "row finisher",
  ],
  "Kettlebell Swings": [
    "kb swings", "kettlebell swing", "kettlebell swings",
    "kb swing", "russian kb swing",
  ],
};

// Build reverse lookup: alias → canonical (lowercase alias → canonical)
const _aliasToCanonical = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(EXERCISE_ALIASES)) {
  _aliasToCanonical.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    _aliasToCanonical.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Normalize an exercise name to its canonical form.
 * Returns the canonical name if found, otherwise returns the input
 * with title-case applied (so at least it's consistent).
 */
export function normalizeExerciseName(input: string): string {
  const key = input.toLowerCase().trim();

  // Exact match
  const exact = _aliasToCanonical.get(key);
  if (exact) return exact;

  // Substring match: input contains alias or alias contains input
  for (const [alias, canonical] of _aliasToCanonical.entries()) {
    if (key.includes(alias) || alias.includes(key)) {
      return canonical;
    }
  }

  // Word overlap score
  const inputWords = key.split(/[\s\-_]+/).filter(Boolean);
  let bestCanonical: string | null = null;
  let bestScore = 0;

  for (const [alias, canonical] of _aliasToCanonical.entries()) {
    const aliasWords = alias.split(/[\s\-_]+/).filter(Boolean);
    const overlap = inputWords.filter((w) => aliasWords.includes(w)).length;
    const score = overlap / Math.max(inputWords.length, aliasWords.length);
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestCanonical = canonical;
    }
  }

  if (bestCanonical) return bestCanonical;

  // No match — title-case the raw input and return it as-is
  return input
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Returns the full alias list for a canonical name (for debugging/UI) */
export function getAliases(canonical: string): string[] {
  return EXERCISE_ALIASES[canonical] ?? [];
}

/** Returns all canonical exercise names */
export function getAllCanonicalNames(): string[] {
  return Object.keys(EXERCISE_ALIASES);
}
