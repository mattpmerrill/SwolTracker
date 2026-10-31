// Zod at the trust boundaries (AGENTS.md): what the worker API answers, and the environment.
// A 200 whose body does not match is a BadResponse, never trusted into workflow history.
//
// Each schema is typed against the contract (`z.ZodType<WorkerResponseMap[O]>`), so a change to
// shared/checkin-contract.ts that the schema does not follow fails the typecheck.

import { z } from "zod";
import { PROGRAM_DAYS, type WorkerOp, type WorkerResponseMap } from "../../shared/checkin-contract.js";

const day = z.enum(PROGRAM_DAYS);
const iso = z.string().min(1);
const isoOrNull = iso.nullable();

const checkinStatus = z.enum(["drafting", "pending", "applied", "partial", "declined", "expired", "failed"]);
const offerStatus = z.enum(["pending", "accepted", "declined", "expired"]);
const ineligibleReason = z.enum(["disabled", "rollout", "group_member", "no_gym"]);

const weekReview = z.object({
  reviewWeek: z.number(),
  scheduledDays: z.array(z.string()),
  completedDays: z.array(z.string()),
  missedDays: z.array(z.object({ day: z.string(), reason: z.string().nullable() })),
  sessions: z.array(
    z.object({
      day: z.string(),
      exercise: z.string(),
      sets: z.number(),
      avgWeight: z.number(),
      avgReps: z.number(),
      prescribedReps: z.number().nullable(),
      outcome: z.string(),
    }),
  ),
  notes: z.array(z.object({ day: z.string(), label: z.string().nullable(), text: z.string() })),
  recommendations: z.array(
    z.object({
      exercise: z.string(),
      type: z.enum(["increase", "deload", "stale"]),
      message: z.string(),
      increment: z.number().optional(),
    }),
  ),
});

const decideResult = {
  applied: z.array(z.object({ id: z.string(), day })),
  skipped: z.array(z.object({ id: z.string(), day, reason: z.enum(["changed_since_draft", "already_logged"]) })),
};

const missedOffer = z.object({
  id: z.string(),
  week: z.number(),
  fromDay: day,
  toDay: day,
  status: offerStatus,
  expiresAt: isoOrNull,
});

export const responseSchemas: { [O in WorkerOp]: z.ZodType<WorkerResponseMap[O]> } = {
  schedule: z.discriminatedUnion("stop", [
    z.object({ stop: z.literal(true), reason: ineligibleReason }),
    z.object({ stop: z.literal(false), timeZone: z.string(), nextCheckinAt: iso, nextDailyAt: iso }),
  ]),
  review: z.discriminatedUnion("skip", [
    z.object({ skip: z.literal(true), reason: z.enum(["no_next_week", "window_closed", "no_program"]) }),
    z.object({ skip: z.literal(false), reviewWeek: z.number(), targetWeek: z.number(), anchor: iso, review: weekReview }),
  ]),
  draft: z.object({
    checkin: z.object({
      id: z.string().min(1),
      status: checkinStatus,
      reminderAt: isoOrNull,
      expiresAt: isoOrNull,
      changeCount: z.number(),
    }),
    reused: z.boolean(),
  }),
  notify: z.object({
    sent: z.number(),
    skipped: z
      .enum(["already_notified", "no_subscriptions", "not_open", "no_changes", "push_not_configured", "delivery_failed"])
      .optional(),
  }),
  apply: z.object({
    status: z.enum(["applied", "partial", "declined", "failed"]),
    ...decideResult,
    alreadyDecided: z.boolean(),
  }),
  expire: z.object({ status: z.union([checkinStatus, offerStatus]), expired: z.boolean() }),
  missed_check: z.object({
    offer: missedOffer.nullable(),
    created: z.boolean(),
    reason: z
      .enum([
        "rest_day",
        "completed",
        "already_logged",
        "injury_or_illness",
        "no_rest_day",
        "week_boundary",
        "not_current_week",
        "already_handled",
        "no_program",
      ])
      .optional(),
  }),
  missed_apply: z.object({
    status: z.enum(["accepted", "declined"]),
    fromDay: day,
    toDay: day,
    alreadyDecided: z.boolean(),
  }),
};

/** The two variables the worker cannot start without. */
export const workerEnvSchema = z.object({
  SWOLTRACKER_API_URL: z
    .string({ error: "SWOLTRACKER_API_URL is missing." })
    .trim()
    .url("SWOLTRACKER_API_URL must be a URL such as http://localhost:3000.")
    .refine((value) => /^https?:\/\//.test(value), "SWOLTRACKER_API_URL must start with http:// or https://."),
  CHECKIN_WORKER_SECRET: z.string({ error: "CHECKIN_WORKER_SECRET is missing." }).trim().min(1, "CHECKIN_WORKER_SECRET is empty."),
});

/** Temporal connection settings. Empty strings count as unset, like in a half-filled .env. */
const optionalText = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().optional());
export const temporalEnvSchema = z.object({
  TEMPORAL_ADDRESS: optionalText,
  TEMPORAL_NAMESPACE: optionalText,
  TEMPORAL_API_KEY: optionalText,
  CHECKIN_CODEC_KEY: optionalText,
});
