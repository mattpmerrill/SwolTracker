import { describe, it, expect } from 'vitest';
import { createOnboardingTools } from '../tools/onboarding.js';
import { createMcpMockSupabase } from './mockSupabase.js';

const fullProfile = {
  display_name: 'Matt',
  gender: 'male',
  age: 35,
  weight_lbs: 180,
  fitness_goals: ['strength'],
  workout_days: ['Monday', 'Wednesday', 'Friday'],
  workout_duration: '1 hour',
  workout_location: 'home',
  program_start_date: '2026-04-21',
  onboarding_completed: false,
  onboarding_completed_at: null,
};

describe('MCP onboarding contract', () => {
  describe('get_onboarding_status', () => {
    it('returns ready_to_complete when all required fields are set and equipment present', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: fullProfile, error: null });
      sb.respond('gym_equipment.list', { data: [{ name: 'Barbell' }, { name: 'Dumbbells' }], error: null });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.get_onboarding_status();

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.onboarding_completed).toBe(false);
      expect(data.missing_fields).toEqual([]);
      expect(data.ready_to_complete).toBe(true);
      expect(data.equipment).toEqual(['Barbell', 'Dumbbells']);
    });

    it('surfaces missing required fields', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', {
        data: { ...fullProfile, gender: null, age: null, fitness_goals: [] },
        error: null,
      });
      sb.respond('gym_equipment.list', { data: [], error: null });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.get_onboarding_status();

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.missing_fields).toEqual(expect.arrayContaining(['gender', 'age', 'fitness_goals']));
      expect(data.ready_to_complete).toBe(false);
    });

    it('reports completed profile when onboarding_completed is true', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', {
        data: { ...fullProfile, onboarding_completed: true, onboarding_completed_at: '2026-04-01T00:00:00Z' },
        error: null,
      });
      sb.respond('gym_equipment.list', { data: [{ name: 'Barbell' }], error: null });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.get_onboarding_status();

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.onboarding_completed).toBe(true);
      expect(data.ready_to_complete).toBe(false);
      expect(result.message).toContain('already complete');
    });
  });

  describe('update_profile', () => {
    it('writes only provided fields and returns the updated_fields list', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: { ...fullProfile, age: 36, weight_lbs: 185 }, error: null });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.update_profile({ age: 36, weight_lbs: 185 });

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.updated_fields).toEqual(['age', 'weight_lbs']);

      const updateCall = sb.calls.find(([, op]) => op === 'update');
      expect(updateCall).toBeDefined();
      const updatePayload = updateCall?.[2]?.[0];
      expect(updatePayload.age).toBe(36);
      expect(updatePayload.weight_lbs).toBe(185);
      expect(updatePayload.display_name).toBeUndefined();
      expect(updatePayload.updated_at).toBeDefined();
    });

    it('rejects invalid age', async () => {
      const sb = createMcpMockSupabase();
      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.update_profile({ age: -1 })).rejects.toThrow(/age/);
      await expect(tools.update_profile({ age: 200 })).rejects.toThrow(/age/);
    });

    it('rejects empty arrays for list fields', async () => {
      const sb = createMcpMockSupabase();
      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.update_profile({ fitness_goals: [] })).rejects.toThrow(/fitness_goals/);
      await expect(tools.update_profile({ workout_days: [] })).rejects.toThrow(/workout_days/);
    });

    it('rejects malformed program_start_date', async () => {
      const sb = createMcpMockSupabase();
      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.update_profile({ program_start_date: 'tomorrow' })).rejects.toThrow(/YYYY-MM-DD/);
    });

    it('rejects a call with no fields at all', async () => {
      const sb = createMcpMockSupabase();
      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.update_profile({})).rejects.toThrow(/at least one field/);
    });

    it('trims string fields before writing', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: fullProfile, error: null });
      const tools = createOnboardingTools(sb, 'u1');

      await tools.update_profile({ display_name: '  Matt  ', workout_location: ' home ' });
      const updateCall = sb.calls.find(([, op]) => op === 'update');
      const payload = updateCall?.[2]?.[0];
      expect(payload.display_name).toBe('Matt');
      expect(payload.workout_location).toBe('home');
    });
  });

  describe('complete_onboarding', () => {
    it('merges partial params with existing profile and calls the RPC', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: fullProfile, error: null });
      sb.respond('gym_equipment.list', { data: [{ name: 'Barbell' }, { name: 'Bench' }], error: null });
      sb.respond('rpc.complete_onboarding', { data: true, error: null });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.complete_onboarding({ weight_lbs: 190 });

      expect(result.success).toBe(true);
      const rpcCall = sb.calls.find(([t, op]) => t === 'rpc' && op === 'complete_onboarding');
      expect(rpcCall).toBeDefined();
      const args = rpcCall?.[2]?.[0];
      expect(args.p_user_id).toBe('u1');
      expect(args.p_display_name).toBe('Matt');
      expect(args.p_weight_lbs).toBe(190);
      expect(args.p_equipment).toEqual(['Barbell', 'Bench']);
      expect(args.p_program_start_date).toBe('2026-04-21');
    });

    it('throws invalid_args when required fields are missing and not provided', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', {
        data: { ...fullProfile, gender: null, age: null },
        error: null,
      });

      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.complete_onboarding({})).rejects.toThrow(/missing required fields/);
    });

    it('uses passed equipment even when gym already has equipment', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: fullProfile, error: null });
      sb.respond('rpc.complete_onboarding', { data: true, error: null });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.complete_onboarding({
        equipment: ['Dumbbells', 'Pull-Up Bar'],
      });

      expect(result.success).toBe(true);
      const rpcCall = sb.calls.find(([t, op]) => t === 'rpc' && op === 'complete_onboarding');
      expect(rpcCall?.[2]?.[0].p_equipment).toEqual(['Dumbbells', 'Pull-Up Bar']);
    });

    it('throws when no equipment configured and none passed', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: fullProfile, error: null });
      sb.respond('gym_equipment.list', { data: [], error: null });

      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.complete_onboarding({})).rejects.toThrow(/no equipment configured/);
    });

    it('defaults program_start_date to today if neither profile nor params have one', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', {
        data: { ...fullProfile, program_start_date: null },
        error: null,
      });
      sb.respond('rpc.complete_onboarding', { data: true, error: null });

      const tools = createOnboardingTools(sb, 'u1');
      await tools.complete_onboarding({ equipment: ['Barbell'] });

      const rpcCall = sb.calls.find(([t, op]) => t === 'rpc' && op === 'complete_onboarding');
      expect(rpcCall?.[2]?.[0].p_program_start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rejects invalid equipment array', async () => {
      const sb = createMcpMockSupabase();
      const tools = createOnboardingTools(sb, 'u1');
      await expect(tools.complete_onboarding({ equipment: [] })).rejects.toThrow(/equipment/);
    });

    it('propagates RPC errors as a failure ToolResult', async () => {
      const sb = createMcpMockSupabase();
      sb.respond('profiles.single', { data: fullProfile, error: null });
      sb.respond('gym_equipment.list', { data: [{ name: 'Barbell' }], error: null });
      sb.respond('rpc.complete_onboarding', { data: null, error: { message: 'permission denied' } });

      const tools = createOnboardingTools(sb, 'u1');
      const result = await tools.complete_onboarding({});
      expect(result.success).toBe(false);
      expect(result.message).toContain('permission denied');
    });
  });
});
