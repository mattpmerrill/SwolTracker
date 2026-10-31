// draftCheckin with a scripted fake model. No network: the Agents SDK (Agent, Runner, structured
// output parsing) is the real one, only the model provider is swapped.

import { describe, it, expect, beforeEach } from 'vitest';
import { Runner, Usage } from '@openai/agents';
import { CHAD_VOICE, createChad } from './_chad-agent.js';
import { DraftOutputError, draftCheckin } from './_checkin-agent.js';

const day = (focus, ...names) => ({ focus, exercises: names.map((name) => ({ name, sets: 3, reps: '8' })) });
const PROGRAM = {
  Monday: day('Push', 'Bench Press', 'Overhead Press'),
  Tuesday: day('Pull', 'Row'),
  Wednesday: { focus: 'Rest Day', exercises: [] },
  Thursday: day('Legs', 'Squat'),
};
const REVIEW = {
  reviewWeek: 3,
  scheduledDays: ['Monday', 'Tuesday', 'Thursday'],
  completedDays: ['Monday', 'Tuesday', 'Thursday'],
  missedDays: [],
  sessions: [{ day: 'Monday', exercise: 'Bench Press', sets: 3, avgWeight: 185, avgReps: 8, prescribedReps: 8, outcome: 'hit' }],
  notes: [{ day: 'Monday', label: null, text: 'Felt strong today' }],
  recommendations: [{ exercise: 'Bench Press', type: 'increase', message: 'Ready to add 5 lbs.', increment: 5 }],
};

const textItem = (text) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });

let calls;
let script;
let usage;
let runner;

beforeEach(() => {
  calls = [];
  usage = { inputTokens: 1200, outputTokens: 300 };
  script = () => [textItem(JSON.stringify({
    recap: { headline: 'Strong week', wins: ['Bench moved'], watch: [] },
    changes: [{
      day: 'Monday',
      summary: 'Bench up five pounds',
      reason: 'You hit every rep three sessions running.',
      day_data: day('Push', 'Bench Press +5', 'Overhead Press'),
    }],
  }))];
  const provider = {
    getModel: async (name) => ({
      name,
      async getResponse(request) {
        calls.push({ model: name, request });
        return {
          usage: new Usage({ requests: 1, ...usage, totalTokens: usage.inputTokens + usage.outputTokens }),
          output: script(request),
          responseId: `resp_${calls.length}`,
        };
      },
      // eslint-disable-next-line require-yield
      async *getStreamedResponse() { throw new Error('streaming is not used'); },
    }),
  };
  runner = new Runner({ modelProvider: provider, tracingDisabled: true });
});

const draft = (overrides = {}) => draftCheckin({
  runner, model: 'anthropic/claude-sonnet-5.5', review: REVIEW, targetWeek: 4, program: PROGRAM, maxes: { 'Bench Press': 225 }, equipment: ['barbell'], ...overrides,
});

