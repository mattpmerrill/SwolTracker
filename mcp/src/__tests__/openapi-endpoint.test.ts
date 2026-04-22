import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from '@bot-native/sdk';
import { buildApp } from '../sdk-adapter.js';
import { createMcpMockSupabase } from './mockSupabase.js';

function buildDoc() {
  const app = buildApp(createMcpMockSupabase() as any);
  return buildOpenApiDocument(app, { serverUrl: 'https://swoltracker.example/api/mcp' });
}

describe('OpenAPI doc — SwolTracker app', () => {
  it('declares OpenAPI 3.1 with the SwolTracker manifest', () => {
    const doc = buildDoc();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('SwolTracker');
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(doc.servers[0].url).toBe('https://swoltracker.example/api/mcp');
  });

  it('exposes every registered MCP tool as /tools/{name}', () => {
    const doc = buildDoc();
    const paths = Object.keys(doc.paths);
    // Spot-check coverage across every scope + category.
    expect(paths).toContain('/tools/get_profile');
    expect(paths).toContain('/tools/save_workout_program');
    expect(paths).toContain('/tools/send_coach_message');
    expect(paths).toContain('/tools/log_set');
    expect(paths).toContain('/tools/normalize_exercise_name');
    expect(paths).toContain('/tools/complete_onboarding');
    // Every registered tool in sdk-adapter.ts becomes one OpenAPI path.
    // Change this if the tool count changes intentionally.
    expect(paths.length).toBeGreaterThanOrEqual(40);
  });

  it('surfaces per-tool scopes on security and x-required-scopes', () => {
    const doc = buildDoc();
    const savePath = doc.paths['/tools/save_workout_program'].post as any;
    expect(savePath.security).toEqual([{ bearerAuth: ['write:program'] }]);
    expect(savePath['x-required-scopes']).toEqual(['write:program']);

    const coach = doc.paths['/tools/send_coach_message'].post as any;
    expect(coach['x-required-scopes']).toEqual(['coach']);

    const readOnly = doc.paths['/tools/get_profile'].post as any;
    expect(readOnly['x-required-scopes']).toEqual(['read']);
  });

  it('utility tools without scopes still attach bearerAuth (empty)', () => {
    const doc = buildDoc();
    const util = doc.paths['/tools/normalize_exercise_name'].post as any;
    expect(util.security).toEqual([{ bearerAuth: [] }]);
    expect(util['x-required-scopes']).toBeUndefined();
  });

  it('inlines Zod schemas as JSON Schema in request bodies', () => {
    const doc = buildDoc();
    const log = doc.paths['/tools/log_set'].post as any;
    const schema = log.requestBody.content['application/json'].schema;
    expect(schema.type).toBe('object');
    expect(schema.properties.exercise_name).toBeDefined();
    expect(schema.properties.exercise_name.type).toBe('string');
    expect(schema.required).toContain('exercise_name');
    expect(schema.required).toContain('exercise_index');
  });

  it('declares AppToolResult + AppToolError + bearerAuth in components', () => {
    const doc = buildDoc();
    expect(doc.components.schemas.AppToolResult).toBeDefined();
    expect(doc.components.schemas.AppToolError).toBeDefined();
    expect((doc.components.securitySchemes as any).bearerAuth.type).toBe('http');
  });
});