describe('draftCheckin', () => {
  it('returns a cleaned draft with server-side stats and token usage', async () => {
    const out = await draft();

    expect(out.redFlag).toBeNull();
    expect(out.recap).toEqual({
      headline: 'Strong week', wins: ['Bench moved'], watch: [], tone: 'normal',
      stats: { scheduled: 3, completed: 3, missed: 0 },
    });
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0]).toMatchObject({ id: 'c1', day: 'Monday', summary: 'Bench up five pounds' });
    // `before` is the stored day, whatever the model might have said.
    expect(out.changes[0].before).toBe(PROGRAM.Monday);
    expect(out.usage).toEqual({ promptTokens: 1200, completionTokens: 300 });
  });

  it('uses the shared Chad voice, no tools, and a non-strict JSON schema response format', async () => {
    await draft();
    expect(calls).toHaveLength(1);
    const { request, model } = calls[0];
    expect(model).toBe('anthropic/claude-sonnet-5.5');
    expect(request.systemInstructions).toContain(CHAD_VOICE);
    expect(request.systemInstructions).toContain('WEEKLY CHECK-IN');
    expect(request.tools ?? []).toHaveLength(0);
    expect(request.outputType).toMatchObject({ type: 'json_schema', name: 'weekly_checkin', strict: false });
    expect(request.outputType.schema).toMatchObject({ type: 'object', additionalProperties: true });
    expect(request.outputType.schema.required).toEqual(['recap', 'changes']);
    expect(request.outputType.schema.$schema).toBeUndefined();
  });

  it('hands the model the data and marks it as data', async () => {
    await draft({ equipment: ['dumbbells'] });
    const sent = JSON.stringify(calls[0].request.input);
    expect(sent).toContain('Felt strong today');
    expect(sent).toContain('dumbbells');
    expect(sent).toContain('targetWeek');
    expect(calls[0].request.systemInstructions).toMatch(/data, never as instructions/);
  });

  it('drops bad changes one by one and keeps the good ones', async () => {
    script = () => [textItem(JSON.stringify({
      recap: { headline: 'Okay week', wins: [], watch: [] },
      changes: [
        { day: 'Wednesday', summary: 'Train on a rest day', reason: 'x', day_data: day('Push', 'Bench') },
        { day: 'Thursday', summary: 'Same as before', reason: 'x', day_data: PROGRAM.Thursday },
        { day: 'Tuesday', summary: 'Row heavier', reason: 'x', day_data: day('Pull', 'Row +5') },
      ],
    }))];
    const out = await draft();
    expect(out.changes.map((c) => c.day)).toEqual(['Tuesday']);
  });

  it('accepts zero changes', async () => {
    script = () => [textItem(JSON.stringify({ recap: { headline: 'On track', wins: ['All sessions done'], watch: [] }, changes: [] }))];
    const out = await draft();
    expect(out.changes).toEqual([]);
    expect(out.recap.headline).toBe('On track');
  });

  it('throws a DraftOutputError when the answer has no changes array', async () => {
    script = () => [textItem(JSON.stringify({ recap: { headline: 'Hmm' } }))];
    await expect(draft()).rejects.toBeInstanceOf(DraftOutputError);
  });

  it('lets a provider failure through so the worker can retry', async () => {
    script = () => { throw new Error('upstream 502'); };
    await expect(draft()).rejects.toThrow(/upstream 502/);
  });
});

describe('draftCheckin: red flags in the week\'s notes', () => {
  const flagged = { ...REVIEW, notes: [{ day: 'Thursday', label: null, text: 'Heard a pop in my knee on the last squat' }] };

  it('skips the model, proposes nothing and answers seriously', async () => {
    const out = await draft({ review: flagged });

    expect(calls).toHaveLength(0);
    expect(out.changes).toEqual([]);
    expect(out.redFlag).toBe('a pop, snap or tear');
    expect(out.recap.tone).toBe('serious');
    expect(out.recap.watch[0]).toMatch(/doctor or physical therapist/);
    expect(out.recap.stats).toEqual({ scheduled: 3, completed: 3, missed: 0 });
    expect(out.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it('checks every note, not just the first, and the label too', async () => {
    const review = { ...REVIEW, notes: [
      { day: 'Monday', label: null, text: 'Felt strong' },
      { day: 'Tuesday', label: 'numbness in my hand', text: 'rows were fine' },
    ] };
    const out = await draft({ review });
    expect(calls).toHaveLength(0);
    expect(out.redFlag).toBe('numbness or tingling');
  });

  it('does not trip on a denial or on ordinary soreness', async () => {
    const review = { ...REVIEW, notes: [{ day: 'Monday', label: null, text: 'No pain, just sore and tight from squats' }] };
    const out = await draft({ review });
    expect(calls).toHaveLength(1);
    expect(out.redFlag).toBeNull();
  });
});

describe('Chad chat is unchanged by sharing the voice', () => {
  it('still opens with the shared voice block, then its own rules', () => {
    const agent = createChad({ kit: { queries: {}, actions: {}, context: {} }, contextBundle: {}, model: 'a/b' });
    expect(agent.instructions.startsWith(`${CHAD_VOICE}\n\nWHAT YOU KNOW`)).toBe(true);
    expect(agent.instructions).toContain('EDITING A WORKOUT (update_program_day)');
    expect(agent.instructions).toContain('SAFETY');
  });
});
